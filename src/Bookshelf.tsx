import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url'
import { getAllBooks, saveBook, deleteBook, updateBookMeta, type BookRecord } from './db'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const COVER_COLORS = [
  '#c0392b', '#e74c3c', '#d35400', '#e67e22',
  '#f39c12', '#27ae60', '#16a085', '#2980b9',
  '#8e44ad', '#2c3e50', '#795548', '#607d8b',
]

function randomColor() {
  return COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)]
}

async function detectSpread(data: ArrayBuffer): Promise<boolean> {
  const doc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise
  const page = await doc.getPage(1)
  const vp = page.getViewport({ scale: 1 })
  return vp.width / vp.height > 1.2
}

async function getTotalPages(data: ArrayBuffer): Promise<number> {
  const doc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise
  return doc.numPages
}

interface EditModalProps {
  book: BookRecord
  onSave: (title: string, color: string) => void
  onClose: () => void
}

function EditModal({ book, onSave, onClose }: EditModalProps) {
  const [title, setTitle] = useState(book.title)
  const [color, setColor] = useState(book.color ?? randomColor())

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-end z-50"
      onClick={onClose}
    >
      <div
        className="w-full bg-stone-900 rounded-t-2xl p-6 flex flex-col gap-5"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-white font-semibold text-lg">本の情報を編集</h2>

        <div>
          <p className="text-stone-400 text-sm mb-2">タイトル</p>
          <input
            className="w-full bg-stone-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-500"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>

        <div>
          <p className="text-stone-400 text-sm mb-3">カバーカラー</p>
          <div className="flex flex-wrap gap-3">
            {COVER_COLORS.map(c => (
              <button
                key={c}
                className="w-9 h-9 rounded-full transition-transform"
                style={{
                  background: c,
                  transform: color === c ? 'scale(1.25)' : 'scale(1)',
                  outline: color === c ? `3px solid white` : 'none',
                  outlineOffset: '2px',
                }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="flex gap-3 mt-2">
          <button
            className="flex-1 py-3 rounded-xl bg-stone-800 text-white text-sm"
            onClick={onClose}
          >キャンセル</button>
          <button
            className="flex-1 py-3 rounded-xl bg-amber-500 text-black font-semibold text-sm"
            onClick={() => onSave(title, color)}
          >保存</button>
        </div>
      </div>
    </div>
  )
}

function BookCover({ book }: { book: BookRecord }) {
  const color = book.color ?? '#2c3e50'
  const label = book.title.length > 10 ? book.title.slice(0, 10) + '…' : book.title
  // 4文字以下は大きく、以降は文字数に応じてシームレスに縮小
  const fontSize = label.length <= 4 ? 22 : Math.max(12, Math.round(88 / label.length))

  return (
    <div
      className="w-full aspect-[3/4] rounded-lg flex flex-col items-center justify-between p-3 relative overflow-hidden"
      style={{ background: color }}
    >
      {/* 装飾ライン */}
      <div className="absolute top-0 left-3 right-3 h-1 bg-white/20 rounded-b-full" />
      <div className="absolute left-0 top-0 bottom-0 w-3 bg-black/20" />

      <div className="flex-1 flex items-center justify-center px-1">
        <span
          className="text-white/90 font-bold select-none text-center leading-snug break-all"
          style={{ fontSize }}
        >{label}</span>
      </div>

      {/* 進捗バー */}
      <div className="w-full h-1 bg-black/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-white/70 rounded-full"
          style={{ width: `${book.totalPages > 1 ? Math.round((book.currentPage / (book.totalPages - 1)) * 100) : 0}%` }}
        />
      </div>
    </div>
  )
}

export default function Bookshelf() {
  const [books, setBooks] = useState<BookRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [editingBook, setEditingBook] = useState<BookRecord | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getAllBooks().then(b => setBooks(b.sort((a, b) => b.addedAt - a.addedAt)))
  }, [])

  async function handleFile(file: File) {
    if (!file.type.includes('pdf')) return
    setLoading(true)
    try {
      const data = await file.arrayBuffer()
      const [totalPages, spreadDetected] = await Promise.all([
        getTotalPages(data),
        detectSpread(data),
      ])
      const id = crypto.randomUUID()
      const record: BookRecord = {
        id,
        title: file.name.replace(/\.pdf$/i, ''),
        color: randomColor(),
        data,
        totalPages,
        currentPage: 0,
        addedAt: Date.now(),
        spreadDetected,
      }
      await saveBook(record)
      setBooks(prev => [record, ...prev])
    } finally {
      setLoading(false)
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) await handleFile(file)
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('この本を削除しますか？')) return
    await deleteBook(id)
    setBooks(prev => prev.filter(b => b.id !== id))
  }

  async function handleSaveMeta(title: string, color: string) {
    if (!editingBook) return
    await updateBookMeta(editingBook.id, title, color)
    setBooks(prev => prev.map(b => b.id === editingBook.id ? { ...b, title, color } : b))
    setEditingBook(null)
  }

  return (
    <div className="min-h-dvh bg-stone-950 text-white flex flex-col">
      <header className="px-4 pt-10 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Bbook</h1>
        <p className="text-stone-400 text-sm mt-1">PDFを本として読む</p>
      </header>

      <div
        className="mx-4 mb-6 border-2 border-dashed border-stone-700 rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer active:bg-stone-800 transition-colors"
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {loading ? (
          <p className="text-stone-400 text-sm">読み込み中...</p>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-stone-800 flex items-center justify-center text-2xl text-stone-300">+</div>
            <p className="text-stone-300 text-sm">PDFを追加</p>
          </>
        )}
      </div>

      <main className="flex-1 px-4 grid grid-cols-2 gap-4 content-start pb-8 sm:grid-cols-3">
        {books.map(book => (
          <div key={book.id} className="flex flex-col gap-2">
            {/* カバー */}
            <div
              className="cursor-pointer active:opacity-80 transition-opacity relative"
              onClick={() => navigate(`/read/${book.id}`)}
            >
              <BookCover book={book} />
              {/* 長押し風の編集ボタン */}
              <button
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white text-xs flex items-center justify-center backdrop-blur-sm"
                onClick={e => { e.stopPropagation(); setEditingBook(book) }}
              >✎</button>
              <button
                className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/50 text-white text-xs flex items-center justify-center backdrop-blur-sm"
                onClick={e => handleDelete(book.id, e)}
              >×</button>
            </div>

            {/* タイトル・進捗 */}
            <div
              className="cursor-pointer"
              onClick={() => navigate(`/read/${book.id}`)}
            >
              <p className="text-xs text-stone-200 leading-snug line-clamp-2 font-medium">{book.title}</p>
              <p className="text-xs text-stone-500 mt-1">{book.currentPage + 1} / {book.totalPages}ページ</p>
            </div>
          </div>
        ))}
      </main>

      {editingBook && (
        <EditModal
          book={editingBook}
          onSave={handleSaveMeta}
          onClose={() => setEditingBook(null)}
        />
      )}
    </div>
  )
}
