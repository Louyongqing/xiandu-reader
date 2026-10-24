import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export async function loadPdf(buffer: ArrayBuffer) {
  const task = getDocument({
    data: buffer,
    useSystemFonts: true,
    cMapUrl: '/pdf/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdf/standard_fonts/',
    wasmUrl: '/pdf/wasm/',
  })
  try {
    return await task.promise
  } catch (error) {
    await task.destroy()
    if (error instanceof Error && error.name === 'PasswordException')
      throw new Error('PDF 需要密码，请先导出无密码版本再导入。')
    throw new Error('PDF 无法打开，请检查文件是否完整。')
  }
}
