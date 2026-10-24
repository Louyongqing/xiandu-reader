import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Book, BookContent, ImportedBook, ReaderSettings } from '../types'
import { defaultSettings } from '../types'

interface LibraryDB extends DBSchema {
  books: { key: string; value: Book }
  content: { key: string; value: BookContent }
  meta: { key: string; value: boolean }
}
// Version 1 creates the local schema; future schema changes must use an upgrade migration.
let connection: Promise<IDBPDatabase<LibraryDB>> | undefined
const db = () =>
  (connection ??= openDB<LibraryDB>('xiandu-library', 1, {
    upgrade(database) {
      database.createObjectStore('books', { keyPath: 'id' })
      database.createObjectStore('content', { keyPath: 'id' })
      database.createObjectStore('meta')
    },
  }))

export async function initializeLibrary(examples: ImportedBook[]) {
  const database = await db()
  const transaction = database.transaction(['books', 'content', 'meta'], 'readwrite')
  if (!(await transaction.objectStore('meta').get('initialized'))) {
    for (const item of examples) {
      await transaction.objectStore('books').put(item.book)
      await transaction.objectStore('content').put(item.content)
    }
    await transaction.objectStore('meta').put(true, 'initialized')
  }
  await transaction.done
  return database.getAll('books')
}

export async function saveImported(item: ImportedBook): Promise<boolean> {
  const database = await db()
  const transaction = database.transaction(['books', 'content'], 'readwrite')
  if (await transaction.objectStore('books').get(item.book.id)) {
    await transaction.done
    return false
  }
  await transaction.objectStore('books').put(item.book)
  await transaction.objectStore('content').put(item.content)
  await transaction.done
  return true
}
export async function saveBook(book: Book) {
  return (await db()).put('books', book)
}
export async function getContent(id: string) {
  return (await db()).get('content', id)
}
export async function removeBook(id: string) {
  const database = await db()
  const transaction = database.transaction(['books', 'content'], 'readwrite')
  await transaction.objectStore('books').delete(id)
  await transaction.objectStore('content').delete(id)
  await transaction.done
}

export function readSettings(): ReaderSettings {
  try {
    const value = JSON.parse(localStorage.getItem('xiandu-settings') || '{}')
    return {
      theme: ['paper', 'white', 'sage', 'night'].includes(value.theme)
        ? value.theme
        : defaultSettings.theme,
      fontSize: Number.isFinite(value.fontSize)
        ? Math.max(14, Math.min(28, value.fontSize))
        : defaultSettings.fontSize,
      lineHeight: [1.6, 1.9, 2.2].includes(value.lineHeight)
        ? value.lineHeight
        : defaultSettings.lineHeight,
      font: value.font === 'sans' ? 'sans' : 'serif',
      turn: ['slide', 'instant', 'scroll'].includes(value.turn) ? value.turn : defaultSettings.turn,
    }
  } catch {
    return { ...defaultSettings }
  }
}
