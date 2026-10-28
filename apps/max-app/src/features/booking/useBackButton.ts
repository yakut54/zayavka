import { onBeforeUnmount, onMounted } from 'vue'

import { useMaxBridge } from '../../bridge/useMaxBridge'

/** Системная кнопка MAX «Назад»: видна на экранах шагов, ведёт на предыдущий шаг. */
export function useBackButton(onBack: () => void): void {
  const bridge = useMaxBridge()
  let off: (() => void) | undefined
  onMounted(() => {
    off = bridge.backButton.onClick(onBack)
    bridge.backButton.show()
  })
  onBeforeUnmount(() => {
    off?.()
    bridge.backButton.hide()
  })
}
