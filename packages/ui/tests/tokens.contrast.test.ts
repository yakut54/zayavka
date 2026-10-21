import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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

type Rgb = [number, number, number]

function oklchToLinearRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (x: number) => Math.min(1, Math.max(0, x))
  return [
    clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ]
}

function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function toLinearRgb(color: string): Rgb {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)
  if (hex) {
    let digits = hex[1] as string
    if (digits.length === 3) digits = [...digits].map((d) => d + d).join('')
    const n = Number.parseInt(digits, 16)
    return [srgbToLinear((n >> 16) & 255), srgbToLinear((n >> 8) & 255), srgbToLinear(n & 255)]
  }
  const oklch = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(color)
  if (oklch) {
    return oklchToLinearRgb(Number(oklch[1]) / 100, Number(oklch[2]), Number(oklch[3]))
  }
  throw new Error(`unsupported color: ${color}`)
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(foreground: string, background: string): number {
  const a = luminance(toLinearRgb(foreground))
  const b = luminance(toLinearRgb(background))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const TEXT = 4.5
const NON_TEXT = 3

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
