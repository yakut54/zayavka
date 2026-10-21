// pnpm i18n:check — ключи, которых нет в словаре, и ключи, которые нигде не используются.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const dictionary = JSON.parse(readFileSync(join(root, 'packages/i18n/src/ru.json'), 'utf8'))
const SOURCE_DIRS = [
  'apps/site/src',
  'apps/site/site.config.ts',
  'apps/admin/src',
  'packages/ui/src',
  'packages/ui/.storybook',
  'e2e',
]
const SKIP = new Set(['node_modules', 'dist', 'coverage', 'storybook-static', 'schema.d.ts'])

function leaves(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? leaves(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

function* walk(path) {
  const stat = statSync(path, { throwIfNoEntry: false })
  if (!stat) return
  if (stat.isFile()) {
    yield path
    return
  }
  for (const name of readdirSync(path)) {
    if (!SKIP.has(name)) yield* walk(join(path, name))
  }
}

const keys = new Set(leaves(dictionary))
const namespaces = new Set(Object.keys(dictionary))
const files = SOURCE_DIRS.flatMap((dir) => [...walk(join(root, dir))]).filter((f) =>
  /\.(vue|ts|json)$/.test(f),
)

const literal = /(['"`])((?:[a-z][A-Za-z0-9]*)(?:\.[A-Za-z0-9_]+)*\.?)(\1|\$\{)/g
const used = new Set()
const prefixes = new Set() // динамические ключи вида `errors.field.${code}` и ссылки на неймспейс
const unknown = []

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(literal)) {
    const candidate = match[2]
    if (!candidate.includes('.')) continue
    if (!namespaces.has(candidate.split('.')[0])) continue
    if (candidate.endsWith('.') || match[3] === '${') {
      prefixes.add(candidate)
    } else if (keys.has(candidate)) {
      used.add(candidate)
    } else if ([...keys].some((k) => k.startsWith(`${candidate}.`))) {
      prefixes.add(`${candidate}.`)
    } else {
      unknown.push(`${relative(root, file)}: ${candidate}`)
    }
  }
}

const unused = [...keys].filter((k) => !used.has(k) && ![...prefixes].some((p) => k.startsWith(p)))

if (unknown.length || unused.length) {
  if (unknown.length) console.error(`Ключи, которых нет в словаре:\n  ${unknown.join('\n  ')}`)
  if (unused.length) console.error(`Неиспользуемые ключи:\n  ${unused.join('\n  ')}`)
  process.exit(1)
}
console.log(`i18n:check ok — ${keys.size} ключей, ${files.length} файлов`)
