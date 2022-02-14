export type CardID = number
export interface PoolItem {
  pack: CardID[]
  tags: string[]
}

export interface Pool {
  id:    string
  name:  string
  items: PoolItem[]
}

export interface UsePool { pool: string; alias: string }
export type DealPart<F> = {
  copies?: Record<string, number>
  config?: Partial<DispatchConfig>

  n:       number;
  filter:  F;
}
export interface DispatchConfig {
  bundle: 'free' | 'whole' // defaults to 'whole'
  uniq:   boolean          // defaults to 'false'
}
export type PartialDispatchConfig = Partial<DispatchConfig>
export type DispatchConfigs       = Record<string, PartialDispatchConfig>

export type DispatchMode = { mode: 'draft';  shifts: number[] }
                         | { mode: 'sealed'; minpicks: number; maxpicks: number }

export type DealSegment<F> = {
  configs?: DispatchConfigs
  copies?:  Record<string, number>

  candidates: Array<{
    rate:  number
    parts: DealPart<F>[]
  }>
}

type Seql<F> = { seql: DispatchPattern<F>[] }
type Fork<F> = { fork: DispatchPattern<F>[] }
export type DispatchPattern<F> = Seql<F>
                               | Fork<F>
                               | Deal<F>

export type Deal<F> = DispatchMode & {
  repeats?: ({ fork: number } | { seql: number })
  configs?: DispatchConfigs
  segments: DealSegment<F>[]
}

export type DispatchSchema<F = unknown> = {
  name:     string
  uses:     UsePool[]
  configs?: DispatchConfigs
  patterns: DispatchPattern<F>[]
}

export type YAMLDispatchSchema = DispatchSchema<string | string[]> & {
  defs:        any

  id:          string
  description: string
}

// filter expression
export type TagFilterExpr
  = { t: 'match';  value: string          }
  | { t: 'invert'; value: TagFilterExpr   }
  | { t: 'every';  value: TagFilterExpr[] } // non empty
  | { t: 'some';   value: TagFilterExpr[] } // non empty

const SYMBOLS = '()|&!'.split('')
export function parseTagFilterExpr(src: string) {
  const parser = new TagExprParser(_tokenize(src))
  const tree   = parser.parse()
  return _synthsis(tree)
}

function _synthsis(tree: any): TagFilterExpr {
  if (Array.isArray(tree)) {
    const [lhs, op, rhs] = tree
    if (op === '!') { return { t: 'invert', value: _synthsis(lhs) } }
    if (op === '&') { return { t: 'every',  value: [_synthsis(lhs), _synthsis(rhs)] } }
    if (op === '|') { return { t: 'some',   value: [_synthsis(lhs), _synthsis(rhs)] } }
    throw new Error(`Synthsis Error: ${JSON.stringify(tree)}`)
  } else {
    return { t: 'match', value: tree as string }
  }
}

function *_tokenize(src: string) {
  let start = 0
  for (let i = 0; i !== src.length; ++i) {
    const ch = src[i]

    if (SYMBOLS.includes(ch)) {
      const word = src.slice(start, i).trim()
      if (word) { yield word }
      start = i + 1

      yield ch
    }
  }

  const word = src.slice(start).trim()
  if (word) { yield word }
}

export class TagExprParser {
  lookahead: string
  constructor(readonly stream: IterableIterator<string>) {
    this.next()
  }

  parse() {
    const tree = this._E()
    this.eat(null)
    return tree
  }

  next() {
    const prev = this.lookahead
    const { done, value } = this.stream.next()
    this.lookahead = done ? null : value
    return prev
  }

  eat(s: string | null) {
    if (this.lookahead !== s) {
      throw new Error(`ParseError: ${s} expected, got ${this.lookahead}`)
    }
    return this.next()
  }

  private _E() {
    const t = this._T()
    const chains: any[] = []
    while (this.lookahead === '|') {
      this.next()
      chains.push(this._E())
    }
    return chains.reduce((n, e) => [n, '|', e], t)
  }

  private _T() {
    const f = this._F()
    const chains: any[] = []
    while (this.lookahead === '&') {
      this.next()
      chains.push(this._F())
    }
    return chains.reduce((n, e) => [n, '&', e], f)
  }

  private _F(): any {
    const tok = this.next()
    if (tok === '!') { return [this._F(), '!'] }
    if (tok === '(') {
      const e = this._E()
      this.eat(')')
      return e
    }
    return tok
  }
}

export function matchTags(tags: string[], filter: TagFilterExpr): boolean {
  return filter.t === 'invert' ? !matchTags(tags, filter.value)
       : filter.t === 'some'   ? filter.value.some(f => matchTags(tags, f))
       : filter.t === 'every'  ? filter.value.every(f => matchTags(tags, f))
       :                         tags.includes(filter.value)
}
