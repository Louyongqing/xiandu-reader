import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  ArrowLeft,
  Bookmark as BookmarkIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  List,
  MoreHorizontal,
  Moon,
  Settings2,
  X,
} from 'lucide-react'
import type { Book, BookContent, Position, ReaderSettings } from '../types'
import { pageAtOffset } from '../lib/text'
import { useChapterPages } from '../lib/useChapterPages'
import { Appearance } from './Appearance'
import { ScrollText } from './ScrollText'
import { Modal } from './ui'

const PdfPage = lazy(() => import('./PdfPage'))

export function Reader({
  book,
  content,
  settings,
  onSettings,
  onUpdate,
  onBack,
  notify,
  initialPosition,
  suspended,
}: {
  book: Book
  content: BookContent
  settings: ReaderSettings
  onSettings: (settings: ReaderSettings) => void
  onUpdate: (id: string, patch: Partial<Book>) => void
  onBack: () => void
  notify: (message: string) => void
  initialPosition?: Position
  suspended: boolean
}) {
  const [position, setPosition] = useState<Position>(initialPosition || book.progress)
  const [navigation, setNavigation] = useState(0)
  const [menu, setMenu] = useState(false)
  const [panel, setPanel] = useState<'toc' | 'settings' | null>(null)
  const [tocTab, setTocTab] = useState<'chapters' | 'bookmarks'>('chapters')
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState(1)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const viewport = useRef<HTMLDivElement>(null)
  const measure = useRef<HTMLDivElement>(null)
  const touch = useRef({ x: 0, y: 0, at: 0, movedAt: 0 })
  const wheel = useRef(0)
  const chapterIndex = Math.min(content.chapters.length - 1, Math.max(0, position.chapter))
  const chapter = content.chapters[chapterIndex]
  const pdf = !!content.pdf
  const scrollMode = !pdf && settings.turn === 'scroll'
  const pages = useChapterPages(
    content.chapters,
    chapterIndex,
    dimensions,
    settings,
    measure,
    !pdf && !scrollMode,
  )
  const pageIndex = Math.max(0, pageAtOffset(pages, position.offset))
  const currentPage = pages[pageIndex]
  const offset = pdf ? 0 : scrollMode ? position.offset : (currentPage?.start ?? 0)
  const currentBookmark = book.bookmarks.find(
    (mark) => mark.chapter === chapterIndex && mark.offset === offset,
  )
  const lengths = useMemo(() => content.chapters.map((chapter) => chapter.text.length), [content])
  const totalLength = lengths.reduce((a, b) => a + b, 0)
  const progress = pdf
    ? (chapterIndex + 1) / content.chapters.length
    : (lengths.slice(0, chapterIndex).reduce((a, b) => a + b, 0) +
        (scrollMode ? Math.min(chapter.text.length, offset + 1) : currentPage?.end || 0)) /
      Math.max(totalLength, 1)
  const closePanel = useCallback(() => setPanel(null), [])
  const trackPosition = useCallback((next: Position) => {
    setPosition((current) =>
      current.chapter === next.chapter && current.offset === next.offset ? current : next,
    )
  }, [])

  useLayoutEffect(() => {
    if (!viewport.current) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setDimensions({ width, height })
    })
    observer.observe(viewport.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!pdf && !scrollMode && !currentPage) return
    onUpdate(book.id, {
      progress: { chapter: chapterIndex, offset },
      percentage: Math.min(100, Math.round(progress * 100)),
      lastRead: Date.now(),
    })
  }, [book.id, chapterIndex, offset, progress, pdf, scrollMode, currentPage, onUpdate])

  const navigate = useCallback(
    (target: Position) => {
      setPosition({
        chapter: Math.max(0, Math.min(content.chapters.length - 1, target.chapter)),
        offset: Math.max(0, target.offset),
      })
      setNavigation((value) => value + 1)
    },
    [content.chapters.length],
  )

  const jump = useCallback(
    (target: Position) => {
      navigate(target)
      setPanel(null)
      setMenu(false)
    },
    [navigate],
  )

  const turn = useCallback(
    (step: number) => {
      if (panel) return
      setDirection(step)
      if (scrollMode && viewport.current) {
        const el = viewport.current
        if (
          (step > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 3) ||
          (step < 0 && el.scrollTop > 3)
        ) {
          el.scrollBy({ top: step * el.clientHeight * 0.85, behavior: 'smooth' })
          return
        }
      }
      if (!pdf && !scrollMode && pages[pageIndex + step]) {
        setPosition({ chapter: chapterIndex, offset: pages[pageIndex + step].start })
        return
      }
      const next = chapterIndex + step
      if (next < 0) {
        notify('已经是第一页了')
        return
      }
      if (next >= content.chapters.length) {
        notify('全书读完了，回味一下吧')
        return
      }
      navigate({
        chapter: next,
        offset: step < 0 && !pdf ? content.chapters[next].text.length : 0,
      })
    },
    [panel, scrollMode, pdf, pages, pageIndex, chapterIndex, content, notify, navigate],
  )

  useEffect(() => {
    if (suspended) return
    const listener = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        panel ||
        (event.target instanceof HTMLElement &&
          event.target.closest('input,textarea,select,[contenteditable]'))
      )
        return
      if (
        event.key === ' ' &&
        event.target instanceof HTMLElement &&
        event.target.closest('button')
      )
        return
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) {
        event.preventDefault()
        turn(1)
      }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
        event.preventDefault()
        turn(-1)
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [turn, panel, suspended])

  function toggleBookmark() {
    onUpdate(book.id, {
      bookmarks: currentBookmark
        ? book.bookmarks.filter((mark) => mark.id !== currentBookmark.id)
        : [
            ...book.bookmarks,
            {
              id: crypto.randomUUID(),
              chapter: chapterIndex,
              offset,
              createdAt: Date.now(),
              label: pdf
                ? chapter.title
                : chapter.text.slice(offset, offset + 50).trim() || chapter.title,
            },
          ],
    })
    notify(currentBookmark ? '已移除书签' : '已添加书签')
  }

  return (
    <div
      className={`reader theme-${settings.theme}`}
      style={
        {
          '--reading-size': `${settings.fontSize}px`,
          '--reading-line': settings.lineHeight,
          '--reading-font':
            settings.font === 'serif'
              ? '"Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif'
              : '"Microsoft YaHei", sans-serif',
        } as CSSProperties
      }
    >
      <header className="reader-heading">
        <button className="icon-button" onClick={onBack} aria-label="返回书架">
          <ArrowLeft size={19} />
        </button>
        <span>{chapter.title}</span>
        <button
          className={`icon-button ${currentBookmark ? 'bookmarked' : ''}`}
          aria-label="阅读菜单"
          onClick={() => setMenu((value) => !value)}
        >
          {currentBookmark ? (
            <BookmarkIcon size={18} fill="currentColor" />
          ) : (
            <MoreHorizontal size={21} />
          )}
        </button>
      </header>
      <div
        className={`reading-viewport ${scrollMode ? 'scroll-mode' : ''} ${pdf ? 'pdf-viewport' : ''}`}
        ref={viewport}
        onWheel={(event) => {
          if (
            !pdf &&
            !scrollMode &&
            Math.abs(event.deltaY) > 20 &&
            Date.now() - wheel.current > 420
          ) {
            wheel.current = Date.now()
            turn(event.deltaY > 0 ? 1 : -1)
          }
        }}
        onPointerDown={(event) => {
          touch.current = { ...touch.current, x: event.clientX, y: event.clientY, at: Date.now() }
        }}
        onPointerUp={(event) => {
          if (pdf) return
          const dx = event.clientX - touch.current.x,
            dy = event.clientY - touch.current.y
          if (
            Math.abs(dx) > 45 &&
            Math.abs(dx) > Math.abs(dy) * 1.3 &&
            Date.now() - touch.current.at < 800
          ) {
            touch.current.movedAt = Date.now()
            turn(dx < 0 ? 1 : -1)
          }
        }}
        onClick={(event) => {
          if (
            pdf ||
            scrollMode ||
            Date.now() - touch.current.movedAt < 250 ||
            window.getSelection()?.toString()
          )
            return
          const rect = event.currentTarget.getBoundingClientRect()
          const ratio = (event.clientX - rect.left) / rect.width
          if (ratio < 0.27) turn(-1)
          else if (ratio > 0.73) turn(1)
          else setMenu((value) => !value)
        }}
      >
        {pdf ? (
          <Suspense fallback={<p className="reader-loading">正在打开 PDF…</p>}>
            <PdfPage buffer={content.pdf!} page={chapterIndex} report={notify} />
          </Suspense>
        ) : scrollMode ? (
          <ScrollText
            chapters={content.chapters}
            position={position}
            navigation={navigation}
            onPosition={trackPosition}
          />
        ) : (
          <div
            className={`reading-text page-text ${settings.turn === 'slide' ? 'animate-page' : ''}`}
            key={`${chapterIndex}-${pageIndex}-${settings.turn}`}
            style={{ '--turn-direction': direction } as CSSProperties}
            data-testid="page-text"
          >
            {currentPage?.text}
          </div>
        )}
      </div>
      <div
        className="reading-measure reading-text"
        ref={measure}
        style={{ width: dimensions.width }}
        aria-hidden="true"
      />
      <footer className="reader-footer">
        <button
          aria-label="上一页"
          onClick={() => turn(-1)}
          disabled={chapterIndex === 0 && (pdf || (!scrollMode && pageIndex === 0))}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {pdf
            ? `${chapterIndex + 1} / ${content.chapters.length} 页`
            : scrollMode
              ? `${chapterIndex + 1} / ${content.chapters.length} 章`
              : `${pageIndex + 1} / ${pages.length || 1} 页`}
          <i />
          {Math.round(progress * 100)}%
        </span>
        <button aria-label="下一页" onClick={() => turn(1)}>
          <ChevronRight size={16} />
        </button>
      </footer>
      {menu && (
        <div className="reader-menu-overlay">
          <button
            className="menu-dismiss"
            aria-label="收起阅读菜单"
            onClick={() => setMenu(false)}
          />
          <div className="reader-menu-top">
            <button className="icon-button" onClick={onBack} aria-label="退出阅读">
              <ArrowLeft size={20} />
            </button>
            <span>{book.title}</span>
            <button className="icon-button" onClick={() => setMenu(false)} aria-label="收起菜单">
              <X size={20} />
            </button>
          </div>
          <div className="reader-menu-bottom">
            <div className="chapter-navigation">
              <button
                aria-label="上一章"
                disabled={chapterIndex === 0}
                onClick={() => jump({ chapter: chapterIndex - 1, offset: 0 })}
              >
                <ChevronLeft size={19} />
              </button>
              <span>
                {pdf ? '页码' : '章节'}
                <b>
                  {chapterIndex + 1} / {content.chapters.length}
                </b>
              </span>
              <button
                aria-label="下一章"
                disabled={chapterIndex === content.chapters.length - 1}
                onClick={() => jump({ chapter: chapterIndex + 1, offset: 0 })}
              >
                <ChevronRight size={19} />
              </button>
            </div>
            <input
              aria-label="章节进度"
              className="chapter-slider"
              type="range"
              min={0}
              max={Math.max(0, content.chapters.length - 1)}
              value={chapterIndex}
              onChange={(event) => navigate({ chapter: Number(event.target.value), offset: 0 })}
            />
            <div className="reader-actions">
              <button
                onClick={() => {
                  setTocTab('chapters')
                  setPanel('toc')
                }}
              >
                <List size={22} />
                目录
              </button>
              <button className={currentBookmark ? 'active' : ''} onClick={toggleBookmark}>
                {currentBookmark ? <Check size={22} /> : <BookmarkIcon size={22} />}
                {currentBookmark ? '已加书签' : '书签'}
              </button>
              <button
                onClick={() =>
                  onSettings({ ...settings, theme: settings.theme === 'night' ? 'paper' : 'night' })
                }
              >
                <Moon size={22} />
                {settings.theme === 'night' ? '日间' : '夜间'}
              </button>
              <button onClick={() => setPanel('settings')}>
                <Settings2 size={22} />
                设置
              </button>
            </div>
          </div>
        </div>
      )}
      {panel === 'settings' && !suspended && (
        <Modal title="阅读设置" close={closePanel}>
          <Appearance settings={settings} onChange={onSettings} pdf={pdf} />
          <p className="sheet-footnote">翻页后自动记住位置，随时接着读。</p>
        </Modal>
      )}
      {panel === 'toc' && !suspended && (
        <Modal title={book.title} close={closePanel} className="toc-sheet">
          <div className="toc-tabs">
            <button
              className={tocTab === 'chapters' ? 'active' : ''}
              onClick={() => setTocTab('chapters')}
            >
              目录 <small>{content.chapters.length}</small>
            </button>
            <button
              className={tocTab === 'bookmarks' ? 'active' : ''}
              onClick={() => setTocTab('bookmarks')}
            >
              书签 <small>{book.bookmarks.length}</small>
            </button>
          </div>
          {tocTab === 'chapters' && (
            <input
              className="toc-search"
              aria-label="搜索章节"
              placeholder="查找章节"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
          <div className="toc-list">
            {tocTab === 'chapters' ? (
              content.chapters.map(
                (item, index) =>
                  item.title.includes(search) && (
                    <button
                      key={index}
                      className={chapterIndex === index ? 'active' : ''}
                      onClick={() => jump({ chapter: index, offset: 0 })}
                    >
                      <span>{item.title}</span>
                      {chapterIndex === index && <span className="reading-indicator" />}
                    </button>
                  ),
              )
            ) : book.bookmarks.length ? (
              book.bookmarks.map((mark) => (
                <button key={mark.id} onClick={() => jump(mark)}>
                  <BookmarkIcon size={16} />
                  <span>
                    {mark.label}
                    <small>{content.chapters[mark.chapter]?.title}</small>
                  </span>
                </button>
              ))
            ) : (
              <p className="list-empty">还没有书签，在阅读菜单中添加一枚吧。</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
