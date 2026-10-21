import { useToast } from '@app/ui'

/** Копирование в буфер обмена; false, если браузер не дал доступ. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Копирует телефон и сообщает о результате уведомлением. */
export function useCopyPhone() {
  const toast = useToast()
  return async (phone: string): Promise<void> => {
    if (await copyText(phone)) toast.success('admin.leads.phoneCopied')
    else toast.error('admin.leads.copyFailed')
  }
}
