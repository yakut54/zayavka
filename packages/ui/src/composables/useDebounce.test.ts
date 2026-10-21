import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { debounce } from './useDebounce'

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('вызывает функцию один раз с последними аргументами', () => {
    const fn = vi.fn()
    const run = debounce(fn, 300)
    run('a')
    vi.advanceTimersByTime(200)
    run('b')
    vi.advanceTimersByTime(299)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('b')
  })

  it('flush выполняет вызов немедленно', () => {
    const fn = vi.fn()
    const run = debounce(fn, 300)
    run('x')
    run.flush()
    expect(fn).toHaveBeenCalledWith('x')
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('flush без отложенного вызова ничего не делает', () => {
    const fn = vi.fn()
    debounce(fn, 300).flush()
    expect(fn).not.toHaveBeenCalled()
  })

  it('cancel отменяет вызов', () => {
    const fn = vi.fn()
    const run = debounce(fn, 300)
    run('x')
    run.cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })
})
