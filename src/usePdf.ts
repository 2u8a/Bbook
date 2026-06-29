import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export type SplitMode = 'none' | 'left-first' | 'right-first'

export interface PageInfo {
  /** 元PDFのページ番号（1始まり） */
  pdfPage: number
  /** 見開き分割時: 'left' | 'right' | null */
  half: 'left' | 'right' | null
}

function buildPageList(totalPages: number, splitMode: SplitMode, spreadDetected: boolean): PageInfo[] {
  const split = spreadDetected && splitMode !== 'none'
  if (!split) {
    return Array.from({ length: totalPages }, (_, i) => ({ pdfPage: i + 1, half: null }))
  }

  // right-first: 右ページが先（日本語右綴じ）、left-first: 左ページが先（左綴じ）
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

  async function renderPage(virtualIndex: number, canvas: HTMLCanvasElement) {
    const doc = docRef.current
    if (!doc) return
    const info = pageListRef.current[virtualIndex]
    if (!info) return

    const page = await doc.getPage(info.pdfPage)
    const viewport = page.getViewport({ scale: 1 })

    const scale = Math.min(
      canvas.parentElement!.clientWidth / (info.half ? viewport.width / 2 : viewport.width),
      canvas.parentElement!.clientHeight / viewport.height,
    ) * window.devicePixelRatio

    if (info.half) {
      canvas.width = Math.floor(viewport.width / 2 * scale)
      canvas.height = Math.floor(viewport.height * scale)
      canvas.style.width = `${Math.floor(viewport.width / 2 * scale / window.devicePixelRatio)}px`
      canvas.style.height = `${Math.floor(viewport.height * scale / window.devicePixelRatio)}px`
    } else {
      canvas.width = Math.floor(viewport.width * scale)
      canvas.height = Math.floor(viewport.height * scale)
      canvas.style.width = `${Math.floor(viewport.width * scale / window.devicePixelRatio)}px`
      canvas.style.height = `${Math.floor(viewport.height * scale / window.devicePixelRatio)}px`
    }

    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const renderViewport = page.getViewport({ scale })

    if (info.half === 'left') {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, canvas.width, canvas.height)
      ctx.clip()
      await page.render({ canvasContext: ctx, viewport: renderViewport }).promise
      ctx.restore()
    } else if (info.half === 'right') {
      ctx.save()
      ctx.translate(-canvas.width, 0)
      ctx.beginPath()
      ctx.rect(canvas.width, 0, canvas.width, canvas.height)
      ctx.clip()
      await page.render({ canvasContext: ctx, viewport: renderViewport }).promise
      ctx.restore()
    } else {
      await page.render({ canvasContext: ctx, viewport: renderViewport }).promise
    }
  }

  return { ready, totalVirtual, renderPage, pageList: pageListRef.current }
}
