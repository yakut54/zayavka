// Генерирует растровые картинки сайта из SVG-исходников (assets-src/): AVIF, WebP и JPEG для hero,
// статичную карту, OG-картинку, иконки. Результат не коммитится (см. .gitignore).
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = (name) => join(root, 'assets-src', name)
const generated = join(root, 'src/assets/generated')
const publicGenerated = join(root, 'public/generated')
mkdirSync(generated, { recursive: true })
mkdirSync(publicGenerated, { recursive: true })

const newest = ['hero.svg', 'map.svg', 'icon.svg', 'og.svg', '../scripts/make-images.mjs']
  .map((name) => statSync(src(name)).mtimeMs)
  .reduce((a, b) => Math.max(a, b), 0)
const marker = join(generated, 'hero-1200.jpg')
try {
  if (statSync(marker).mtimeMs > newest) {
    console.log('images: актуальны, пропуск')
    process.exit(0)
  }
} catch {
  // файлов ещё нет
}

const hero = readFileSync(src('hero.svg'))
for (const width of [480, 960, 1200]) {
  const image = sharp(hero, { density: 144 }).resize({ width })
  await image
    .clone()
    .avif({ quality: 55, effort: 4 })
    .toFile(join(generated, `hero-${width}.avif`))
  await image
    .clone()
    .webp({ quality: 78 })
    .toFile(join(generated, `hero-${width}.webp`))
  if (width === 1200)
    await image
      .clone()
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(join(generated, 'hero-1200.jpg'))
}

await sharp(readFileSync(src('map.svg')), { density: 144 })
  .resize({ width: 800 })
  .webp({ quality: 80 })
  .toFile(join(generated, 'map.webp'))

const icon = readFileSync(src('icon.svg'))
await sharp(icon).resize(512, 512).png().toFile(join(publicGenerated, 'icon-512.png'))
await sharp(icon).resize(192, 192).png().toFile(join(publicGenerated, 'icon-192.png'))
await sharp(icon).resize(180, 180).png().toFile(join(publicGenerated, 'apple-touch-icon.png'))
await sharp(readFileSync(src('og.svg')), { density: 96 })
  .resize(1200, 630)
  .png()
  .toFile(join(publicGenerated, 'og.png'))

console.log('images: готово')
