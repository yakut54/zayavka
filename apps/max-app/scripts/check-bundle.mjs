// Сборка без VITE_DEMO не должна содержать демо-мост (раздел 10.9 ТЗ): поиск по бандлу.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets')
const forbidden = ['demo-session', 'DemoGate']
const hits = readdirSync(dist)
  .filter((name) => name.endsWith('.js'))
  .flatMap((name) => {
    const code = readFileSync(join(dist, name), 'utf8')
    return forbidden.filter((word) => code.includes(word)).map((word) => `${name}: ${word}`)
  })

if (hits.length > 0) {
  console.error(`В продовой сборке найден демо-код:\n${hits.join('\n')}`)
  process.exit(1)
}
console.log('bundle ok: демо-кода нет')
