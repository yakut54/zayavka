import { MAILPIT_URL } from './env'

export interface MailMessage {
  ID: string
  Subject: string
  To: { Address: string }[]
}

export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
}

async function listMessages(): Promise<MailMessage[]> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/messages`)
  return ((await response.json()) as { messages: MailMessage[] }).messages
}

/** Ждёт письмо с темой (воркер отправляет его асинхронно через outbox). */
export async function waitForMail(subject: string, timeoutMs = 30_000): Promise<MailMessage> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = (await listMessages()).find((m) => m.Subject === subject)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Письмо «${subject}» не пришло за ${timeoutMs} мс`)
}

export async function mailBody(id: string): Promise<{ Text: string; HTML: string }> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)
  return (await response.json()) as { Text: string; HTML: string }
}
