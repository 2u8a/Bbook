import { useEffect, useRef } from 'react'

export type ReadingDirection = 'ltr' | 'rtl'

export function useSwipe(
  el: HTMLElement | null,
  onNext: () => void,
  onPrev: () => void,
  direction: ReadingDirection,
  onTap?: (clientX: number) => void,
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

      // タップ判定: 移動が少ない or 縦移動が大きい
      if (!moved.current || Math.abs(dx) < 10 || Math.abs(dy) > Math.abs(dx)) {
        onTap?.(e.clientX)
        return
      }

      // スワイプ判定
      // LTR: 左スワイプ(dx<0)=次へ、右スワイプ(dx>0)=前へ
      // RTL: 右スワイプ(dx>0)=次へ（右→左の本は右フリックで前進）、左スワイプ(dx<0)=前へ
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
  }, [el, onNext, onPrev, direction, onTap])
}
