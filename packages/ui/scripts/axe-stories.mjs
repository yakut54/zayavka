// Прогоняет каждую историю Storybook через axe (раздел 17.3 ТЗ): нарушения роняют проверку.
// Использование: node scripts/axe-stories.mjs [http://127.0.0.1:6006]
// PW_CHANNEL=chrome — взять установленный Chrome вместо скачанного Chromium.
import { createRequire } from 'node:module'

import { chromium } from 'playwright'

const require = createRequire(import.meta.url)
const axeSource = (await import('node:fs')).readFileSync(
  require.resolve('axe-core/axe.min.js'),
  'utf8',
)
const base = process.argv[2] ?? 'http://127.0.0.1:6006'
const launchOptions = process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}

const index = await (await fetch(`${base}/index.json`)).json()
const stories = Object.values(index.entries).filter((entry) => entry.type === 'story')

const browser = await chromium.launch(launchOptions)
const page = await browser.newPage()
let failed = 0

for (const story of stories) {
  await page.goto(`${base}/iframe.html?id=${story.id}&viewMode=story`)
  await page.waitForSelector('body.sb-show-main, body.sb-show-errordisplay', { timeout: 15_000 })
  if (await page.$('body.sb-show-errordisplay')) {
    console.error(`✗ ${story.title} / ${story.name}: история не отрисовалась`)
    failed += 1
    continue
  }
  // дать отрисоваться шрифтам и анимациям
  await page.waitForTimeout(150)
  await page.addScriptTag({ content: axeSource })
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { region: { enabled: false } },
    })
    return result.violations.map((v) => ({
      id: v.id,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} — ${n.failureSummary ?? ''}`),
    }))
  })
  if (violations.length > 0) {
    failed += 1
    console.error(`✗ ${story.title} / ${story.name}`)
    for (const v of violations)
      console.error(`    ${v.id}: ${v.help}\n      ${v.nodes.join('\n      ')}`)
  } else {
    console.log(`✓ ${story.title} / ${story.name}`)
  }
}

await browser.close()
console.log(`\nИстории: ${stories.length}, с нарушениями: ${failed}`)
process.exit(failed > 0 ? 1 : 0)
