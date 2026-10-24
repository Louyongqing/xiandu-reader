import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { Chapter, ReaderSettings } from '../types'
import { paginate, type Page } from './text'

export function useChapterPages(
  chapters: Chapter[],
  chapterIndex: number,
  dimensions: { width: number; height: number },
  settings: ReaderSettings,
  measure: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  const key = `${dimensions.width}:${dimensions.height}:${settings.fontSize}:${settings.lineHeight}:${settings.font}`
  const cache = useRef<{ key: string; chapters: Chapter[]; pages: Map<number, Page[]> } | null>(
    null,
  )
  const [current, setCurrent] = useState<{ key: string; chapter: number; pages: Page[] } | null>(
    null,
  )

  useLayoutEffect(() => {
    if (!enabled || !measure.current || dimensions.height < 1 || dimensions.width < 1) return
    if (cache.current?.key !== key || cache.current.chapters !== chapters) {
      cache.current = { key, chapters, pages: new Map() }
    }
    const entries = cache.current.pages
    for (const index of entries.keys()) {
      if (Math.abs(index - chapterIndex) > 1) entries.delete(index)
    }
    if (!entries.has(chapterIndex)) {
      const element = measure.current
      entries.set(
        chapterIndex,
        paginate(chapters[chapterIndex].text, (text) => {
          element.textContent = text
          return element.scrollHeight <= dimensions.height - 2
        }),
      )
      element.textContent = ''
    }
    setCurrent({ key, chapter: chapterIndex, pages: entries.get(chapterIndex)! })
  }, [chapters, chapterIndex, key, enabled, dimensions.height, dimensions.width, measure])

  useEffect(() => {
    const entry = cache.current
    if (!enabled || !entry || entry.key !== key || entry.chapters !== chapters) return
    let cancelled = false
    // Prepare the next chapter during idle time. Keep only neighbouring chapters,
    // and cancel stale work after navigation, resizing or typography changes.
    const preload = () => {
      if (cancelled || cache.current !== entry || !measure.current) return
      const next = chapterIndex + 1
      if (!chapters[next] || entry.pages.has(next)) return
      const element = measure.current
      entry.pages.set(
        next,
        paginate(chapters[next].text, (text) => {
          element.textContent = text
          return element.scrollHeight <= dimensions.height - 2
        }),
      )
      element.textContent = ''
    }
    const idle = typeof window.requestIdleCallback === 'function'
    const handle = idle
      ? window.requestIdleCallback(preload, { timeout: 600 })
      : window.setTimeout(preload, 100)
    return () => {
      cancelled = true
      if (idle) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [chapters, chapterIndex, key, enabled, dimensions.height, measure])

  if (!enabled) return []
  const cached = cache.current
  if (cached?.key === key && cached.chapters === chapters) {
    const ready = cached.pages.get(chapterIndex)
    if (ready) return ready
  }
  return current?.key === key && current.chapter === chapterIndex ? current.pages : []
}
