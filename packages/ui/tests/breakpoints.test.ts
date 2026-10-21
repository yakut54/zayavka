import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { breakpoints } from '../src/tokens/breakpoints'

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../src')

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else if (/\.(vue|css)$/.test(name)) yield path
  }
}

describe('брейкпоинты в CSS', () => {
  it('используют только значения из breakpoints.ts', () => {
    const allowed = new Set<number>(Object.values(breakpoints))
    const bad: string[] = []
    for (const file of files(srcDir)) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/@media[^{]*?\((?:min|max)-width:\s*(\d+)px\)/g)) {
        if (!allowed.has(Number(match[1]))) bad.push(`${file}: ${match[1]}px`)
      }
    }
    expect(bad).toEqual([])
  })
})
