import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export type SplitMode = 'none' | 'left-first' | 'right-first'

export interface PageInfo {
  pdfPage: number
  half: 'left' | 'right' | null
}

function buildPageList(totalPages: number, splitMode: SplitMode, spreadDetected: boolean): PageInfo[] {
  const split = spreadDetected && splitMode !== 'none'
  if (!split) {
    return Array.from({ length: totalPages }, (_, i) => ({ pdfPage: i + 1, half: null }))
  }
  const pages: PageInfo[] = []
  for (let p = 1; p <= totalPages; p++) {
    if (splitMode === 'right-first') {
      pages.push({ pdfPage: p, half: 'right' })
      pages.push({ pdfPage: p, half: 'left' })
    } else {
      pages.push({ pdfPage: p, half: 'left' })
      pages.push({ pdfPage: p, half: 'right' })
    }
  }
  return pages
}

export function usePdf(data: ArrayBuffer | null, splitMode: SplitMode, spreadDetected: boolean) {
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const [ready, setReady] = useState(false)
  const [totalVirtual, setTotalVirtual] = useState(0)
  const pageListRef = useRef<PageInfo[]>([])

  useEffect(() => {
    if (!data) return
    let cancelled = false
    setReady(false)
    ;(async () => {
      const doc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise
      if (cancelled) return
      docRef.current = doc
      const list = buildPageList(doc.numPages, splitMode, spreadDetected)
      pageListRef.current = list
      setTotalVirtual(list.length)
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [data, splitMode, spreadDetected])

  // 参照を安定させることで、splitMode変更時に描画effectが誤発火しないようにする
  const renderPage = useCallback(
    async (
      virtualIndex: number,
      canvas: HTMLCanvasElement,
      containerW?: number,
      containerH?: number,
    ) => {
      const doc = docRef.current
      if (!doc) return
      const info = pageListRef.current[virtualIndex]
      if (!info) return

      const page = await doc.getPage(info.pdfPage)
      const viewport = page.getViewport({ scale: 1 })

      const w = containerW ?? canvas.parentElement?.clientWidth ?? window.innerWidth
      const h = containerH ?? canvas.parentElement?.clientHeight ?? window.innerHeight

      const scale = Math.min(
        w / (info.half ? viewport.width / 2 : viewport.width),
        h / viewport.height,
      ) * window.devicePixelRatio

      // 左右ハーフは同一の fullW から halfW を算出し、サイズ不一致を防ぐ
      const fullW = Math.floor(viewport.width * scale)
      const fullH = Math.floor(viewport.height * scale)
      const halfW = Math.floor(fullW / 2)

      if (info.half) {
        canvas.width = halfW
        canvas.height = fullH
        canvas.style.width = `${Math.round(halfW / window.devicePixelRatio)}px`
        canvas.style.height = `${Math.round(fullH / window.devicePixelRatio)}px`
      } else {
        canvas.width = fullW
        canvas.height = fullH
        canvas.style.width = `${Math.round(fullW / window.devicePixelRatio)}px`
        canvas.style.height = `${Math.round(fullH / window.devicePixelRatio)}px`
      }

      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const renderViewport = page.getViewport({ scale })

      if (info.half === 'left') {
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, halfW, fullH)
        ctx.clip()
        await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise
        ctx.restore()
      } else if (info.half === 'right') {
        ctx.save()
        ctx.translate(-halfW, 0)
        ctx.beginPath()
        ctx.rect(halfW, 0, halfW, fullH)
        ctx.clip()
        await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise
        ctx.restore()
      } else {
        await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise
      }
    },
    [],
  )

  return { ready, totalVirtual, renderPage, pageList: pageListRef.current }
}
