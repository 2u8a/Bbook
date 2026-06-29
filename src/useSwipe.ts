import { useEffect, useRef } from 'react'

export type ReadingDirection = 'ltr' | 'rtl'

export function useSwipe(
  el: HTMLElement | null,
  onNext: () => void,
  onPrev: () => void,
  direction: ReadingDirection,
) {
  const startX = useRef(0)
  const startY = useRef(0)

  useEffect(() => {
    if (!el) return

    function onPointerDown(e: PointerEvent) {
      startX.current = e.clientX
      startY.current = e.clientY
    }

    function onPointerUp(e: PointerEvent) {
      const dx = e.clientX - startX.current
      const dy = e.clientY - startY.current
      if (Math.abs(dx) < 30 || Math.abs(dy) > Math.abs(dx)) return

      if (direction === 'ltr') {
        if (dx < 0) onNext(); else onPrev()
      } else {
        if (dx > 0) onNext(); else onPrev()
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointerup', onPointerUp)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointerup', onPointerUp)
    }
  }, [el, onNext, onPrev, direction])
}
