// Бюджет JS первой загрузки главной (ТЗ-1 §12.6): ≤ 100 КБ gzip.
// Считаются скрипты и modulepreload из dist/index.html; ленивые чанки (форма, секции) не входят.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = 100
const dist = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const html = readFileSync(join(dist, 'index.html'), 'utf8')

const files = new Set()
for (const match of html.matchAll(/<(?:script|link)[^>]*(?:src|href)="(\/assets\/[^"]+\.js)"/g)) {
  files.add(match[1])
}

let total = 0
for (const file of files) {
  const size = gzipSync(readFileSync(join(dist, file))).length
  total += size
  console.log(`${(size / 1024).toFixed(1).padStart(6)} KB  ${file}`)
}
const kb = total / 1024
console.log(`Итого: ${kb.toFixed(1)} KB gzip из ${BUDGET_KB} KB`)
if (kb > BUDGET_KB) {
  console.error('Бюджет JS превышен')
  process.exit(1)
}
