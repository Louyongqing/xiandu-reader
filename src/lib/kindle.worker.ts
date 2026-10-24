import { initMobiFile, initKf8File } from '@lingo-reader/mobi-parser'

self.onmessage = async ({ data }: MessageEvent<{ bytes: Uint8Array; format: 'MOBI' | 'AZW3' }>) => {
  let parser:
    Awaited<ReturnType<typeof initMobiFile>> | Awaited<ReturnType<typeof initKf8File>> | undefined
  try {
    const { bytes, format } = data
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length < 86) throw new Error('Kindle 文件不完整。')
    const offset = view.getUint32(78)
    if (offset + 16 > bytes.length) throw new Error('Kindle 文件头无效。')
    if (view.getUint16(offset + 12) !== 0)
      throw new Error('这本书有 DRM 加密，请使用无 DRM 的版本。')
    if (view.getUint32(offset + 4) > 80000000) throw new Error('Kindle 正文过大，请分卷导入。')
    let kf8 = format === 'AZW3' || view.getUint32(offset + 36) >= 8
    // Hybrid MOBI files embed a KF8 section described by EXTH record 121.
    if (!kf8 && offset + 132 <= bytes.length && view.getUint32(offset + 128) & 64) {
      const exth = offset + 16 + view.getUint32(offset + 20)
      if (exth + 12 <= bytes.length && view.getUint32(exth) === 0x45585448) {
        const records = view.getUint32(exth + 8)
        let cursor = exth + 12
        for (let i = 0; i < records && cursor + 8 <= bytes.length; i++) {
          const type = view.getUint32(cursor),
            length = view.getUint32(cursor + 4)
          if (length < 8 || cursor + length > bytes.length) break
          if (type === 121 && length >= 12 && view.getUint32(cursor + 8) < 0xffffffff) kf8 = true
          cursor += length
        }
      }
    }
    parser = kf8 ? await initKf8File(bytes) : await initMobiFile(bytes)
    const metadata = parser.getMetadata()
    const titles = new Map<string, string>()
    const walk = (
      items: { label: string; href: string; children?: { label: string; href: string }[] }[],
    ) => {
      for (const item of items) {
        const resolved = parser!.resolveHref(item.href)
        if (resolved && !titles.has(resolved.id)) titles.set(resolved.id, item.label)
        if (item.children) walk(item.children)
      }
    }
    walk(parser.getToc())
    let total = 0
    const chapters = parser.getSpine().map((item) => {
      const chapter = parser!.loadChapter(item.id)
      const html = chapter?.html || ''
      total += html.length
      if (total > 80000000) throw new Error('Kindle 正文过大，请分卷导入。')
      return { title: titles.get(item.id) || '', html }
    })
    self.postMessage({ title: metadata.title, author: metadata.author.join('、'), chapters })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    self.postMessage({
      error: /[\u4e00-\u9fff]/.test(message)
        ? message
        : 'Kindle 文件解析失败，请确认文件完整且未加密。',
    })
  } finally {
    parser?.destroy()
  }
}
