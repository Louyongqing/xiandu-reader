import type { Chapter } from '../types'

export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('gb18030').decode(bytes)
  }
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[\t \u3000]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Read inert XML and retain only text. Imported markup, scripts, URLs and CSS never enter the live DOM.
export function htmlText(html: string): { title: string; text: string } {
  const doc = new DOMParser().parseFromString(
    `<root>${html.replace(/<!DOCTYPE[^>]*>/gi, '').replace(/&nbsp;/g, '&#160;')}</root>`,
    'application/xml',
  )
  let root: ParentNode = doc.documentElement
  if (doc.querySelector('parsererror')) {
    const template = document.createElement('template')
    template.innerHTML = html
    root = template.content
  }
  const title =
    root.querySelector('h1,h2,h3')?.textContent?.trim() ||
    root.querySelector('title')?.textContent?.trim() ||
    ''
  root
    .querySelectorAll('head,script,style,iframe,object,embed,link,meta,svg,noscript,nav')
    .forEach((node) => node.remove())
  root.querySelectorAll('br').forEach((node) => node.replaceWith('\n'))
  root
    .querySelectorAll('p,div,section,article,h1,h2,h3,h4,li,tr,blockquote')
    .forEach((node) => node.append('\n\n'))
  return { title, text: normalizeText(root.textContent || '') }
}

const heading =
  /^(?:第[零〇一二三四五六七八九十百千万两\d]+[章节回卷部集篇][\s\S]{0,50}|(?:序章|楔子|序言|前言|后记|尾声|番外)[\s\S]{0,40}|chapter\s+[\divxlc]+[\s\S]{0,60})$/i

export function splitChapters(raw: string): Chapter[] {
  const lines = normalizeText(raw).split('\n')
  const chapters: Chapter[] = []
  let title = '正文'
  let body: string[] = []
  const flush = () => {
    const text = normalizeText(body.join('\n'))
    if (text) chapters.push({ title, text })
    body = []
  }
  for (const line of lines) {
    const trimmed = line.trim()
    if (heading.test(trimmed)) {
      flush()
      title = trimmed
    } else body.push(line)
  }
  flush()
  return limitChapterLength(chapters)
}

export function limitChapterLength(chapters: Chapter[]): Chapter[] {
  return chapters.flatMap((chapter) => {
    const parts: Chapter[] = []
    let remaining = chapter.text
    while (remaining.length > 14000) {
      let end = remaining.lastIndexOf('\n', 14000)
      if (end < 7000) end = 14000
      if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--
      parts.push({
        title: parts.length ? `${chapter.title} · ${parts.length + 1}` : chapter.title,
        text: remaining.slice(0, end),
      })
      remaining = remaining.slice(end)
    }
    if (remaining.trim())
      parts.push({
        title: parts.length ? `${chapter.title} · ${parts.length + 1}` : chapter.title,
        text: remaining,
      })
    return parts
  })
}

export interface Page {
  start: number
  end: number
  text: string
}
export function paginate(text: string, fits: (text: string) => boolean): Page[] {
  const pages: Page[] = []
  let start = 0
  while (start < text.length) {
    let low = start + 1
    let high = Math.min(text.length, start + 6000)
    let end = low
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      if (fits(text.slice(start, middle))) {
        end = middle
        low = middle + 1
      } else high = middle - 1
    }
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--
    if (end <= start) end = start + (text.codePointAt(start)! > 0xffff ? 2 : 1)
    pages.push({ start, end, text: text.slice(start, end) })
    start = end
  }
  return pages.length ? pages : [{ start: 0, end: 0, text: '' }]
}

export function pageAtOffset(pages: Page[], offset: number): number {
  const index = pages.findIndex((page) => offset < page.end)
  return index < 0 ? pages.length - 1 : index
}
