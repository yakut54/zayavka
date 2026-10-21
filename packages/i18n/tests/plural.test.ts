import { describe, expect, it } from 'vitest'

import { T, ruPluralRule } from '../src'

describe('ruPluralRule (4 формы)', () => {
  it.each([
    [0, 0],
    [1, 1],
    [21, 1],
    [101, 1],
    [2, 2],
    [3, 2],
    [4, 2],
    [22, 2],
    [5, 3],
    [11, 3],
    [12, 3],
    [14, 3],
    [20, 3],
    [111, 3],
    [112, 3],
    [25, 3],
  ])('%i → форма %i', (n, form) => {
    expect(ruPluralRule(n, 4)).toBe(form)
  })
})

describe('ruPluralRule (3 формы)', () => {
  it.each([
    [0, 2],
    [1, 0],
    [3, 1],
    [11, 2],
  ])('%i → форма %i', (n, form) => {
    expect(ruPluralRule(n, 3)).toBe(form)
  })
})

describe('T', () => {
  it('подставляет именованные аргументы', () => {
    expect(T('demo.greeting', { name: 'Анна' })).toBe('Здравствуйте, Анна!')
  })

  it('ключ без аргументов', () => {
    expect(T('common.retry')).toBe('Повторить')
  })

  it('позиционные аргументы не подставляют именованные плейсхолдеры', () => {
    expect(T('demo.greeting', ['Анна'])).toContain('Здравствуйте')
  })
})
