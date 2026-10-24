import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { demoBooks } from './demo'
import {
  getContent,
  initializeLibrary,
  removeBook,
  saveBook,
  saveImported,
  readSettings,
} from './storage'

describe('persistent local library', () => {
  it('saves content, avoids duplicates, remembers progress, deletes atomically and does not resurrect examples', async () => {
    const examples = demoBooks()
    expect(await initializeLibrary(examples)).toHaveLength(3)
    expect(await saveImported(examples[0])).toBe(false)
    const book = { ...examples[0].book, progress: { chapter: 1, offset: 203 }, percentage: 47 }
    await saveBook(book)
    expect(
      (await initializeLibrary(examples)).find((item) => item.id === book.id)?.progress,
    ).toEqual({ chapter: 1, offset: 203 })
    expect((await getContent(book.id))?.chapters).toHaveLength(3)
    await removeBook(book.id)
    expect(await getContent(book.id)).toBeUndefined()
    expect(await initializeLibrary(examples)).toHaveLength(2)
  })
  it('bounds or repairs invalid saved settings', () => {
    localStorage.setItem('xiandu-settings', '{"fontSize":999,"theme":"bad","turn":"scroll"}')
    expect(readSettings()).toMatchObject({ fontSize: 28, theme: 'paper', turn: 'scroll' })
    localStorage.setItem('xiandu-settings', 'bad json')
    expect(readSettings().fontSize).toBe(19)
  })
})
