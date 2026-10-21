/** Расчёт контраста WCAG для проверки токенов и цвета бренда (используется тестами и сборкой сайта). */

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

/** Поддерживаются `#rgb`, `#rrggbb` и `oklch(L% C H)`. */
export function toLinearRgb(color: string): Rgb {
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

/** Контраст `--color-accent` (brand-600) на белом для заданного оттенка бренда. */
export function brandAccentContrast(hue: number): number {
  return contrast(`oklch(53% 0.15 ${hue})`, '#ffffff')
}

export const AA_TEXT = 4.5
export const AA_NON_TEXT = 3
