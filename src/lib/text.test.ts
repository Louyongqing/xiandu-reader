import { describe, expect, it } from 'vitest'
import {
  decodeText,
  htmlText,
  limitChapterLength,
  pageAtOffset,
  paginate,
  splitChapters,
} from './text'

describe('novel text import', () => {
  it('recognizes UTF-8, UTF-16 and GB18030 without garbling Chinese', () => {
    expect(decodeText(new TextEncoder().encode('雨停之前'))).toBe('雨停之前')
    expect(decodeText(new Uint8Array([255, 254, 45, 78, 135, 101]))).toBe('中文')
    expect(decodeText(new Uint8Array([254, 255, 78, 45, 101, 135]))).toBe('中文')
    expect(decodeText(new Uint8Array([214, 208, 206, 196]))).toBe('中文')
  })
  it('keeps prologue, recognizes chapter headings, and preserves all body text', () => {
    const result = splitChapters(
      '前面的文字\r\n\r\n第一章 初见\r\n山色亮了起来。\r\n第二章 回信\r\n风经过窗户。',
    )
    expect(result).toEqual([
      { title: '正文', text: '前面的文字' },
      { title: '第一章 初见', text: '山色亮了起来。' },
      { title: '第二章 回信', text: '风经过窗户。' },
    ])
  })
  it('extracts safe text from XHTML and malformed HTML without retaining executable content', () => {
    const clean = htmlText(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第一章</h1><p>山色<em>很美</em>。</p><script>window.pwned=true</script><style>body{display:none}</style><img src="https://example.com/tracker" onerror="alert(1)"/><p>风来了。</p></body></html>',
    )
    expect(clean.title).toBe('第一章')
    expect(clean.text).toContain('山色很美。')
    expect(clean.text).toContain('风来了。')
    expect(clean.text).not.toMatch(/pwned|display|example|onerror/)
    expect(htmlText('<p>甲<br>乙<img src=x onerror=alert(1)><p>丙').text).toContain('甲\n乙')
  })
  it('splits huge chapters without dropping text or breaking emoji', () => {
    const text = '草木😀'.repeat(10000)
    const parts = limitChapterLength([{ title: '第一章', text }])
    expect(parts.map((part) => part.text).join('')).toBe(text)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every((part) => !/[\uD800-\uDBFF]$/.test(part.text))).toBe(true)
  })
})

describe('position-based pagination', () => {
  it('keeps every character, including spaces and paragraph breaks, on consecutive pages', () => {
    const text = '第一行。\n\n第二行有 😀 表情。'.repeat(100)
    const pages = paginate(text, (value) => value.length <= 39)
    expect(pages.map((page) => page.text).join('')).toBe(text)
    expect(pages.every((page) => page.text.length <= 39)).toBe(true)
    expect(pages.every((page) => !/[\uD800-\uDBFF]$/.test(page.text))).toBe(true)
    expect(pages.every((page, index) => index === 0 || page.start === pages[index - 1].end)).toBe(
      true,
    )
  })
  it('relocates the same text offset when the page size changes', () => {
    const text = '天地玄黄宇宙洪荒'.repeat(100)
    const before = paginate(text, (value) => value.length <= 80)
    const savedOffset = before[4].start
    const after = paginate(text, (value) => value.length <= 51)
    const restored = after[pageAtOffset(after, savedOffset)]
    expect(restored.start).toBeLessThanOrEqual(savedOffset)
    expect(restored.end).toBeGreaterThan(savedOffset)
    expect(pageAtOffset(after, Infinity)).toBe(after.length - 1)
  })
})
