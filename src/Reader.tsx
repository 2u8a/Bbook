import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getBook, updateProgress } from './db'
import { usePdf, type SplitMode } from './usePdf'
import { useSwipe, type ReadingDirection } from './useSwipe'

const SETTINGS_KEY = 'bbook_settings'

interface Settings {
  direction: ReadingDirection
  splitMode: SplitMode
}

function loadSettings(): Settings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
  } catch {
    return { direction: 'ltr', splitMode: 'none' }
  }
}

function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

export default function Reader() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null)
  const [spreadDetected, setSpreadDetected] = useState(false)
  const [title, setTitle] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showUI, setShowUI] = useState(true)
  const [showSettings, setShowSettings] = useState(false)

  const initSettings = loadSettings()
  const [direction, setDirection] = useState<ReadingDirection>(initSettings.direction ?? 'ltr')
  const [splitMode, setSplitMode] = useState<SplitMode>(initSettings.splitMode ?? 'none')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renderingRef = useRef(false)

  const { ready, totalVirtual, renderPage } = usePdf(pdfData, splitMode, spreadDetected)

  // 本を読み込む
  useEffect(() => {
    if (!id) return
    getBook(id).then(book => {
      if (!book) return navigate('/')
      setPdfData(book.data)
      setSpreadDetected(book.spreadDetected)
      setTitle(book.title)
      setCurrentIndex(book.currentPage)
    })
  }, [id])

  // ページ描画
  useEffect(() => {
    if (!ready || !canvasRef.current) return
    if (renderingRef.current) return
    renderingRef.current = true
    renderPage(currentIndex, canvasRef.current).finally(() => {
      renderingRef.current = false
    })
  }, [ready, currentIndex, renderPage])

  // しおり保存
  useEffect(() => {
    if (!id || !ready) return
    updateProgress(id, currentIndex)
  }, [id, currentIndex, ready])

  const goNext = useCallback(() => {
    setCurrentIndex(i => Math.min(i + 1, totalVirtual - 1))
    flashUI()
  }, [totalVirtual])

  const goPrev = useCallback(() => {
    setCurrentIndex(i => Math.max(i - 1, 0))
    flashUI()
  }, [])

  function flashUI() {
    setShowUI(true)
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current)
    uiTimerRef.current = setTimeout(() => setShowUI(false), 3000)
  }

  function handleTap(e: React.MouseEvent) {
    const x = e.clientX
    const w = window.innerWidth
    if (x < w * 0.25) {
      // 左タップ
      if (direction === 'ltr') goPrev(); else goNext()
    } else if (x > w * 0.75) {
      // 右タップ
      if (direction === 'ltr') goNext(); else goPrev()
    } else {
      // 中央タップ: UI表示/非表示
      setShowUI(v => !v)
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current)
    }
  }

  function handleSettingsChange(dir: ReadingDirection, mode: SplitMode) {
    setDirection(dir)
    setSplitMode(mode)
    saveSettings({ direction: dir, splitMode: mode })
  }

  useSwipe(containerRef.current, goNext, goPrev, direction)

  const progress = totalVirtual > 1 ? (currentIndex / (totalVirtual - 1)) * 100 : 0

  return (
    <div
      ref={containerRef}
      className="w-full h-dvh bg-black flex flex-col items-center justify-center overflow-hidden select-none"
      onClick={handleTap}
    >
      {/* Canvas */}
      <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />

      {/* ローディング */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-stone-500 text-sm">
          読み込み中...
        </div>
      )}

      {/* UI オーバーレイ */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* ヘッダー */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent px-4 pt-10 pb-8 flex items-center gap-3 pointer-events-auto">
          <button
            className="text-white text-sm px-3 py-1 rounded-full bg-white/10"
            onClick={e => { e.stopPropagation(); navigate('/') }}
          >← 本棚</button>
          <p className="text-white text-sm flex-1 truncate">{title}</p>
          <button
            className="text-white text-sm px-3 py-1 rounded-full bg-white/10"
            onClick={e => { e.stopPropagation(); setShowSettings(v => !v) }}
          >設定</button>
        </div>

        {/* フッター */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-8 pt-8">
          <div className="h-1 bg-white/20 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-white/60 text-xs text-center">{currentIndex + 1} / {totalVirtual}</p>
        </div>
      </div>

      {/* 設定パネル */}
      {showSettings && (
        <div
          className="absolute inset-0 bg-black/60 flex items-end pointer-events-auto"
          onClick={e => { e.stopPropagation(); setShowSettings(false) }}
        >
          <div
            className="w-full bg-stone-900 rounded-t-2xl p-6 flex flex-col gap-5"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-white font-semibold text-lg">表示設定</h2>

            <div>
              <p className="text-stone-400 text-sm mb-2">ページ送り方向</p>
              <div className="flex gap-2">
                {(['ltr', 'rtl'] as ReadingDirection[]).map(d => (
                  <button
                    key={d}
                    className={`flex-1 py-2 rounded-xl text-sm ${direction === d ? 'bg-amber-500 text-black font-semibold' : 'bg-stone-800 text-white'}`}
                    onClick={() => handleSettingsChange(d, splitMode)}
                  >
                    {d === 'ltr' ? '左→右（洋書）' : '右→左（日本語）'}
                  </button>
                ))}
              </div>
            </div>

            {spreadDetected && (
              <div>
                <p className="text-stone-400 text-sm mb-2">見開き分割</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'none', label: '分割しない' },
                    { value: 'left-first', label: '左ページから' },
                    { value: 'right-first', label: '右ページから' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      className={`flex-1 py-2 rounded-xl text-sm ${splitMode === opt.value ? 'bg-amber-500 text-black font-semibold' : 'bg-stone-800 text-white'}`}
                      onClick={() => handleSettingsChange(direction, opt.value as SplitMode)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-stone-500 text-xs mt-2">見開きPDFを1ページずつ表示します</p>
              </div>
            )}

            <button
              className="mt-2 py-3 rounded-xl bg-stone-800 text-white text-sm"
              onClick={() => setShowSettings(false)}
            >閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}
