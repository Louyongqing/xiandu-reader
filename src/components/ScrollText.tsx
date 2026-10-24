import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Chapter, Position } from '../types'

type Anchor = { element: HTMLElement; top: number }

export function ScrollText({
  chapters,
  position,
  navigation,
  onPosition,
}: {
  chapters: Chapter[]
  position: Position
  navigation: number
  onPosition: (position: Position) => void
}) {
  const last = chapters.length - 1
  const root = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState(() => ({
    start: Math.max(0, position.chapter - 1),
    end: Math.min(last, position.chapter + 1),
  }))
  const anchor = useRef<Anchor | null>(null)
  const pending = useRef<Position | null>(position)
  const lastNavigation = useRef(navigation)
  const rendered = useMemo(
    () =>
      chapters.slice(range.start, range.end + 1).map((chapter, index) => {
        let offset = 0
        return {
          chapter,
          index: range.start + index,
          paragraphs: chapter.text.split(/(?<=\n)/).map((text) => {
            const part = { text, offset }
            offset += text.length
            return part
          }),
        }
      }),
    [chapters, range],
  )

  const track = useCallback(() => {
    const el = root.current?.parentElement
    if (!el || pending.current) return
    const { top } = el.getBoundingClientRect()
    const first = Array.from(el.querySelectorAll<HTMLElement>('[data-offset]')).find(
      (part) => part.getBoundingClientRect().bottom > top + 1,
    )
    if (!first) return
    const chapter = Number(first.closest<HTMLElement>('[data-chapter]')?.dataset.chapter)
    const nextPosition = { chapter, offset: Number(first.dataset.offset) }
    anchor.current = {
      element: first,
      top: first.getBoundingClientRect().top - top,
    }
    const sections = Array.from(el.querySelectorAll<HTMLElement>('[data-chapter]'))
    const visibleEnd = sections.findLast(
      (section) => section.getBoundingClientRect().top < top + el.clientHeight,
    )
    // Keep the visible chapters and a neighbour on each side. Short chapters fill the screen too.
    const nextRange = {
      start: Math.max(0, chapter - 1),
      end: Math.min(
        last,
        Math.max(chapter + 1, Number(visibleEnd?.dataset.chapter ?? chapter) + 1),
      ),
    }
    setRange((current) =>
      current.start === nextRange.start && current.end === nextRange.end ? current : nextRange,
    )
    const atBookEnd = range.end === last && el.scrollTop + el.clientHeight >= el.scrollHeight - 3
    onPosition(
      atBookEnd
        ? { chapter: last, offset: Math.max(0, chapters[last].text.length - 1) }
        : nextPosition,
    )
  }, [chapters, last, onPosition, range.end])

  // Restore only explicit navigation or a layout/window change, never snap to the chapter
  // heading when scrolling updates the current chapter. The same DOM anchor survives trimming.
  useLayoutEffect(() => {
    const el = root.current?.parentElement
    if (!el) return
    if (lastNavigation.current !== navigation) {
      lastNavigation.current = navigation
      pending.current = position
      anchor.current = null
      setRange({
        start: Math.max(0, position.chapter - 1),
        end: Math.min(last, position.chapter + 1),
      })
      return
    }
    if (pending.current) {
      const target = pending.current
      const section = el.querySelector<HTMLElement>(`[data-chapter="${target.chapter}"]`)
      if (!section) return
      const parts = Array.from(section.querySelectorAll<HTMLElement>('[data-offset]'))
      const part =
        target.offset === 0
          ? section
          : parts.findLast((item) => Number(item.dataset.offset) <= target.offset) || section
      const wanted =
        el.scrollTop + part.getBoundingClientRect().top - el.getBoundingClientRect().top
      el.scrollTop = wanted
      if (wanted > el.scrollTop + 1 && range.end < last) {
        setRange({ ...range, end: Math.min(last, range.end + 4) })
        return
      }
      pending.current = null
    } else if (anchor.current?.element.isConnected) {
      const adjustment =
        anchor.current.element.getBoundingClientRect().top -
        el.getBoundingClientRect().top -
        anchor.current.top
      // Assigning scrollTop, even to the same value, cancels keyboard/button smooth scrolling.
      if (Math.abs(adjustment) > 1) el.scrollTop += adjustment
    }
    track()
  })

  useLayoutEffect(() => {
    const el = root.current?.parentElement
    if (!el) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(track)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [track])

  return (
    <div className="scroll-text" ref={root}>
      {rendered.map(({ chapter, index, paragraphs }) => (
        <section className="scroll-chapter" data-chapter={index} key={index}>
          <h2 className="scroll-chapter-title" data-offset={0}>
            {chapter.title}
          </h2>
          <div className="reading-text">
            {paragraphs.map((part) => (
              <span key={part.offset} data-offset={part.offset}>
                {part.text}
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
