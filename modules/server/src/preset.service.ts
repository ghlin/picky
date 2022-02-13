import { Injectable, Logger } from '@nestjs/common'
import { Preset } from '@picky/shared'
import { randomInt } from 'crypto'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { pick, range } from 'ramda'
import YAML from 'yaml'
import { Dispatcher, DispatchingPreset, DispatchSchema } from './dispatching.interface'

@Injectable()
export class PresetService {
  logger  = new Logger('PresetService')
  presets = new Map<string, DispatchingPreset>()
  pools   = new Map<string, Preset.Pool>()

  initialized = this.loadPools().then(() => this.loadPresets())

  async loadPresets() {
    const presetdir = G_CONFIG.dirs?.preset ?? join(__dirname, '..', 'assets', 'presets')
    const files     = await readdir(presetdir)

    for (const file of files) {
      try {
        const template = await loadYAMLDispatchSchema(join(presetdir, file))
        const schema   = this._fromTemplate(template)
        const preset: DispatchingPreset = {
          id:          template.id,
          name:        template.name,
          description: template.description,
          schema
        }
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

  list() {
    return Array.from(this.presets.values()).map(pick(['id', 'name', 'description']))
  }

  _makeDealDispatcher(
    root:    Preset.YAMLDispatchSchema,
    pattern: Preset.Deal<string>,
    path:    string
  ) {
    this.logger.debug(`_makeDealDispatcher - ${path}`)

    const copies = Object.fromEntries(root.uses.map(u => [u.alias, 1]))
    const deal: Preset.Deal<DealContext> = {
      ...pattern,
      patterns: pattern.patterns.map((p, i) => {
        const compose = p.compose.map((c, j) => {
          const parts = c.parts.map((d, k) => {
            const uses = Object.entries(d.copies ?? copies).flatMap(([alias, copies]) => {
              const id = root.uses.find(u => u.alias === alias)?.pool
              if (!id) { throw new Error(`no pool alias: ${alias}`) }
              const pool = this.pools.get(id)
              if (!pool) { throw new Error(`no pool: ${id} (alias: ${alias})`) }

              return range(0, copies).flatMap(() => [...pool.items])
            })

            const filter = Preset.parseTagFilterExpr(d.filter)
            const items  = uses.filter(item => Preset.matchTags(item.tags, filter))
            const fpath  = join(path, 'patterns', i.toString(), 'compose', j.toString(), 'parts', k.toString())

            if (items.length < d.n * 5) {
              throw new Error(`No enough items: ${fpath}, filter ${d.filter} (${items.length} - ${d.n})`)
            }

            const config = {
              ...d.config        ?? {},
              ...p.configs       ?? {},
              ...pattern.configs ?? {},
              ...root.configs    ?? {}
            }
            const pool  = new SimplePool(items, config.uniq ?? false)
            const label = d.filter + ' × ' + d.n
            return { ...d, filter: { pool, label, path: fpath } }
          })

          const labels = parts.map(d => d.filter.label).join('; ')
          this.logger.debug(`${root.name} - ${path}: [rate ${c.rate}]: ${labels}`)

          return { ...c, parts }
        })

        return { ...p, compose }
      })
    }

    return new DealDispatcher(deal)
  }

  private _fromTemplate(root: Preset.YAMLDispatchSchema): DispatchSchema {
    return root.patterns.length === 1
      ? this._makeSchema(root, root.patterns[0], '<root>')
      : this._makeSchema(root, { fork: root.patterns }, '<root>')
  }

  private _makeSchema(
    root:    Preset.YAMLDispatchSchema,
    pattern: Preset.DispatchPattern<string>,
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
    readonly items: Preset.PoolItem[],
    readonly uniq:  boolean
  ) {}

  deal(n: number) {
    if (!this.uniq) {
      return range(0, n).map(() => this.items[randomInt(this.items.length)])
    }

    const uniques = new Set<number>()
    while (uniques.size < n) {
      uniques.add(randomInt(this.items.length))
    }

    return Array.from(uniques.values()).map(i => this.items[i])
  }
}

interface DealContext {
  path:  string
  label: string
  pool:  SimplePool
}

class DealDispatcher implements Dispatcher {
  logger    = new Logger(`DealDispatcher`)

  patterns = this.deal.patterns.map(p => {
    const roll    = makeSkip(p.compose.map(c => c.rate))
    return { ...p, roll }
  })

  constructor(readonly deal: Preset.Deal<DealContext>) { }

  async dispatch(nplayer: number) {
    const dispatches = range(0, nplayer).map(() =>
      this.patterns.flatMap(pattern => this._dispatchPattern(pattern))
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

  _dispatchCompose(compose: DealDispatcher['patterns'][number]['compose'][number]) {
    return compose.parts.flatMap(part => part.filter.pool.deal(part.n))
  }

  _dispatchPattern(pattern: DealDispatcher['patterns'][number]) {
    const idx     = rollIdx(pattern.roll)
    const compose = pattern.compose[idx]
    this.logger.debug(
      `_dispatchPattern: rolled ${idx} - ${compose.parts.map(p => p.filter.label).join('; ')}`
    )
    return this._dispatchCompose(compose)
  }
}

async function loadYAMLDispatchSchema(path: string) {
  const content = await readFile(path)
  const data    = YAML.parse(content.toString(), { merge: true, prettyErrors: true })

  return data as Preset.YAMLDispatchSchema
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
