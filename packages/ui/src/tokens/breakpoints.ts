/**
 * Брейкпоинты. CSS-переменные в @media не работают, поэтому значения повторяются
 * в компонентах литералами; тест tests/breakpoints.test.ts следит, чтобы в CSS
 * использовались только эти значения.
 */
export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const

export type Breakpoint = keyof typeof breakpoints
