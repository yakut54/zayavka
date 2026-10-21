export interface Debounced<A extends unknown[]> {
  (...args: A): void
  /** Выполнить отложенный вызов немедленно. */
  flush: () => void
  cancel: () => void
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: A | undefined

  const run = ((...args: A) => {
    pending = args
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      const call = pending
      pending = undefined
      if (call) fn(...call)
    }, ms)
  }) as Debounced<A>

  run.flush = () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
    const call = pending
    pending = undefined
    if (call) fn(...call)
  }

  run.cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    pending = undefined
  }

  return run
}
