import { execFileSync } from 'node:child_process'

import { ADMIN_EMAIL, ADMIN_PASSWORD, COMPOSE, MAILPIT_URL } from './env'

/** Перед прогоном: окружение должно быть поднято, в нём создаётся тестовый администратор. */
export default async function globalSetup(): Promise<void> {
  const health = await fetch('http://localhost:8080/api/v1/readyz').catch(() => null)
  if (!health?.ok) {
    throw new Error(
      'Окружение не поднято: docker compose -f infra/compose.test.yml up -d --build --wait',
    )
  }
  try {
    execFileSync(
      'docker',
      [
        ...COMPOSE,
        'exec',
        '-T',
        'api',
        'python',
        '-m',
        'app.cli',
        'create-admin',
        '--email',
        ADMIN_EMAIL,
        '--stdin',
      ],
      { input: `${ADMIN_PASSWORD}\n`, stdio: ['pipe', 'pipe', 'pipe'] },
    )
  } catch (error) {
    // повторный запуск: администратор уже есть — это нормально
    const stderr = String((error as { stderr?: Buffer }).stderr ?? '')
    if (!stderr.includes('уже существует')) throw error
  }
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
}
