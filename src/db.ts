import { openDB, type DBSchema } from 'idb'

export interface BookRecord {
  id: string
  title: string
  data: ArrayBuffer
  totalPages: number
  currentPage: number
  addedAt: number
  // 幅/高さ比率 > 1.2 なら見開きと判定して保存
  spreadDetected: boolean
}

interface BbookDB extends DBSchema {
  books: {
    key: string
    value: BookRecord
  }
}

const DB_NAME = 'bbook'
const DB_VERSION = 1

export const db = openDB<BbookDB>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    db.createObjectStore('books', { keyPath: 'id' })
  },
})

export async function saveBook(record: BookRecord) {
  return (await db).put('books', record)
}

export async function getBook(id: string) {
  return (await db).get('books', id)
}

export async function getAllBooks() {
  return (await db).getAll('books')
}

export async function deleteBook(id: string) {
  return (await db).delete('books', id)
}

export async function updateProgress(id: string, currentPage: number) {
  const store = (await db)
  const book = await store.get('books', id)
  if (!book) return
  book.currentPage = currentPage
  return store.put('books', book)
}
