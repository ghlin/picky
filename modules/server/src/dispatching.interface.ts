import { defined, Drafting } from '@picky/shared'

export interface DraftDispatching {
  shifts:     number[]
  title?:     string
  dispatches: Drafting.PickCandidate[][]
}

export interface SealedDispatching {
  npicks:     { min: number; max: number }
  title?:     string
  dispatches: Drafting.PickCandidate[][]
}

export type Dispatching = ({ tag: 'draft_dispatching'  } & DraftDispatching)
                        | ({ tag: 'sealed_dispatching' } & SealedDispatching)

export interface Dispatcher {
  dispatch: (nplayers: number) => Promise<
    Dispatching /* .dispatches.length = nplayers */
  >
}

export interface AtomDispatch {
  tag:        'atom_dispatch'
  dispatcher: Dispatcher
}

export interface ForkDispatch {
  tag:      'fork_dispatch'
  children: DispatchSchema[]
}

export interface SeqlDispatch {
  tag:      'seql_dispatch'
  children: DispatchSchema[]
}

export type DispatchSchema
  = AtomDispatch
  | ForkDispatch
  | SeqlDispatch

export function simplify(schema: DispatchSchema): DispatchSchema | undefined {
  if (schema.tag === 'atom_dispatch') { return schema }

  const children = schema
    .children
    .flatMap(d => d.tag === schema.tag ? d.children.map(simplify) : simplify(d))
    .filter(defined)

  if (children.length === 0) { return undefined }
  if (children.length === 1) { return children[0] }

  return { tag: schema.tag, children }
}

export interface DispatchingPreset {
  id:          string
  name:        string
  description: string
  schema:      DispatchSchema
}

