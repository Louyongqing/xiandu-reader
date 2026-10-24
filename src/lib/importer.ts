import JSZip from 'jszip'
import type { BookFormat, Chapter, ImportedBook } from '../types'
import { decodeText, htmlText, limitChapterLength, normalizeText, splitChapters } from './text'

export const ACCEPTED_EXTENSIONS = '.txt,.epub,.mobi,.azw3,.pdf,.fb2'
const MAX_FILE = 50 * 1024 * 1024
const MAX_EXPANDED = 120 * 1024 * 1024

export function checkArchive(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.length - 22
  const min = Math.max(0, bytes.length - 65557)
  while (end >= min && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < min) throw new Error('EPUB 文件损坏，无法读取目录。')
  const count = view.getUint16(end + 10, true)
  let cursor = view.getUint32(end + 16, true)
  if (count === 0xffff || count > 10000) throw new Error('EPUB 内容过多，请导入普通小说版本。')
  let total = 0
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error('EPUB 目录不完整。')
    total += view.getUint32(cursor + 24, true)
    if (total > MAX_EXPANDED) throw new Error('EPUB 解压后超过 120 MB，请导入较小的文件。')
    cursor +=
      46 +
      view.getUint16(cursor + 28, true) +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true)
  }
}

const xml = (source: string) => {
  const doc = new DOMParser().parseFromString(source, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('电子书结构损坏，无法解析。')
  return doc
}
const elements = (doc: Document | Element, name: string) =>
  Array.from(doc.getElementsByTagNameNS('*', name))
const firstText = (doc: Document | Element, name: string) =>
  elements(doc, name)[0]?.textContent?.trim() || ''

function archivePath(base: string, href: string): string {
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(href))
    throw new Error('电子书引用了外部正文，无法离线导入。')
  const raw = decodeURIComponent(href.split('#')[0]).replace(/\\/g, '/')
  const parts = (base + raw).split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '..') {
      if (!resolved.length) throw new Error('电子书资源路径无效。')
      resolved.pop()
    } else if (part && part !== '.') resolved.push(part)
  }
  return resolved.join('/')
}

async function parseEpub(bytes: Uint8Array) {
  checkArchive(bytes)
  const zip = await JSZip.loadAsync(bytes)
  const container = zip.file('META-INF/container.xml')
  if (!container) throw new Error('不是有效的 EPUB 文件：缺少 container.xml。')
  const opfPath = elements(xml(await container.async('string')), 'rootfile')[0]?.getAttribute(
    'full-path',
  )
  const opfFile = opfPath && zip.file(archivePath('', opfPath))
  if (!opfFile || !opfPath) throw new Error('EPUB 缺少书籍信息。')
  const opf = xml(await opfFile.async('string'))
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const items = elements(opf, 'item')
  const manifest = new Map(items.map((item) => [item.getAttribute('id'), item]))
  const chapters: Chapter[] = []
  const encryption = zip.file('META-INF/encryption.xml')
  if (encryption) {
    const encrypted = xml(await encryption.async('string'))
    const paths = elements(encrypted, 'CipherReference').map((el) => el.getAttribute('URI'))
    if (
      items.some(
        (item) =>
          /html|xml/.test(item.getAttribute('media-type') || '') &&
          paths.includes(base + item.getAttribute('href')),
      )
    ) {
      throw new Error('这本 EPUB 的正文已加密，请导入无 DRM 的版本。')
    }
  }
  for (const ref of elements(opf, 'itemref')) {
    if (ref.getAttribute('linear') === 'no') continue
    const item = manifest.get(ref.getAttribute('idref'))
    const href = item?.getAttribute('href')
    if (!href) throw new Error('EPUB 章节索引不完整。')
    const file = zip.file(archivePath(base, href))
    if (!file) throw new Error(`EPUB 缺少章节文件：${href}`)
    const parsed = htmlText(await file.async('string'))
    if (parsed.text)
      chapters.push({ title: parsed.title || `第 ${chapters.length + 1} 节`, text: parsed.text })
  }
  const coverId = elements(opf, 'meta')
    .find((el) => el.getAttribute('name') === 'cover')
    ?.getAttribute('content')
  const coverItem =
    items.find((el) => el.getAttribute('properties')?.split(' ').includes('cover-image')) ||
    manifest.get(coverId || '')
  let cover: string | undefined
  if (
    coverItem &&
    /^image\/(jpeg|png|webp|gif)$/.test(coverItem.getAttribute('media-type') || '')
  ) {
    const coverFile = zip.file(archivePath(base, coverItem.getAttribute('href') || ''))
    if (coverFile) {
      const data = await coverFile.async('uint8array')
      if (data.length <= 4 * 1024 * 1024)
        cover = `data:${coverItem.getAttribute('media-type')};base64,${await coverFile.async('base64')}`
    }
  }
  return {
    title: firstText(opf, 'title'),
    author: firstText(opf, 'creator'),
    chapters: limitChapterLength(chapters),
    cover,
  }
}

function parseFb2(bytes: Uint8Array) {
  const doc = xml(decodeText(bytes))
  const titleInfo = elements(doc, 'title-info')[0]
  const author = titleInfo && elements(titleInfo, 'author')[0]
  const chapters: Chapter[] = []
  const visit = (section: Element, inheritedTitle = '正文') => {
    const title =
      Array.from(section.children)
        .find((child) => child.localName === 'title')
        ?.textContent?.trim() || inheritedTitle
    let paragraphs: string[] = []
    const flush = () => {
      const text = normalizeText(paragraphs.join('\n\n'))
      if (text) chapters.push({ title, text })
      paragraphs = []
    }
    for (const child of Array.from(section.children)) {
      if (child.localName === 'section') {
        flush()
        visit(child, title)
      } else if (child.localName === 'p' || child.localName === 'v')
        paragraphs.push(child.textContent || '')
      else if (child.localName !== 'title')
        paragraphs.push(...elements(child, 'p').map((p) => p.textContent || ''))
    }
    flush()
  }
  elements(doc, 'body').forEach((body) => visit(body))
  return {
    title: titleInfo ? firstText(titleInfo, 'book-title') : '',
    author: author
      ? [firstText(author, 'first-name'), firstText(author, 'last-name')].filter(Boolean).join(' ')
      : '',
    chapters: limitChapterLength(chapters),
  }
}

function parseKindle(
  bytes: Uint8Array,
  format: 'MOBI' | 'AZW3',
): Promise<{ title: string; author: string; chapters: Chapter[] }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./kindle.worker.ts', import.meta.url), { type: 'module' })
    const timer = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('解析超过 30 秒，请检查文件或转换为 EPUB 后重试。'))
    }, 30000)
    worker.onmessage = ({ data }) => {
      clearTimeout(timer)
      worker.terminate()
      if (data.error) {
        reject(new Error(data.error))
        return
      }
      const chapters = (data.chapters as { title: string; html: string }[])
        .map((chapter, index) => {
          const parsed = htmlText(chapter.html)
          return { title: parsed.title || chapter.title || `第 ${index + 1} 节`, text: parsed.text }
        })
        .filter((chapter) => chapter.text)
      resolve({ title: data.title, author: data.author, chapters: limitChapterLength(chapters) })
    }
    worker.onerror = () => {
      clearTimeout(timer)
      worker.terminate()
      reject(new Error('Kindle 文件解析失败，请尝试导入无 DRM 的 EPUB 版本。'))
    }
    worker.postMessage({ bytes, format }, [bytes.buffer])
  })
}

export async function importBook(file: File): Promise<ImportedBook> {
  const format = file.name.split('.').pop()?.toUpperCase() as BookFormat
  if (!['TXT', 'EPUB', 'MOBI', 'AZW3', 'PDF', 'FB2'].includes(format))
    throw new Error('暂不支持这种格式，请选择 TXT、EPUB、MOBI、AZW3、PDF 或 FB2。')
  if (!file.size) throw new Error('文件是空的，请重新选择。')
  if (file.size > MAX_FILE) throw new Error('单本书不能超过 50 MB，请选择较小的文件。')
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  const id = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('')
  let parsed: { title?: string; author?: string; chapters: Chapter[]; cover?: string } = {
    chapters: [],
  }
  if (format === 'TXT') {
    const text = decodeText(bytes)
    if (text.slice(0, 2000).includes('\u0000'))
      throw new Error('TXT 包含二进制内容，请检查文件格式。')
    parsed.chapters = splitChapters(text)
  } else if (format === 'EPUB') parsed = await parseEpub(bytes)
  else if (format === 'FB2') parsed = parseFb2(bytes)
  else if (format === 'MOBI' || format === 'AZW3') parsed = await parseKindle(bytes, format)
  else {
    const { loadPdf } = await import('./pdf')
    const pdf = await loadPdf(buffer.slice(0))
    try {
      const metadata = await pdf.getMetadata()
      const info = metadata.info as { Title?: string; Author?: string }
      parsed = {
        title: info.Title,
        author: info.Author,
        chapters: Array.from({ length: pdf.numPages }, (_, i) => ({
          title: `第 ${i + 1} 页`,
          text: '',
        })),
      }
    } finally {
      await pdf.loadingTask.destroy()
    }
  }
  if (!parsed.chapters.length)
    throw new Error('未找到可阅读的正文，请确认这本书未加密且不是纯图片电子书。')
  if (parsed.chapters.reduce((total, chapter) => total + chapter.text.length, 0) > 20000000)
    throw new Error('正文超过 2000 万字，请分卷导入。')
  return {
    book: {
      id,
      title: normalizeText(parsed.title || file.name.replace(/\.[^.]+$/, '')).slice(0, 200),
      author: normalizeText(parsed.author || '本地书籍').slice(0, 200),
      format,
      size: file.size,
      cover: parsed.cover,
      color: parseInt(id.slice(0, 2), 16) % 6,
      addedAt: Date.now(),
      lastRead: 0,
      progress: { chapter: 0, offset: 0 },
      percentage: 0,
      favorite: false,
      bookmarks: [],
      chapterCount: parsed.chapters.length,
    },
    content: { id, chapters: parsed.chapters, ...(format === 'PDF' ? { pdf: buffer } : {}) },
  }
}
