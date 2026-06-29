import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url'
import { getAllBooks, saveBook, deleteBook, type BookRecord } from './db'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

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

export default function Bookshelf() {
  const [books, setBooks] = useState<BookRecord[]>([])
  const [loading, setLoading] = useState(false)
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
    await deleteBook(id)
    setBooks(prev => prev.filter(b => b.id !== id))
  }

  return (
    <div className="min-h-dvh bg-stone-950 text-white flex flex-col">
      <header className="px-4 pt-8 pb-4">
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
            <div className="w-12 h-12 rounded-full bg-stone-800 flex items-center justify-center text-2xl">+</div>
            <p className="text-stone-300 text-sm">PDFを追加</p>
          </>
        )}
      </div>

      <main className="flex-1 px-4 grid grid-cols-2 gap-3 content-start pb-8">
        {books.map(book => (
          <div
            key={book.id}
            className="bg-stone-900 rounded-xl p-3 flex flex-col gap-2 cursor-pointer active:bg-stone-800 transition-colors relative"
            onClick={() => navigate(`/read/${book.id}`)}
          >
            <button
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-stone-700 text-stone-300 text-xs flex items-center justify-center"
              onClick={e => handleDelete(book.id, e)}
            >×</button>
            <div className="aspect-[3/4] bg-stone-800 rounded-lg flex items-end p-2">
              <div
                className="h-1 rounded bg-amber-500"
                style={{ width: `${book.totalPages > 0 ? Math.round((book.currentPage / (book.totalPages - 1)) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-stone-200 leading-tight line-clamp-2">{book.title}</p>
            <p className="text-xs text-stone-500">{book.currentPage + 1} / {book.totalPages}ページ</p>
          </div>
        ))}
      </main>
    </div>
  )
}
