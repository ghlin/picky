export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** run promises with concurrency limit */
export function withConcurrencyLimit(
  concurrency: number,
  producer: Generator<PromiseLike<unknown>, void, unknown> | (() => Generator<PromiseLike<unknown>, void, unknown>)
) {
  const iter     = typeof producer === 'function' ? producer() : producer
  const dispatch = async (): Promise<unknown> => {
    const { done, value } = iter.next()

    if (done) { return Promise.resolve() }
    return (value as PromiseLike<unknown>).then(dispatch)
  }

  return Promise.all([...new Array(concurrency)].map(dispatch))
}

/**
 * run `job` with timeout `timeout` ms.
 */
export function withTimeout<T>(timeout: number, job: Promise<T>, fallback: T): Promise<T>

/**
 * run `job` with timeout `timeout` ms.
 */
export function withTimeout<T>(timeout: number, job: Promise<T>): Promise<T | undefined>

export async function withTimeout(
  timeout: number,
  job: Promise<unknown>,
  fallback?: unknown
) {
  let handler: any
  const timeoutP = new Promise(resolve => handler = setTimeout(resolve, timeout))
  return Promise.race([job, timeoutP.then(() => fallback)]).finally(() => {
    if (handler) clearTimeout(handler)
  })
}

/**
 * explicility create a tuple.
 */
export function tuple<T extends unknown[]>(...elems: T): T { return elems }

export function tap<T>(fn: (t: T) => unknown) {
  return (t: T) => {
    fn(t)
    return Promise.resolve(t)
  }
}

export function withDefault<K, V>(map: Map<K, V>, k: K, initial: () => V) {
  let v = map.get(k)
  if (v === undefined) {
    map.set(k, v = initial())
  }
  return v
}

export function silently<T = unknown>(block: () => Promise<T>, fallback?: T): Promise<T>
export function silently<T = unknown>(block: () => T, fallback?: T): T
export function silently(block: () => any, fallback?: any) {
  try {
    const running = block()

    if (running && typeof running === 'object' && (`then` in running) && (`catch` in running)) {
      return (running as Promise<any>).catch(() => fallback)
    }

    return running
  } catch (e) {
    // XXX: 如果`block`将要返回Promise, 但是抛出了异常, 这里fallback不会被Promise包装
    //       2021-11-16 13:49:00
    return fallback
  }
}

export function defined<T>(v: T | undefined | null): v is NonNullable<T> {
  return v !== undefined && v !== null
}

export function atoi(a: string | number | null | undefined, base = 10) {
  if (!defined(a)) { return undefined }

  if (typeof a === 'number') {
    return Number.isNaN(a) ? undefined : a
  }

  const i = parseInt(a, base)
  return Number.isNaN(i) ? undefined : i
}

export function atoi10(a: string | number | null | undefined) {
  return atoi(a, 10)
}

export function errorMessageWithStack(error: Error) {
  return (error.stack ?? '').split('\n').concat(error.message).join('\n')
}

export function iife<T>(fn: () => T) { return fn() }

export const ignore = () => { return }

export interface ObjectRef<T> { current: T }
export function mkRef<T>(current: T): ObjectRef<T> {
  return { current }
}

/** throw as expression. */
export function panic(error: Error): never { throw error }

export function mkElapseTime(justnow = new Date()) {
  return () => Date.now() - justnow.valueOf()
}

export async function repeatedly(fn: () => Promise<unknown>): Promise<never> {
  while (true) { await fn() }
}

// types
export type ValueType<T> = T extends Map<any, infer V> ? V : T extends Set<infer V> ? V : never
