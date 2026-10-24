import { useEffect, useRef, type ReactNode } from 'react'
import { BookOpen, Minus, Pin, PinOff, X } from 'lucide-react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { Book } from '../types'

export function TitleBar({
  pinned,
  setPinned,
  discreet,
  notify,
}: {
  pinned: boolean
  setPinned: (value: boolean) => void
  discreet: boolean
  notify: (message: string) => void
}) {
  const native = isTauri()
  const action = async (kind: 'pin' | 'minimize' | 'close') => {
    if (!native) {
      notify('置顶和窗口控制可在桌面版使用')
      return
    }
    try {
      const win = getCurrentWindow()
      if (kind === 'pin') {
        await win.setAlwaysOnTop(!pinned)
        setPinned(!pinned)
      } else if (kind === 'minimize') await win.minimize()
      else await win.close()
    } catch {
      notify('窗口操作失败，请重试')
    }
  }
  return (
    <div className="titlebar">
      <div className="titlebar-drag" data-tauri-drag-region>
        <span className="brand-dot" />
        {discreet ? '工作便签' : '闲读'}
      </div>
      <div className="window-controls">
        {!discreet && (
          <button
            className={pinned ? 'is-pinned' : ''}
            aria-label={pinned ? '取消置顶' : '窗口置顶'}
            title={pinned ? '取消置顶' : '窗口置顶'}
            onClick={() => void action('pin')}
          >
            {pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
        )}
        <button aria-label="最小化窗口" title="最小化" onClick={() => void action('minimize')}>
          <Minus size={15} />
        </button>
        <button
          className="window-close"
          aria-label="关闭窗口"
          title="关闭"
          onClick={() => void action('close')}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

export function Cover({ book, small = false }: { book: Book; small?: boolean }) {
  return (
    <div
      className={`book-cover cover-${book.color} ${small ? 'cover-small' : ''}`}
      aria-hidden="true"
    >
      {book.cover ? (
        <img src={book.cover} alt="" />
      ) : (
        <>
          <span className="cover-rule" />
          <span className="cover-caption">XIANDU · LIBRARY</span>
          <span className="cover-name">{book.title}</span>
          <span className="cover-landscape">
            <i />
            <i />
            <i />
          </span>
          <span className="cover-author">
            {book.author === '本地书籍' ? '私人藏书' : book.author}
          </span>
        </>
      )}
      <span className="cover-spine" />
    </div>
  )
}

export function Modal({
  title,
  children,
  close,
  className = '',
}: {
  title: string
  children: ReactNode
  close: () => void
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current!
    const first = dialog.querySelector<HTMLElement>('button,input,select,textarea,[tabindex="0"]')
    first?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,textarea,[tabindex="0"]',
          ),
        )
        const first = focusable[0],
          last = focusable.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', keydown, true)
    return () => {
      document.removeEventListener('keydown', keydown, true)
      previous?.focus()
    }
  }, [close])
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        className={`modal-sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="sheet-handle" />
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="关闭面板" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <BookOpen size={28} strokeWidth={1.3} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}
