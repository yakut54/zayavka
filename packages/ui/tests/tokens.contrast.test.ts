import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { AA_NON_TEXT, AA_TEXT, brandAccentContrast, contrast } from '../src/tokens/contrast'

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/tokens/tokens.css'),
  'utf8',
)

type Vars = Record<string, string>

function declarations(block: string): Vars {
  const vars: Vars = {}
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[match[1] as string] = (match[2] as string).replace(/\s+/g, ' ').trim()
  }
  return vars
}

function blockAfter(selector: string, from = 0): string {
  const start = css.indexOf(selector, from)
  if (start < 0) throw new Error(`selector not found: ${selector}`)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error('unbalanced braces')
}

const primitives = declarations(blockAfter(':root {'))
const lightSemantic = declarations(blockAfter("[data-theme='light'] {"))
const darkSemantic = declarations(blockAfter("[data-theme='dark'] {"))
const darkMedia = declarations(blockAfter(":root:not([data-theme='light']) {"))

function resolve(value: string, vars: Vars, depth = 0): string {
  if (depth > 10) throw new Error(`var cycle: ${value}`)
  return value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    const next = vars[name]
    if (next === undefined) throw new Error(`unknown token ${name}`)
    return resolve(next, vars, depth + 1)
  })
}

const TEXT = AA_TEXT
const NON_TEXT = AA_NON_TEXT

// [передний план, фон, минимальный контраст]
const PAIRS: [string, string, number][] = [
  ['--color-text', '--color-bg', TEXT],
  ['--color-text', '--color-surface', TEXT],
  ['--color-text', '--color-surface-raised', TEXT],
  ['--color-text', '--color-surface-muted', TEXT],
  ['--color-text-muted', '--color-bg', TEXT],
  ['--color-text-muted', '--color-surface', TEXT],
  ['--color-text-muted', '--color-surface-muted', TEXT],
  ['--color-accent', '--color-bg', TEXT],
  ['--color-accent', '--color-surface', TEXT],
  ['--color-accent-hover', '--color-surface', TEXT],
  ['--color-accent', '--color-accent-subtle', TEXT],
  ['--color-text-inverse', '--color-accent', TEXT],
  ['--color-text-inverse', '--color-accent-hover', TEXT],
  ['--color-danger', '--color-surface', TEXT],
  ['--color-danger', '--color-bg', TEXT],
  ['--color-danger', '--color-danger-subtle', TEXT],
  ['--color-success', '--color-surface', TEXT],
  ['--color-success', '--color-bg', TEXT],
  ['--color-success', '--color-success-subtle', TEXT],
  ['--color-warning', '--color-surface', TEXT],
  ['--color-warning', '--color-bg', TEXT],
  ['--color-warning', '--color-warning-subtle', TEXT],
  ['--color-text', '--color-accent-subtle', TEXT],
  // рамки полей и кольцо фокуса — 3:1
  ['--color-border-input', '--color-surface', NON_TEXT],
  ['--color-border-input', '--color-bg', NON_TEXT],
  ['--color-focus-ring', '--color-surface', NON_TEXT],
  ['--color-focus-ring', '--color-bg', NON_TEXT],
  ['--color-accent', '--color-surface', NON_TEXT],
]

describe.each([
  ['light', lightSemantic],
  ['dark', darkSemantic],
])('контраст токенов, тема %s', (_theme, semantic) => {
  const vars: Vars = { ...primitives, ...semantic }

  it.each(PAIRS)('%s на %s ≥ %d', (fg, bg, min) => {
    const ratio = contrast(resolve(`var(${fg})`, vars), resolve(`var(${bg})`, vars))
    expect(ratio, `${fg} на ${bg}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min)
  })
})

describe('тёмная тема по prefers-color-scheme', () => {
  it('содержит те же значения, что и [data-theme="dark"]', () => {
    const { ...dark } = darkSemantic
    delete dark['color-scheme']
    expect(darkMedia).toEqual(dark)
  })
})

describe('вспомогательные функции', () => {
  it('чёрное на белом — 21:1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('короткая запись hex', () => {
    expect(contrast('#fff', '#000')).toBeCloseTo(21, 0)
  })

  it('неподдерживаемый цвет — ошибка', () => {
    expect(() => contrast('red', '#fff')).toThrow()
  })

  it('цвет бренда на белом проходит AA при оттенке по умолчанию', () => {
    const vars = { ...primitives, ...lightSemantic }
    expect(contrast(resolve('var(--brand-600)', vars), '#ffffff')).toBeGreaterThanOrEqual(TEXT)
  })
})

describe('цвет бренда', () => {
  it.each([0, 30, 90, 150, 200, 250, 300, 330])(
    'оттенок %i: подсказка brandAccentContrast считается',
    (hue) => {
      expect(brandAccentContrast(hue)).toBeGreaterThan(1)
    },
  )

  it('оттенок по умолчанию проходит AA', () => {
    expect(brandAccentContrast(250)).toBeGreaterThanOrEqual(AA_TEXT)
  })
})
