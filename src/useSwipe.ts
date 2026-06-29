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
  const moved = useRef(false)

  useEffect(() => {
    if (!el) return

    function onPointerDown(e: PointerEvent) {
      startX.current = e.clientX
      startY.current = e.clientY
      moved.current = false
    }

    function onPointerMove(e: PointerEvent) {
      if (Math.abs(e.clientX - startX.current) > 8) moved.current = true
    }

    function onPointerUp(e: PointerEvent) {
      const dx = e.clientX - startX.current
      const dy = e.clientY - startY.current
      // 横移動が10px以上、かつ縦より横が大きければスワイプ判定
      if (Math.abs(dx) < 10 || Math.abs(dy) > Math.abs(dx)) return
      if (!moved.current) return

      if (direction === 'ltr') {
        if (dx < 0) onNext(); else onPrev()
      } else {
        if (dx > 0) onNext(); else onPrev()
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
    }
  }, [el, onNext, onPrev, direction])
}
