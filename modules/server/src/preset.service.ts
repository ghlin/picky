import { Injectable, Logger } from '@nestjs/common'
import { atoi10, CTYPES, defined, Drafting, MATTRIBUTES, MTYPES, Preset, tuple, YGOPROCardInfo } from '@picky/shared'
import { DispatchMode } from '@picky/shared/src/preset'
import { randomInt } from 'crypto'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { groupBy, identity, pick, range } from 'ramda'
import YAML from 'yaml'
import { Dispatcher, DispatchingPreset, DispatchSchema } from './dispatching.interface'

@Injectable()
export class PresetService {
  logger  = new Logger('PresetService')
  presets = new Map<string, DispatchingPreset>()
  pools   = new Map<string, Preset.Pool>()
  db      = new Map<number, YGOPROCardInfo>()

  initialized = this.loadDB().then(() => this.loadPools()).then(() => this.loadPresets())

  async loadDB() {
    const dbfile  = join(G_CONFIG.dirs?.assets ?? join(__dirname, '..', 'assets'), 'db.json')
    const entries = await readFile(dbfile).then(c => JSON.parse(c.toString()))
    const tykeys  = Object.keys(CTYPES)

    for (const entry of entries) {
      this.db.set(entry.id, {
        ...entry,
        types: tykeys.filter(k => entry['_' + k])
      })
    }

    this.logger.log(`${this.db.size} entries loaded`)
  }

  async loadPresets() {
    const presetdir = G_CONFIG.dirs?.preset ?? join(__dirname, '..', 'assets', 'presets')
    const files     = await readdir(presetdir)

    for (const file of files) {
      try {
        const template = await loadYAMLDispatchSchema(join(presetdir, file))

        const preset = ('_type' in template)
          ? this.createFromProgressive(template)
          : this.createFromTemplate(template)

        this.presets.set(preset.id, preset)
      } catch (e) {
        this.logger.error(`loadPresets: failed to load/parse/build preset: ${file}`)
        this.logger.error(e)
        this.logger.error(e.stack)
      }
    }
  }

  async loadPools() {
    const pooldir = G_CONFIG.dirs?.pool ?? join(__dirname, '..', 'assets', 'pools')
    const files   = await readdir(pooldir)

    for (const file of files) {
      try {
        const content = await readFile(join(pooldir, file))
        const pool    = JSON.parse(content.toString()) as Preset.Pool

        if (this.pools.has(pool.id)) {
          this.logger.warn(`loadPools: duplicated id ${pool.id}`)
        }

        this.pools.set(pool.id, pool)
        this.logger.log(`loadPools: loaded pool [${pool.id} - ${pool.name}]: ${pool.items.length} items`)
      } catch (e) {
        this.logger.error(`loadPools: failed to load/parse pool: ${file}`)
        this.logger.error(e)
        this.logger.error(e.stack)
      }
    }
  }

  createFromProgressive(template: YAMLProgressiveDispatchSchema) {
    const links = new Map<number, Array<{
      expects: string
      hints:   string[]
      predict: (code: number) => boolean
    }>>()

    const lfilters = groupBy(l => l.id.toString(), template.links.map(
      link => {
        const l = compileLink(link.expects)

        if (Object.values(l.context).every(f => f.length === 0)) {
          return undefined
        }

        return { filter: l.filter, id: link.id, expects: link.expects, hints: l.hints }
      }
    ).filter(defined))

    for (const [idstr, filters] of Object.entries(lfilters)) {
      const id = atoi10(idstr)!
      links.set(id, filters.map(f => ({
          expects: f.expects,
          hints:   f.hints,
          predict: code => {
            const info = this.db.get(code)
            if (!info) { return false }
            return filters.some(f => f.filter(info))
          }
        }
      )))
    }

    const gfilter = mkFilter(mkArray(template.filter))
    const items   = template.pools
      .flatMap(p => this.pools.get(p)?.items ?? [])
      .filter(item => Preset.matchTags(item.tags, gfilter))

    const schema: DispatchSchema = {
      tag:      'seql_dispatch',
      children: template.rounds.flatMap(r => range(0, r.repeats ?? 1).map(() => r)).map((round, idx)=> {
        const config = {
          items,
          links,
          deals: round.deals.map(d => {
            const dfilter = mkArray(d.filter)
            const islink  = dfilter.some(s => s === '_link')
            const filter  = dfilter.filter(s => s !== '_link')
            const fallback = mkArray(d.fallback ?? [])
            return { n: d.n, islink, filter, fallback, rawfilter: dfilter }
          })
        }
        this.logger.log(`${template.id}: round ${idx + 1}`)

        for (const d of config.deals) {
          const pairs = Object.entries(groupBy(identity, d.rawfilter))
          const src   = pairs.map(([expr, r]) => r.length > 1 ? expr + ' × ' + r.length : expr).join(' + ')
          this.logger.log(`  ${d.n} from ${src} (islink: ${d.islink})`)
        }

        const dispatcher = new ProgressiveDispatcher(config)
        return { tag: 'atom_dispatch', dispatcher }
      })
    }

    return {
      id:          template.id,
      name:        template.name,
      description: template.description,
      schema
    }
  }

  createFromTemplate(template: Preset.YAMLDispatchSchema) {
    const schema   = this._fromTemplate(template)
    return {
      id:          template.id,
      name:        template.name,
      description: template.description,
      schema
    }
  }

  list() {
    return Array.from(this.presets.values()).map(pick(['id', 'name', 'description']))
  }

  _makeDealDispatcher(
    root:    Preset.YAMLDispatchSchema,
    segment: Preset.Deal<string | string[]>,
    path:    string
  ) {
    this.logger.debug(`Dispatcher from ${root.id} (${root.name}) - ${path}: ${segment.mode}, ${
      segment.mode === 'draft' ? segment.shifts.join('/') : [segment.minpicks, segment.maxpicks].join('~')
    } [${root.filter ?? '<no filter>'} & ${segment.filter ?? '<no filter>'}]`)

    const rfilter = root.filter    ? Preset.parseTagFilterExpr(root.filter)    : undefined
    const sfilter = segment.filter ? Preset.parseTagFilterExpr(segment.filter) : undefined

    const copies  = Object.fromEntries(root.uses.map(u => [u.alias, 1]))

    const deal: Preset.Deal<DealContext> = {
      ...segment,
      segments: segment.segments.map((p, i) => {
        this.logger.debug(`+ segments[${i}]: [${p.filter ?? '<no filter>'}]`)
        const pfilter = p.filter ? Preset.parseTagFilterExpr(p.filter) : undefined

        const candidates = p.candidates.map((c, j) => {
          this.logger.debug(`| + candidates[${j}]: rate ${c.rate}`)
          const parts = c.parts.map((d, k) => {
            const uses = Object.entries(d.copies ?? copies).flatMap(([alias, copies]) => {
              const id = root.uses.find(u => u.alias === alias)?.pool
              if (!id) { throw new Error(`no pool alias: ${alias}`) }
              const pool = this.pools.get(id)
              if (!pool) { throw new Error(`no pool: ${id} (alias: ${alias})`) }

              return range(0, copies).flatMap(() => [...pool.items])
            })

            const config = {
              ...d.config        ?? {},
              ...p.configs       ?? {},
              ...segment.configs ?? {},
              ...root.configs    ?? {}
            }

            const fexprs  = Array.isArray(d.filter) ? d.filter : [d.filter]
            const filters = fexprs.map(Preset.parseTagFilterExpr).map(f => d.fixed ? f : { t: 'every' as const, value: [rfilter, sfilter, pfilter, f].filter(defined) })
            const fpath   = join(path, 'segments', i.toString(), 'candidates', j.toString(), 'parts', k.toString())
            const items   = filters.flatMap(filter => uses.filter(item => Preset.matchTags(item.tags, filter)))

            if (!d.fixed && items.length < d.n * 5) {
              throw new Error(`No enough items: ${fpath}, filter(s) ${fexprs.join('; ')} (${items.length} - ${d.n})`)
            }
            const pool  = new SimplePool(items, { ...config, fixed: d.fixed })
            const pairs = Object.entries(groupBy(identity, fexprs))
            const src   = pairs.map(([expr, r]) => r.length > 1 ? expr + ' × ' + r.length : expr).join(' + ')
            const label = d.n + ' from ' + src

            this.logger.debug(`| |   ${label}`)

            return { ...d, filter: { pool, label, path: fpath } }
          })

          const ncandidates = parts.reduce((sum, p) => sum + p.n, 0)
          this.logger.debug(`| \`- ... ${ncandidates} candidates`)

          return { ...c, parts, ncandidates }
        })

        this.logger.debug(`\`- ... ${[... new Set(candidates.map(c => c.ncandidates))].join('/')} candidates`)
        return { ...p, candidates }
      })
    }

    return new DealDispatcher(deal)
  }

  private _makeFixedDispatcher(
    root:    Preset.YAMLDispatchSchema,
    segment: Preset.Fixed,
    path:    string
  ) {
    this.logger.debug(`FixedDispatcher from ${root.id} (${root.name}) - ${path}: ${segment.mode}, ${
      segment.mode === 'draft' ? segment.shifts.join('/') : [segment.minpicks, segment.maxpicks].join('~')
    }`)

    if (typeof segment.items === 'string') {
      const pools  = root.uses.map(p => this.pools.get(p.pool)).filter(defined)
      const filter = Preset.parseTagFilterExpr(segment.items)
      const items  = pools.flatMap(p => p.items.filter(item => Preset.matchTags(item.tags, filter)))
      return new FixedDispatcher(segment, items.flatMap(item => item.pack))
    } else {
      return new FixedDispatcher(segment, segment.items)
    }
  }

  private _fromTemplate(root: Preset.YAMLDispatchSchema): DispatchSchema {
    return root.patterns.length === 1
      ? this._makeSchema(root, root.patterns[0], '<root>')
      : this._makeSchema(root, { fork: root.patterns }, '<root>')
  }

  private _makeSchema(
    root:    Preset.YAMLDispatchSchema,
    pattern: Preset.DispatchPattern<string | string[]>,
    path:    string
  ): DispatchSchema {
    if (`fork` in pattern) {
      return {
        tag:      'fork_dispatch',
        children: pattern.fork.map((p, i) => this._makeSchema(root, p, join(path, 'fork', i.toString())))
      }
    }

    if (`seql` in pattern) {
      return {
        tag:      'seql_dispatch',
        children: pattern.seql.map((p, i) => this._makeSchema(root, p, join(path, 'seql', i.toString())))
      }
    }

    if (`items` in pattern) {
      const dispatcher = this._makeFixedDispatcher(root, pattern, path)
      return { tag: 'atom_dispatch', dispatcher }
    }

    const dispatcher = this._makeDealDispatcher(root, pattern, path)
    const atom = { tag: 'atom_dispatch' as const, dispatcher }

    const { fork, seql } = (pattern.repeats ?? { fork: 0, seql: 0 }) as any
    return fork ? { tag: 'fork_dispatch', children: range(0, fork).map(() => atom) }
         : seql ? { tag: 'seql_dispatch', children: range(0, seql).map(() => atom) }
         : atom
  }
}

class SimplePool {
  constructor(
    readonly items:  Preset.PoolItem[],
    readonly config: Partial<Preset.DispatchConfig & { fixed?: boolean }>
  ) {}

  deal(n: number) {
    const items = this._deal(n)

    return this.config?.bundle === 'free'
      ? items.flatMap(item => item.pack.map(id => ({ ...item, pack: [id] })))
      : items
  }

  _deal(n: number) {
    if (this.config.fixed) { return this.items }

    if (!this.config?.uniq) {
      return range(0, n).map(() => this.items[randomInt(this.items.length)])
    }

    const rolls   = [] as Preset.PoolItem[]
    const uniques = new Set<number>()

    while (rolls.length < n) {
      const roll = randomInt(this.items.length)
      const item = this.items[roll]

      if (item.pack.some(code => uniques.has(code))) {
        continue
      }

      for (const code of item.pack) {
        uniques.add(code)
      }

      rolls.push(item)
    }

    return rolls
  }
}

interface DealContext {
  path:  string
  label: string
  pool:  SimplePool
}

class DealDispatcher implements Dispatcher {
  logger   = new Logger(`DealDispatcher`)
  segments = this.deal.segments.map(p => {
    const roll    = makeSkip(p.candidates.map(c => c.rate))
    return { ...p, roll }
  })

  constructor(readonly deal: Preset.Deal<DealContext>) { }

  async dispatch(players: unknown[]) {
    const dispatches = range(0, players.length).map(() =>
      this.segments.flatMap(pattern => this._dispatchPattern(pattern))
      .map((item, idx) => ({ id: ':' + idx, pack: item.pack })))

    return this.deal.mode === 'sealed' ? {
      tag:    'sealed_dispatching' as const,
      npicks: { min: this.deal.minpicks, max: this.deal.maxpicks },
      dispatches
    } : {
      tag:    'draft_dispatching' as const,
      shifts: this.deal.shifts,
      dispatches
    }
  }

  _deal(candidates: DealDispatcher['segments'][number]['candidates'][number]) {
    return candidates.parts.flatMap(part => part.filter.pool.deal(part.n))
  }

  _dispatchPattern(pattern: DealDispatcher['segments'][number]) {
    const idx       = rollIdx(pattern.roll)
    const candidate = pattern.candidates[idx]
    this.logger.debug(
      `_dispatchPattern: rolled ${idx} - ${candidate.parts.map(p => p.filter.label).join('; ')}`
    )
    return this._deal(candidate)
  }
}

class FixedDispatcher implements Dispatcher {
  logger = new Logger(`FixedDispatcher`)

  constructor(readonly conf: DispatchMode, readonly items: number[]) { }

  async dispatch(players: unknown[]) {
    const dispatches = range(0, players.length).map(() =>
      this.items.map((id, idx) => ({ pack: [id], id: ':' + idx }))
    )

    return this.conf.mode === 'sealed' ? {
      tag:    'sealed_dispatching' as const,
      npicks: { min: this.conf.minpicks, max: this.conf.maxpicks },
      dispatches
    } : {
      tag:    'draft_dispatching' as const,
      shifts: this.conf.shifts,
      dispatches
    }
  }
}

async function loadYAMLDispatchSchema(path: string) {
  const content = await readFile(path)
  const data    = YAML.parse(content.toString(), { merge: true, prettyErrors: true })

  return data as Preset.YAMLDispatchSchema | YAMLProgressiveDispatchSchema
}

interface Roll {
  totalrate: number
  skips:     number[]
}

function rollIdx(roll: Roll) {
  const dice = randomInt(roll.totalrate)
  return roll.skips.findIndex(skip => dice < skip)
}

function makeSkip(rates: number[]) {
  let totalrate = 0
  const skips = rates.map(() => 0)
  for (let i = 0; i !== rates.length; ++i) {
    skips[i] = (totalrate += rates[i])
  }
  return { totalrate, skips }
}

export interface YAMLProgressiveDispatchSchema {
  _type:       'progressive'
  id:          string
  name:        string
  description: string
  pools:       string[]
  filter:      string | []

  links:  Array<{
    id:      number
    expects: string
  }>

  rounds: Array<{
    repeats?: number
    deals: Array<{
      n:      number
      fallback: string | string[]
      filter: '_link'
            | string
            | ['_link', ...string[]]
            | string[]
    }>
  }>
}

export interface ProgressiveDispatcherConfig {
  items: Preset.PoolItem[]
  links: Map<number, Array<{
    expects: string
    hints:   string[]
    predict: (code: number) => boolean
  }>>
  deals: Array<{
    n:        number
    islink:   boolean
    filter:   string[]
    fallback: string[]
  }>
}

function mkArray(s: string | string[]) {
  return Array.isArray(s) ? s : [s]
}

function mkFilter(s: string[]): Preset.TagFilterExpr {
  return s.length === 1 ? Preset.parseTagFilterExpr(s[0]) : {
    t: 'every',
    value: s.map(Preset.parseTagFilterExpr)
  }
}

export function compileLink(src: string) {
  const filters = src.split(' ')
  const tfilters = filters.filter(f => f.startsWith('TYPE_')).map(f => f.slice('TYPE_'.length))
  const rfilters = filters.filter(f => f.startsWith('RACE_')).map(f => f.slice('RACE_'.length))
  const afilters = filters.filter(f => f.startsWith('ATTRIBUTE_')).map(f => f.slice('ATTRIBUTE_'.length))

  const vkeys = ['LEVEL', 'ATK', 'DEF'] as const
  const ops   = ['LT', 'GT', 'EQ'] as const
  const vfilters = vkeys.flatMap(vk => ops.flatMap(opk => {
    const prefix = `MATCH_${vk}_${opk}_`
    const fs     = filters.filter(f => f.startsWith(prefix)).map(f => f.slice(prefix.length))
    return fs.map(atoi10).filter(defined).map(val => tuple(vk, opk, val))
  }))

  const filter = (info: YGOPROCardInfo) => {
    for (const tf of tfilters) {
      if (!info.types.includes(tf as any)) {
        return false
      }
    }
    for (const rf of rfilters) {
      if (info.mtype !== (MTYPES as any)[rf]) {
        return false
      }
    }
    for (const af of afilters) {
      if (info.mattribute !== (MATTRIBUTES as any)[af]) {
        return false
      }
    }
    for (const [vk, opk, val] of vfilters) {
      const key = vk === 'DEF' ? 'mdef' : vk === 'ATK' ? 'matk' : 'mlevel'
      const lhs = info[key]
      if (opk === 'EQ' && lhs !== val) { return false }
      if (opk === 'LT' && lhs >   val) { return false }
      if (opk === 'GT' && lhs <   val) { return false }
    }

    return true
  }

  const hints = tfilters.concat(rfilters).concat(afilters).concat(vfilters.map(([k, o, v]) => {
    const rel = o === 'GT' ? '>=' : o === 'LT' ? '<=' : '=='
    return k + rel + v
  }))

  return { filter, hints, context: { tfilters, rfilters, afilters, vfilters } }
}

export class ProgressiveDispatcher implements Dispatcher {
  logger = new Logger('ProgressiveDispatcher')
  deals  = this.config.deals.map(d => {
    const filters   = d.filter.map(Preset.parseTagFilterExpr)
    const items     = filters.flatMap(f => this.config.items.filter(item => Preset.matchTags(item.tags, f)))
    const ffilters  = d.fallback.map(Preset.parseTagFilterExpr)
    const fallbacks = ffilters.flatMap(f => this.config.items.filter(item => Preset.matchTags(item.tags, f)))
    return { ...d, items, fallbacks }
  })

  constructor(
    readonly config: ProgressiveDispatcherConfig
  ) {
  }

  async dispatch(players: Array<{
    id:     number
    picked: Drafting.PickCandidate[]
  }>) {
    return {
      tag:        'sealed_dispatching' as const,
      npicks:     { min: 1, max: 1 },
      dispatches: players.map(
        p => this._dispatch(p.picked).map((item, idx) => this._attachMeta(':' + idx, item.pack))
      )
    }
  }

  private _dispatch(ctx: Drafting.PickCandidate[]) {
    const spec = this._filtersFromPicked(ctx)

    const candidates = this.deals.flatMap(d => {
      const items = !(d.islink && spec.length) ? d.items : spec.flatMap(pred => {
        const subpoolitems = d.items.filter(i => i.pack.some(pred.predict))
        this.logger.debug(`_dispatch.flatmap: ${pred.expects} selects ${subpoolitems.length} items (limit to 15)`)

        return subpoolitems.length <= 15 ? subpoolitems : new SimplePool(subpoolitems, { }).deal(15)
      })

      this.logger.debug(`_dispatch: poolsize (pass 1) ${items.length}`)
      const uses = items.length < 50 ? new SimplePool(d.fallbacks, { uniq: true }).deal(50 - items.length).concat(items) : items

      this.logger.debug(`_dispatch: poolsize (pass 2) ${uses.length}`)
      const pool = new SimplePool(uses, {})

      return pool.deal(d.n)
    })

    return candidates
  }

  private _attachMeta(id: string, pack: number[]) {
    const linked = pack.flatMap(code => this.config.links.get(code) ?? [])
    const hint   = linked.map(l => 'reveals: ' + l.hints.join(' & '))
    return linked.length === 0 ? { id, pack } : { id, pack, meta: { desc: hint.join('\n') } }
  }

  private _filtersFromPicked(ctx: Drafting.PickCandidate[]) {
    return ctx.flatMap(c => c.pack).flatMap(c => this.config.links.get(c) ?? [])
  }
}
