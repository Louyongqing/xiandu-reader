import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { checkArchive, importBook } from './importer'

const file = (name: string, buffer: ArrayBuffer) =>
  ({ name, size: buffer.byteLength, arrayBuffer: async () => buffer }) as File
async function epub(href = 'second.xhtml') {
  const zip = new JSZip()
  zip.file(
    'META-INF/container.xml',
    '<container><rootfiles><rootfile full-path="book/package.opf"/></rootfiles></container>',
  )
  zip.file(
    'book/package.opf',
    `<package><metadata><title>离线书籍</title><creator>测试作者</creator></metadata><manifest><item id="one" href="first.xhtml"/><item id="two" href="${href}"/></manifest><spine><itemref idref="two"/><itemref idref="one"/></spine></package>`,
  )
  zip.file(
    'book/first.xhtml',
    '<html><head><title>内部标题</title></head><body><h1>第一章</h1><p>前一篇正文。</p></body></html>',
  )
  zip.file(
    'book/second.xhtml',
    '<html><body><h1>第二章</h1><script>evil()</script><p>后一篇正文。</p></body></html>',
  )
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}

describe('import boundaries', () => {
  it('preserves FB2 parent text before and after nested sections in reading order', async () => {
    const source =
      '<FictionBook><body><section><title><p>第一卷</p></title><p>卷首文字</p><section><title><p>第一章</p></title><p>章节正文</p></section><p>卷末文字</p></section></body></FictionBook>'
    const result = await importBook(file('nested.fb2', new TextEncoder().encode(source).buffer))
    expect(result.content.chapters.map((chapter) => chapter.text)).toEqual([
      '卷首文字',
      '章节正文',
      '卷末文字',
    ])
    expect(result.content.chapters.map((chapter) => chapter.title)).toEqual([
      '第一卷',
      '第一章',
      '第一卷',
    ])
  })
  it('follows EPUB spine order and keeps only inert body text', async () => {
    const result = await importBook(file('test.epub', await epub()))
    expect(result.book.title).toBe('离线书籍')
    expect(result.book.author).toBe('测试作者')
    expect(result.content.chapters.map((item) => item.title)).toEqual(['第二章', '第一章'])
    expect(result.content.chapters[0].text).toContain('后一篇正文')
    expect(result.content.chapters[0].text).not.toContain('evil')
    expect(result.content.chapters[1].text).not.toContain('内部标题')
  })
  it('rejects external chapter URLs and traversal above the archive root', async () => {
    await expect(
      importBook(file('remote.epub', await epub('https://example.com/body'))),
    ).rejects.toThrow('外部正文')
    await expect(
      importBook(file('traversal.epub', await epub('../../body.xhtml'))),
    ).rejects.toThrow('路径无效')
  })
  it('rejects invalid archives and oversized expanded archives before decompression', async () => {
    expect(() => checkArchive(new Uint8Array([1, 2, 3]))).toThrow('损坏')
    const bytes = new Uint8Array(await epub())
    const view = new DataView(bytes.buffer)
    for (let i = 0; i < bytes.length - 28; i++) {
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 130 * 1024 * 1024, true)
        break
      }
    }
    expect(() => checkArchive(bytes)).toThrow('120 MB')
  })
})
