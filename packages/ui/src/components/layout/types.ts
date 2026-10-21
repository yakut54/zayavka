/** Только значения из шкалы отступов (--space-N). */
export type SpaceToken = 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20

export const space = (token: SpaceToken): string => `var(--space-${token})`
