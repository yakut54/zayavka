// Lighthouse CI по собранному сайту (ТЗ-1 §12.6): мобильный профиль, пороги из ТЗ.
// Сайт поднимается окружением compose.test.yml (http://localhost:8080).
// is-crawlable пропущен: в демо robots.txt закрывает сайт от индексации (Disallow: /) намеренно.
// В CI (GitHub-раннеры заметно медленнее и шумнее ноутбука) пороги скорости мягче:
// медиана из пяти запусков, performance ≥ 0.9, LCP ≤ 3 с. Остальные пороги те же.
const CI = Boolean(process.env.CI)

module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:8080/'],
      numberOfRuns: CI ? 5 : 3,
      settings: {
        skipAudits: ['is-crawlable'],
        chromeFlags: '--no-sandbox',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: CI ? 0.9 : 0.95 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 1 }],
        'largest-contentful-paint': ['error', { maxNumericValue: CI ? 3000 : 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
}
