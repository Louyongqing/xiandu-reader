import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdf } from '../lib/pdf'

export default function PdfPage({
  buffer,
  page,
  report,
}: {
  buffer: ArrayBuffer
  page: number
  report: (message: string) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [width, setWidth] = useState(320)
  const [zoom, setZoom] = useState(1)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    let document: PDFDocumentProxy | undefined
    void loadPdf(buffer.slice(0))
      .then((result) => {
        document = result
        if (cancelled) void result.loadingTask.destroy()
        else setPdf(result)
      })
      .catch((error) => {
        if (!cancelled) {
          setError(error.message)
          setBusy(false)
          report(error.message)
        }
      })
    return () => {
      cancelled = true
      void document?.loadingTask.destroy()
    }
  }, [buffer, report])
  useEffect(() => {
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width - 24))
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!pdf || !canvas.current) return
    let cancelled = false
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined
    setBusy(true)
    setError('')
    void pdf
      .getPage(page + 1)
      .then(async (pdfPage) => {
        if (cancelled || !canvas.current) return
        const viewport = pdfPage.getViewport({ scale: 1 })
        const scale = (width / viewport.width) * zoom
        const display = pdfPage.getViewport({ scale })
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        const target = canvas.current
        target.width = Math.ceil(display.width * ratio)
        target.height = Math.ceil(display.height * ratio)
        target.style.width = `${display.width}px`
        target.style.height = `${display.height}px`
        task = pdfPage.render({
          canvas: target,
          viewport: display,
          transform: [ratio, 0, 0, ratio, 0, 0],
        })
        await task.promise
        if (!cancelled) setBusy(false)
      })
      .catch((error) => {
        if (!cancelled && error.name !== 'RenderingCancelledException') {
          setError('这一页暂时无法渲染，请尝试重新打开书籍。')
          setBusy(false)
        }
      })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, page, width, zoom])
  return (
    <div className="pdf-reader" ref={container}>
      <div className="pdf-zoom" onClick={(event) => event.stopPropagation()}>
        <button
          aria-label="缩小 PDF"
          disabled={zoom <= 1}
          onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
        >
          <Minus size={15} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          aria-label="放大 PDF"
          disabled={zoom >= 3}
          onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
        >
          <Plus size={15} />
        </button>
        <button aria-label="适合宽度" onClick={() => setZoom(1)}>
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="pdf-scroll">
        {busy && <span className="pdf-loading">正在绘制页面…</span>}
        {error && <p role="alert">{error}</p>}
        <canvas
          ref={canvas}
          aria-label={`PDF 第 ${page + 1} 页`}
          style={{ visibility: busy || error ? 'hidden' : 'visible' }}
        />
      </div>
    </div>
  )
}
