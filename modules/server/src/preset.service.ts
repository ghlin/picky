import { Injectable, Logger } from '@nestjs/common'
import { Drafting } from '@picky/shared'
import shuffle from 'array-shuffle'
import { readFile } from 'fs/promises'
import { join, normalize } from 'path'
import { range, toString } from 'ramda'
import { AtomDispatch, Dispatcher, DispatchSchema, ForkDispatch, SeqlDispatch } from './dispatching.interface'
import { DSError } from './util'

@Injectable()
export class PresetService {
  logger = new Logger('PresetService')
  pool: Array<{
    pack: number[]
    tags: Record<string, any>
  }> = []
  presets: Record<string, () => DispatchSchema> = {}

  constructor() { this._preparePresets() }

  async loadPoolData() {
    // <root>/modules/server/dist/preset.service.js
    //                          ^ __dirname
    // <root>/modules/server/assets/pool.json
    const pooldatapath = normalize(join(__dirname, '..', 'assets', 'pool.json'))
    this.logger.log(`loading pool data from ${pooldatapath}`)

    const data: Array<{
      id: number, tags: Record<string, boolean>
    }> = await readFile(pooldatapath).then(toString).then(JSON.parse)

    for (const { id, tags } of data) {
      this.pool.push({ pack: [id], tags })
    }
  }

  async list() {
    return [
      {
        id:   'chaos_draft',
        name: 'CHAOS DRAFT !!!',
        description: '基本上能拍出来的卡都在里面 (轮抓)'
      },
      {
        id:   'chaos',
        name: 'CHAOS !!!',
        description: '基本上能拍出来的卡都在里面 (主卡组现开)'
      }
    ] as Drafting.DraftRoomPreset[]
  }

  /** preset id -> schema */
  async getDispatchSchema(id: string): Promise<DispatchSchema> {
    const mkschema = this.presets[id]
    if (!mkschema) { throw new DSError('NOT_FOUND', `schema: ${id}`) }
    return mkschema()
  }

  _filter(dups: number, ...tags: string[]) {
    return bytags(this.pool, dups, ...tags)
  }

  _preparePresets() {
    this.presets.chaos_draft = () => {
      const init = sealed(
        SimplePool.create('I', { pool: this._filter(1, 'MAIN', 'Gen', 'T00'), n: 3 }), 1, 1)
      const mainpool = SimplePool.create('M',
        {
          n: 1, pool: [
            ...this._filter(1, 'MAIN', 'Gen', 'T05'),
            ...this._filter(1, 'MAIN', 'Gen', 'T10'),
          ]
        },
        {
          n: 2, pool: this._filter(1, 'MAIN', 'Gen', 'T15')
        },
        {
          n: 4, pool: [
            ...this._filter(3, 'MAIN', 'Gen', 'T20'),
            ...this._filter(1, 'MAIN', 'Gen', 'T*'),
          ]
        },
        {
          n: 1, pool: [
            ...this._filter(1, 'MAIN', 'Spec', 'T05'),
            ...this._filter(2, 'MAIN', 'Spec', 'T10'),
            ...this._filter(1, 'MAIN', 'Spec', 'T15'),
            ...this._filter(3, 'MAIN', 'Spec', 'T20'),
            ...this._filter(1, 'MAIN', 'Spec', 'T*'),
          ]
        })

      const main = range(0, 6).map(() => draft(mainpool, [1, 1, 1, 1]))
      const expool = SimplePool.create('E',
        {
          n: 3, pool: [
            ...this._filter(1, 'EXTRA', 'LINK', 'Gen', 'T00'),
            ...this._filter(2, 'EXTRA', 'LINK', 'Gen', 'T05'),
            ...this._filter(1, 'EXTRA', 'LINK', 'Gen', 'T15'),
            ...this._filter(3, 'EXTRA', 'LINK', 'Gen', 'T20'),
            ...this._filter(1, 'EXTRA', 'LINK', 'Gen', 'T*'),
          ]
        },
        {
          n: 3, pool: [
            ...this._filter(1, 'EXTRA', 'SYNCHRO', 'Gen', 'T00'),
            ...this._filter(2, 'EXTRA', 'SYNCHRO', 'Gen', 'T05'),
            ...this._filter(1, 'EXTRA', 'SYNCHRO', 'Gen', 'T15'),
            ...this._filter(3, 'EXTRA', 'SYNCHRO', 'Gen', 'T20'),
            ...this._filter(1, 'EXTRA', 'SYNCHRO', 'Gen', 'T*'),
          ]
        },
        {
          n: 3, pool: [
            ...this._filter(1, 'EXTRA', 'XYZ', 'Gen', 'T00'),
            ...this._filter(2, 'EXTRA', 'XYZ', 'Gen', 'T05'),
            ...this._filter(1, 'EXTRA', 'XYZ', 'Gen', 'T15'),
            ...this._filter(3, 'EXTRA', 'XYZ', 'Gen', 'T20'),
            ...this._filter(1, 'EXTRA', 'XYZ', 'Gen', 'T*'),
          ]
        })
      const ex = range(0, 3).map(() => draft(expool, [1, 1, 1]))
      return fork(init, ...main, ...ex)
    }

    this.presets.chaos = () => {
      const init = sealed(
        SimplePool.create('I', { pool: this._filter(1, 'MAIN', 'Gen', 'T00'), n: 3 }), 1, 1)
      const main = sealed(
        SimplePool.create('M',
          {
            n: 4, pool: this._filter(1, 'MAIN', 'Gen', 'T05')
          },
          {
            n: 4, pool: this._filter(1, 'MAIN', 'Gen', 'T10')
          },
          {
            n: 8, pool: this._filter(1, 'MAIN', 'Gen', 'T15')
          },
          {
            n: 24, pool: [
              ...this._filter(3, 'MAIN', 'Gen', 'T20'),
              ...this._filter(1, 'MAIN', 'Gen', 'T*'),
            ]
          },
          {
            n: 12, pool: [
              ...this._filter(1, 'MAIN', 'Spec', 'T05'),
              ...this._filter(2, 'MAIN', 'Spec', 'T10'),
              ...this._filter(1, 'MAIN', 'Spec', 'T15'),
              ...this._filter(3, 'MAIN', 'Spec', 'T20'),
              ...this._filter(1, 'MAIN', 'Spec', 'T*'),
            ]
          }
        ),
        23, 26)
      const expool = SimplePool.create('E',
        {
          n: 3, pool: [
            ...this._filter(1, 'EXTRA', 'LINK', 'Gen', 'T00'),
            ...this._filter(2, 'EXTRA', 'LINK', 'Gen', 'T05'),
            ...this._filter(1, 'EXTRA', 'LINK', 'Gen', 'T15'),
            ...this._filter(3, 'EXTRA', 'LINK', 'Gen', 'T20'),
            ...this._filter(1, 'EXTRA', 'LINK', 'Gen', 'T*'),
          ]
        },
        {
          n: 3, pool: [
            ...this._filter(1, 'EXTRA', 'SYNCHRO', 'Gen', 'T00'),
            ...this._filter(2, 'EXTRA', 'SYNCHRO', 'Gen', 'T05'),
            ...this._filter(1, 'EXTRA', 'SYNCHRO', 'Gen', 'T15'),
            ...this._filter(3, 'EXTRA', 'SYNCHRO', 'Gen', 'T20'),
            ...this._filter(1, 'EXTRA', 'SYNCHRO', 'Gen', 'T*'),
          ]
        },
        {
          n: 3, pool: [
            ...this._filter(1, 'EXTRA', 'XYZ', 'Gen', 'T00'),
            ...this._filter(2, 'EXTRA', 'XYZ', 'Gen', 'T05'),
            ...this._filter(1, 'EXTRA', 'XYZ', 'Gen', 'T15'),
            ...this._filter(3, 'EXTRA', 'XYZ', 'Gen', 'T20'),
            ...this._filter(1, 'EXTRA', 'XYZ', 'Gen', 'T*'),
          ]
        })
      const ex = range(0, 3).map(() => draft(expool, [1, 1, 1]))
      return fork(init, main, ...ex)
    }
  }
}

class SimplePool {
  static create(prefix: string, ...sources: Array<{ pool: number[][]; n: number }>) {
    return new SimplePool(prefix, sources.map(({ pool, n }) => ({ items: shuffle(pool), n })))
  }

  constructor(
    readonly prefix:  string,
    readonly sources: Array<{ items: number[][]; n: number }>
  ) {}

  next() {
    return this.sources.flatMap(({ items, n }, idx) => {
      const candidates = items.splice(0, n)
      return candidates.map((pack, i) => ({
        id: this.prefix + '.' + idx + '.' + (items.length + i), pack
      }))
    })
  }
}

class SimpleDraftDispatcher implements Dispatcher {
  constructor(
    readonly pool:   SimplePool,
    readonly shifts: number[]
  ) {}

  async dispatch(n: number) {
    const candidates = range(0, n).map(() => this.pool.next())
    return {
      tag:        'draft_dispatching' as const,
      shifts:     this.shifts,
      dispatches: candidates
    }
  }
}

class SimpleSealedDispatcher implements Dispatcher {
  constructor(
    readonly pool:   SimplePool,
    readonly npicks: { min: number; max: number }
  ) {}

  async dispatch(n: number) {
    const candidates = range(0, n).map(() => this.pool.next())

    return {
      tag:        'sealed_dispatching' as const,
      npicks:     this.npicks,
      dispatches: candidates
    }
  }
}

function fork(...children: DispatchSchema[]): ForkDispatch {
  return { tag: 'fork_dispatch', children }
}

function seql(...children: DispatchSchema[]): SeqlDispatch {
  return { tag: 'seql_dispatch', children }
}

function draft(pool: SimplePool, shifts: number[]): AtomDispatch {
  return { tag: 'atom_dispatch', dispatcher: new SimpleDraftDispatcher(pool, shifts) }
}

function sealed(pool: SimplePool, min: number, max: number): AtomDispatch {
  return { tag: 'atom_dispatch', dispatcher: new SimpleSealedDispatcher(pool, { min, max }) }
}

function bytags(
  pool:    Array<{ pack: number[]; tags: Record<string, boolean> }>,
  dups:    number,
  ...tags: string[]
) {
  return pool.filter(i => tags.every(t => i.tags[t])).map(i => i.pack).flatMap(pack => [...new Array(dups)].map(() => pack))
}

void fork, seql, draft, sealed
