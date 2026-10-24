export type BookFormat = 'TXT' | 'EPUB' | 'MOBI' | 'AZW3' | 'PDF' | 'FB2'
export interface Chapter {
  title: string
  text: string
}
export interface Position {
  chapter: number
  offset: number
}
export interface Bookmark extends Position {
  id: string
  label: string
  createdAt: number
}
export interface Book {
  id: string
  title: string
  author: string
  format: BookFormat
  size: number
  cover?: string
  color: number
  addedAt: number
  lastRead: number
  progress: Position
  percentage: number
  favorite: boolean
  bookmarks: Bookmark[]
  chapterCount: number
  demo?: boolean
}
export interface BookContent {
  id: string
  chapters: Chapter[]
  pdf?: ArrayBuffer
}
export interface ImportedBook {
  book: Book
  content: BookContent
}
export interface ReaderSettings {
  theme: 'paper' | 'white' | 'sage' | 'night'
  fontSize: number
  lineHeight: number
  font: 'serif' | 'sans'
  turn: 'slide' | 'instant' | 'scroll'
}
export const defaultSettings: ReaderSettings = {
  theme: 'paper',
  fontSize: 19,
  lineHeight: 1.9,
  font: 'serif',
  turn: 'slide',
}
