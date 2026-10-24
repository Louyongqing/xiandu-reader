import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  ChevronRight,
  Coffee,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  Heart,
  Leaf,
  List,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { Book, BookContent, Position, ReaderSettings } from './types'
import { demoBooks } from './lib/demo'
import { ACCEPTED_EXTENSIONS, importBook } from './lib/importer'
import {
  getContent,
  initializeLibrary,
  readSettings,
  removeBook,
  saveBook,
  saveImported,
} from './lib/storage'
import { Appearance } from './components/Appearance'
import { Reader } from './components/Reader'
import { Cover, EmptyState, Modal, TitleBar } from './components/ui'

type Tab = 'shelf' | 'bookmarks' | 'settings'
type Filter = 'all' | 'reading' | 'favorite'

export default function App() {
  const [books, setBooks] = useState<Book[]>([])
  const bookRef = useRef<Book[]>([])
  const [ready, setReady] = useState(false)
  const [failure, setFailure] = useState('')
  const [tab, setTab] = useState<Tab>('shelf')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'title' | 'added'>('recent')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [active, setActive] = useState<{
    bookId: string
    content: BookContent
    position?: Position
  } | null>(null)
  const [opening, setOpening] = useState('')
  const [settings, setSettings] = useState<ReaderSettings>(readSettings)
  const [modal, setModal] = useState<'import' | 'sort' | 'book' | 'delete' | null>(null)
  const [selected, setSelected] = useState<Book | null>(null)
  const [importing, setImporting] = useState('')
  const importLock = useRef(false)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const [pinned, setPinned] = useState(false)
  const [discreet, setDiscreet] = useState(false)
  const [note, setNote] = useState(() => {
    try {
      return localStorage.getItem('xiandu-note') || ''
    } catch {
      return ''
    }
  })
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const openSequence = useRef(0)
  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3600)
  }, [])
  const replaceBooks = useCallback((value: Book[]) => {
    bookRef.current = value
    setBooks(value)
  }, [])
  const closeModal = useCallback(() => {
    if (!importLock.current) setModal(null)
  }, [])

  useEffect(() => {
    void initializeLibrary(demoBooks())
      .then((value) => {
        replaceBooks(value)
        setReady(true)
      })
      .catch(() => setFailure('本地书架无法打开。请检查应用存储空间和读写权限，再重新启动。'))
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [replaceBooks])

  const updateBook = useCallback(
    (id: string, patch: Partial<Book>) => {
      const current = bookRef.current.find((book) => book.id === id)
      if (!current) return
      const updated = { ...current, ...patch }
      replaceBooks(bookRef.current.map((book) => (book.id === id ? updated : book)))
      void saveBook(updated).catch(() =>
        notify('保存失败：请检查本机存储空间，当前进度尚未写入磁盘'),
      )
    },
    [replaceBooks, notify],
  )

  const updateSettings = useCallback(
    (value: ReaderSettings) => {
      setSettings(value)
      try {
        localStorage.setItem('xiandu-settings', JSON.stringify(value))
      } catch {
        notify('设置暂时无法保存，请检查存储空间')
      }
    },
    [notify],
  )

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'F8' || (event.key === 'Escape' && !modal)) {
        event.preventDefault()
        setDiscreet((value) => !value)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [modal])

  useEffect(() => {
    document.title = discreet ? '工作便签' : '闲读 · 给自己一页空闲'
    if (isTauri())
      void getCurrentWindow()
        .setTitle(discreet ? '工作便签' : '闲读')
        .catch(() => notify('窗口标题切换失败'))
  }, [discreet, notify])

  async function openBook(book: Book, position?: Position) {
    const sequence = ++openSequence.current
    setOpening(book.id)
    try {
      const content = await getContent(book.id)
      if (!content) throw new Error('正文已丢失，请移除这本书后重新导入')
      if (sequence !== openSequence.current) return
      updateBook(book.id, { lastRead: Date.now() })
      setActive({ bookId: book.id, content, position })
    } catch (error) {
      notify(error instanceof Error ? error.message : '暂时无法打开这本书')
    } finally {
      if (sequence === openSequence.current) setOpening('')
    }
  }

  async function importFiles(files: File[]) {
    if (importLock.current || !files.length || !ready) return
    importLock.current = true
    setModal('import')
    setImportErrors([])
    const errors: string[] = []
    let added = 0,
      duplicate = 0
    try {
      for (const [index, file] of files.entries()) {
        setImporting(`${index + 1} / ${files.length} · ${file.name}`)
        await new Promise((resolve) => setTimeout(resolve, 20))
        try {
          const item = await importBook(file)
          if (await saveImported(item)) {
            replaceBooks([...bookRef.current, item.book])
            added++
          } else duplicate++
        } catch (error) {
          errors.push(
            `${file.name}：${error instanceof Error && /[\u4e00-\u9fff]/.test(error.message) ? error.message : '无法读取，请检查格式、文件完整性及存储空间。'}`,
          )
        }
      }
    } finally {
      importLock.current = false
      setImporting('')
      setImportErrors(errors)
      if (!errors.length) setModal(null)
      if (added) {
        setTab('shelf')
        setFilter('all')
        setQuery('')
        setSort('added')
      }
      notify(
        [
          added ? `已导入 ${added} 本书` : '',
          duplicate ? `${duplicate} 本已在书架` : '',
          errors.length ? `${errors.length} 本未能导入` : '',
        ]
          .filter(Boolean)
          .join('，'),
      )
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function deleteSelected() {
    if (!selected) return
    try {
      await removeBook(selected.id)
      replaceBooks(bookRef.current.filter((book) => book.id !== selected.id))
      setModal(null)
      setSelected(null)
      notify('已从书架移除，原文件不会删除')
    } catch {
      notify('移除失败，请稍后重试')
    }
  }

  const sorted = [...books]
    .filter((book) => {
      return (
        (filter !== 'reading' || (book.lastRead > 0 && book.percentage < 100)) &&
        (filter !== 'favorite' || book.favorite) &&
        `${book.title} ${book.author}`.toLowerCase().includes(query.toLowerCase())
      )
    })
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title, 'zh-CN')
        : sort === 'added'
          ? b.addedAt - a.addedAt
          : b.lastRead - a.lastRead || b.addedAt - a.addedAt,
    )
  const recent = [...books].sort((a, b) => b.lastRead - a.lastRead || b.addedAt - a.addedAt)[0]
  const activeBook = active && books.find((book) => book.id === active.bookId)
  const bookmarkCount = books.reduce((sum, book) => sum + book.bookmarks.length, 0)
  const startImport = () => {
    setImportErrors([])
    setModal('import')
  }

  return (
    <main
      className={`app-window ${isTauri() ? 'native-window' : ''} ${discreet ? 'discreet' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        if (event.dataTransfer.types.includes('Files')) {
          dragDepth.current++
          setDragging(true)
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault()
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current <= 0) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        if (!discreet) void importFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <TitleBar pinned={pinned} setPinned={setPinned} discreet={discreet} notify={notify} />
      <div className="app-body" inert={discreet} style={{ display: discreet ? 'none' : undefined }}>
        {failure ? (
          <div className="fatal-error" role="alert">
            <ShieldCheck size={30} />
            <p>{failure}</p>
            <button className="primary-button" onClick={() => window.location.reload()}>
              重新打开
            </button>
          </div>
        ) : !ready ? (
          <div className="loading-state">
            <LoaderCircle className="spin" size={26} />
            <span>正在打开书架</span>
          </div>
        ) : active && activeBook ? (
          <Reader
            key={active.bookId}
            book={activeBook}
            content={active.content}
            settings={settings}
            onSettings={updateSettings}
            onUpdate={updateBook}
            onBack={() => setActive(null)}
            notify={notify}
            initialPosition={active.position}
            suspended={discreet}
          />
        ) : (
          <>
            <div className="main-scroll">
              {tab === 'shelf' && (
                <>
                  <header className="shelf-header">
                    <div className="brand-lockup">
                      <span className="brand-symbol">
                        <BookOpen size={23} strokeWidth={1.6} />
                      </span>
                      <div>
                        <h1>
                          闲读<span>给自己一页空闲</span>
                        </h1>
                      </div>
                    </div>
                    <button
                      className="icon-button add-top"
                      aria-label="导入书籍"
                      onClick={startImport}
                    >
                      <Plus size={23} />
                    </button>
                  </header>
                  <div className="search-box">
                    <Search size={17} />
                    <input
                      aria-label="搜索书架"
                      placeholder="找一本想读的书"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    {query && (
                      <button aria-label="清空搜索" onClick={() => setQuery('')}>
                        <X size={16} />
                      </button>
                    )}
                    <kbd>书架</kbd>
                  </div>
                  {!query && recent && filter === 'all' && (
                    <button
                      className="continue-card"
                      onClick={() => void openBook(recent)}
                      disabled={!!opening}
                      aria-label={`${recent.lastRead ? '继续阅读' : '开始阅读'} ${recent.title}`}
                    >
                      <div className="continue-copy">
                        <span className="eyebrow">
                          <span />
                          {recent.lastRead ? '接着上次，慢慢读' : '此刻，适合读一页'}
                        </span>
                        <h2>{recent.title}</h2>
                        <p>
                          {recent.lastRead
                            ? `已读 ${recent.percentage}% · 第 ${recent.progress.chapter + 1} ${recent.format === 'PDF' ? '页' : '章'}`
                            : recent.demo
                              ? '一段小故事，试试阅读的感觉'
                              : `${recent.author} · ${recent.format}`}
                        </p>
                        <span className="continue-link">
                          {opening === recent.id
                            ? '正在打开'
                            : recent.lastRead
                              ? '继续阅读'
                              : '开始阅读'}
                          <ArrowRight size={14} />
                        </span>
                      </div>
                      <div className="continue-cover">
                        <Cover book={recent} small />
                      </div>
                    </button>
                  )}
                  <section className="library-section">
                    <div className="library-title">
                      <h2>
                        我的书架 <span>{books.length}</span>
                      </h2>
                      <div className="library-tools">
                        <button
                          className="icon-button"
                          title="排序"
                          aria-label="书架排序"
                          onClick={() => setModal('sort')}
                        >
                          <ArrowDownUp size={17} />
                        </button>
                        <button
                          className="icon-button"
                          title={layout === 'grid' ? '列表视图' : '网格视图'}
                          aria-label={layout === 'grid' ? '列表视图' : '网格视图'}
                          onClick={() => setLayout(layout === 'grid' ? 'list' : 'grid')}
                        >
                          {layout === 'grid' ? <List size={19} /> : <Grid2X2 size={17} />}
                        </button>
                      </div>
                    </div>
                    <div className="filter-tabs">
                      {(
                        [
                          ['all', '全部书籍'],
                          ['reading', '正在读'],
                          ['favorite', '收藏'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          className={filter === value ? 'selected' : ''}
                          onClick={() => setFilter(value)}
                          aria-pressed={filter === value}
                        >
                          {label}
                          {value === 'favorite' && <Heart size={11} />}
                        </button>
                      ))}
                    </div>
                    {sorted.length ? (
                      <div className={`books-${layout}`}>
                        {sorted.map((book) => (
                          <article className="book-item" key={book.id}>
                            <button
                              className="book-open"
                              onClick={() => void openBook(book)}
                              disabled={!!opening}
                              aria-label={`阅读 ${book.title}`}
                            >
                              <Cover book={book} />
                              <div className="book-meta">
                                <h3>{book.title}</h3>
                                <p>
                                  {layout === 'list' ? `${book.author} · ` : ''}
                                  {book.demo ? '内置试读' : book.format}
                                  {book.favorite && <Heart size={10} fill="currentColor" />}
                                </p>
                                <div className="book-progress">
                                  {book.lastRead ? (
                                    <>
                                      <span
                                        style={
                                          {
                                            '--progress': `${book.percentage}%`,
                                          } as React.CSSProperties
                                        }
                                      />
                                      <small>
                                        {book.percentage >= 100
                                          ? '已读完'
                                          : `已读 ${book.percentage}%`}
                                      </small>
                                    </>
                                  ) : (
                                    <small>未读</small>
                                  )}
                                </div>
                              </div>
                            </button>
                            <button
                              className="book-more"
                              aria-label={`管理 ${book.title}`}
                              title="管理书籍"
                              onClick={() => {
                                setSelected(book)
                                setModal('book')
                              }}
                            >
                              <MoreHorizontal size={18} />
                            </button>
                          </article>
                        ))}
                        {!query && filter === 'all' && (
                          <button className="import-tile" onClick={startImport}>
                            <span>
                              <Plus size={25} strokeWidth={1.2} />
                              <small>导入新书</small>
                            </span>
                            <p>把喜欢的故事带进来</p>
                          </button>
                        )}
                      </div>
                    ) : (
                      <EmptyState
                        title={
                          query
                            ? '没有找到这本书'
                            : filter === 'favorite'
                              ? '留住喜欢的故事'
                              : filter === 'reading'
                                ? '从第一章开始吧'
                                : '书架，等你来填满'
                        }
                        text={
                          query
                            ? '换个书名或作者试试'
                            : filter === 'favorite'
                              ? '在书籍菜单里点一下收藏'
                              : filter === 'reading'
                                ? '打开一本书，它就会出现在这里'
                                : '导入本地小说，留一点时间给自己'
                        }
                        action={
                          !query && filter === 'all' ? (
                            <button className="primary-button" onClick={startImport}>
                              <Plus size={16} />
                              导入书籍
                            </button>
                          ) : undefined
                        }
                      />
                    )}
                  </section>
                  <div className="shelf-note">
                    <Leaf size={13} />
                    <span>书在本地，心在故事里</span>
                  </div>
                </>
              )}
              {tab === 'bookmarks' && (
                <>
                  <header className="page-header">
                    <span className="eyebrow">留在故事里的坐标</span>
                    <h1>
                      我的书签 <small>{bookmarkCount}</small>
                    </h1>
                    <p>一页、一句，留给下次重逢。</p>
                  </header>
                  {bookmarkCount ? (
                    <div className="saved-bookmarks">
                      {books
                        .filter((book) => book.bookmarks.length)
                        .map((book) => (
                          <section key={book.id}>
                            <h2>
                              {book.title}
                              <span>{book.bookmarks.length}</span>
                            </h2>
                            {book.bookmarks.map((mark) => (
                              <div className="saved-bookmark" key={mark.id}>
                                <button onClick={() => void openBook(book, mark)}>
                                  <Bookmark size={17} />
                                  <span>
                                    {mark.label}
                                    <small>
                                      第 {mark.chapter + 1} {book.format === 'PDF' ? '页' : '章'}
                                    </small>
                                  </span>
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={`删除书签 ${mark.label}`}
                                  onClick={() =>
                                    updateBook(book.id, {
                                      bookmarks: book.bookmarks.filter(
                                        (item) => item.id !== mark.id,
                                      ),
                                    })
                                  }
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ))}
                          </section>
                        ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="还没有留下书签"
                      text="阅读时点击页面中间，打开菜单添加书签"
                    />
                  )}
                </>
              )}
              {tab === 'settings' && (
                <>
                  <header className="page-header">
                    <span className="eyebrow">找到舒服的阅读方式</span>
                    <h1>偏好设置</h1>
                    <p>让每一页，都合你的心意。</p>
                  </header>
                  <section className="settings-card">
                    <h2>阅读排版</h2>
                    <Appearance settings={settings} onChange={updateSettings} />
                  </section>
                  <section className="settings-card">
                    <h2>片刻闲暇</h2>
                    <button className="settings-action" onClick={() => setDiscreet(true)}>
                      <span>
                        <Coffee size={18} />
                        切换工作便签
                      </span>
                      <kbd>F8 / Esc</kbd>
                    </button>
                    <p className="settings-note">
                      窗口内按 F8 或 Esc 切换便签，再按一次回到原处。有弹窗时，Esc 先关闭弹窗。
                    </p>
                    <div className="shortcut-row">
                      <span>上一页 / 下一页</span>
                      <kbd>← / →</kbd>
                    </div>
                    <div className="shortcut-row">
                      <span>下一页</span>
                      <kbd>空格</kbd>
                    </div>
                    <div className="shortcut-row">
                      <span>呼出阅读菜单</span>
                      <span>点击页面中间</span>
                    </div>
                  </section>
                  <section className="settings-card about-card">
                    <span className="brand-symbol">
                      <BookOpen size={22} />
                    </span>
                    <h2>
                      闲读 <small>0.1.0</small>
                    </h2>
                    <p>
                      一个安静的本地小说阅读器。
                      <br />
                      无需登录，书籍与阅读记录只保存在这台设备。
                    </p>
                    <span className="local-label">
                      <ShieldCheck size={13} />
                      离线阅读 · 本地保存
                    </span>
                  </section>
                </>
              )}
            </div>
            <nav className="bottom-nav" aria-label="主导航">
              {(
                [
                  ['shelf', '书架', BookOpen],
                  ['bookmarks', '书签', Bookmark],
                  ['settings', '设置', Settings2],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  className={tab === value ? 'active' : ''}
                  onClick={() => setTab(value)}
                  aria-current={tab === value ? 'page' : undefined}
                >
                  <span>
                    <Icon size={21} strokeWidth={tab === value ? 1.9 : 1.6} />
                  </span>
                  {label}
                </button>
              ))}
            </nav>
          </>
        )}
        <input
          className="file-input"
          type="file"
          ref={fileInput}
          multiple
          accept={ACCEPTED_EXTENSIONS}
          aria-label="选择本地小说文件"
          onChange={(event) => void importFiles(Array.from(event.target.files || []))}
        />
        {modal === 'import' && (
          <Modal title="把故事带进书架" close={closeModal}>
            <div className="import-sheet">
              <span className="import-illustration">
                <FolderOpen size={40} strokeWidth={1.2} />
                <i>
                  <Plus size={16} />
                </i>
              </span>
              <h3>导入本地书籍</h3>
              <p>
                选择文件，或直接拖到窗口里。
                <br />
                可一次导入多本，阅读记录会自动保存。
              </p>
              <div className="format-chips">
                {['TXT', 'EPUB', 'MOBI', 'AZW3', 'PDF', 'FB2'].map((format) => (
                  <span key={format}>{format}</span>
                ))}
              </div>
              <button
                className="primary-button import-pick"
                disabled={!!importing}
                onClick={() => fileInput.current?.click()}
              >
                {importing ? <LoaderCircle className="spin" size={18} /> : <FilePlus2 size={18} />}
                {importing ? '正在导入…' : '选择本地文件'}
              </button>
              {importing && (
                <p className="import-progress" role="status">
                  {importing}
                </p>
              )}
              <small>单本最大 50 MB · 支持无 DRM 的电子书</small>
              {importErrors.length > 0 && (
                <div className="import-errors" role="alert">
                  {importErrors.map((error, index) => (
                    <p key={index}>{error}</p>
                  ))}
                </div>
              )}
            </div>
          </Modal>
        )}
        {modal === 'sort' && (
          <Modal title="书架排序" close={closeModal}>
            <div className="option-list">
              {(
                [
                  ['recent', '最近阅读'],
                  ['added', '最近导入'],
                  ['title', '书名顺序'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    setSort(value)
                    setModal(null)
                  }}
                >
                  {label}
                  {sort === value && <Check size={18} />}
                </button>
              ))}
            </div>
          </Modal>
        )}
        {modal === 'book' && selected && (
          <Modal title="管理书籍" close={closeModal}>
            <div className="manage-book">
              <Cover book={selected} small />
              <div>
                <h3>{selected.title}</h3>
                <p>{selected.author}</p>
                <small>
                  {selected.demo ? '内置试读' : selected.format} · {selected.chapterCount}{' '}
                  {selected.format === 'PDF' ? '页' : '章'}
                  {selected.size ? ` · ${(selected.size / 1024 / 1024).toFixed(1)} MB` : ''}
                </small>
              </div>
            </div>
            <div className="option-list">
              <button
                onClick={() => {
                  updateBook(selected.id, { favorite: !selected.favorite })
                  setModal(null)
                  notify(selected.favorite ? '已取消收藏' : '已收藏到书架')
                }}
              >
                <span>
                  <Heart size={18} />
                  {selected.favorite ? '取消收藏' : '收藏这本书'}
                </span>
                <ChevronRight size={16} />
              </button>
              <button className="danger" onClick={() => setModal('delete')}>
                <span>
                  <Trash2 size={18} />
                  从书架移除
                </span>
              </button>
            </div>
          </Modal>
        )}
        {modal === 'delete' && selected && (
          <Modal title="移除这本书？" close={closeModal}>
            <div className="delete-confirm">
              <p>将移除《{selected.title}》及其阅读记录和书签，电脑上的原文件会保留。</p>
              <div>
                <button className="secondary-button" onClick={closeModal}>
                  保留
                </button>
                <button className="danger-button" onClick={() => void deleteSelected()}>
                  移除
                </button>
              </div>
            </div>
          </Modal>
        )}
        {dragging && (
          <div className="drop-overlay">
            <FolderOpen size={46} strokeWidth={1.2} />
            <h2>松开，把故事留下</h2>
            <p>导入到本地书架</p>
          </div>
        )}
      </div>
      {discreet && (
        <section className="work-note">
          <header>
            <span className="note-badge">NOTES</span>
            <h1>工作便签</h1>
            <p>
              {new Intl.DateTimeFormat('zh-CN', {
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              }).format(new Date())}
            </p>
          </header>
          <textarea
            aria-label="工作便签内容"
            placeholder={'记录今天的工作安排…\n\n待办、想法、备忘，写在这里。'}
            value={note}
            onChange={(event) => {
              setNote(event.target.value)
              try {
                localStorage.setItem('xiandu-note', event.target.value)
              } catch {
                notify('便签保存失败，请检查存储空间')
              }
            }}
          />
          <footer>
            <span>本地便签</span>
            <button aria-label="返回阅读器" onClick={() => setDiscreet(false)}>
              <ArrowLeft size={13} />
              返回 <kbd>F8</kbd>
            </button>
          </footer>
        </section>
      )}
      {toast && !discreet && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  )
}
