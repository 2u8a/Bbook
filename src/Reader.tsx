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
  const totalVirtualRef = useRef(0)

  const { ready, totalVirtual, renderPage } = usePdf(pdfData, splitMode, spreadDetected)
  totalVirtualRef.current = totalVirtual

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
    setCurrentIndex(i => Math.min(i + 1, totalVirtualRef.current - 1))
    flashUI()
  }, [])

  const goPrev = useCallback(() => {
    setCurrentIndex(i => Math.max(i - 1, 0))
    flashUI()
  }, [])

  // キーボード操作
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') {
        direction === 'ltr' ? goNext() : goPrev()
      } else if (e.key === 'ArrowLeft') {
        direction === 'ltr' ? goPrev() : goNext()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [direction, goNext, goPrev])

  function flashUI() {
    setShowUI(true)
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current)
    uiTimerRef.current = setTimeout(() => setShowUI(false), 3000)
  }

  // タップ処理（useSwipeから呼ばれる）
  const handleTap = useCallback((clientX: number) => {
    const w = window.innerWidth
    if (clientX < w * 0.4) {
      // 左40%タップ
      // LTR: 左=前のページ / RTL: 左=次のページ（右綴じ本の進行方向）
      if (direction === 'ltr') goPrev(); else goNext()
    } else if (clientX > w * 0.6) {
      // 右40%タップ
      // LTR: 右=次のページ / RTL: 右=前のページ
      if (direction === 'ltr') goNext(); else goPrev()
    } else {
      // 中央20%: UI表示/非表示
      setShowUI(v => !v)
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current)
    }
  }, [direction, goNext, goPrev])

  function handleSettingsChange(dir: ReadingDirection, mode: SplitMode) {
    setDirection(dir)
    setSplitMode(mode)
    saveSettings({ direction: dir, splitMode: mode })
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    // RTLのとき input は scaleX(-1) されているので値を反転する
    const raw = Number(e.target.value)
    const idx = direction === 'rtl' ? (totalVirtual - 1 - raw) : raw
    setCurrentIndex(idx)
    flashUI()
  }

  // useSwipe に onTap を渡してクリックイベントの二重発火を防ぐ
  useSwipe(containerRef.current, goNext, goPrev, direction, handleTap)

  const progress = totalVirtual > 1 ? (currentIndex / (totalVirtual - 1)) * 100 : 0
  const progressPct = Math.round(progress)

  // シークバーの表示値: RTLは反転
  const sliderValue = direction === 'rtl' ? (totalVirtual - 1 - currentIndex) : currentIndex
  const sliderMax = Math.max(0, totalVirtual - 1)

  return (
    <div
      ref={containerRef}
      className="w-full h-dvh bg-black flex flex-col items-center justify-center overflow-hidden select-none"
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
            onClick={() => navigate('/')}
          >← 本棚</button>
          <p className="text-white text-sm flex-1 truncate">{title}</p>
          <button
            className="text-white text-sm px-3 py-1 rounded-full bg-white/10"
            onClick={() => setShowSettings(v => !v)}
          >設定</button>
        </div>

        {/* フッター */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-8 pt-10 pointer-events-auto">
          {/* ページ数・進捗% */}
          <div className="flex justify-between items-center mb-2 text-xs text-white/60">
            {direction === 'ltr' ? (
              <>
                <span>{currentIndex + 1} / {totalVirtual}</span>
                <span>{progressPct}%</span>
              </>
            ) : (
              <>
                <span>{progressPct}%</span>
                <span>{currentIndex + 1} / {totalVirtual}</span>
              </>
            )}
          </div>

          {/* シークスライダー（RTLは見た目を反転） */}
          <div
            style={{ transform: direction === 'rtl' ? 'scaleX(-1)' : 'none' }}
          >
            <input
              type="range"
              min={0}
              max={sliderMax}
              value={sliderValue}
              onChange={handleSeek}
              className="w-full cursor-pointer appearance-none h-1 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:cursor-pointer"
              style={{
                background: `linear-gradient(to right, #f59e0b ${progressPct}%, rgba(255,255,255,0.2) ${progressPct}%)`,
              }}
            />
          </div>
        </div>
      </div>

      {/* 設定パネル */}
      {showSettings && (
        <div
          className="absolute inset-0 bg-black/60 flex items-end pointer-events-auto"
          onClick={() => setShowSettings(false)}
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
