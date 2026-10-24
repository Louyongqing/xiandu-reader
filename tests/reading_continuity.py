"""Chapter preloading and continuous reading regressions against the running app."""
from pathlib import Path
import argparse
import json
from playwright.sync_api import sync_playwright, expect
from make_fixtures import TARGET

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--cdp', help='Test a running native app instead of launching Chromium')
args = parser.parse_args()
checks = []

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(args.cdp) if args.cdp else p.chromium.launch(headless=True, executable_path=p.chromium.executable_path)
    page = browser.contexts[0].pages[0] if args.cdp else browser.new_page(viewport={'width': 420, 'height': 780})
    errors, console_errors = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
    if args.cdp:
        page.reload()
    else:
        page.goto('http://127.0.0.1:1420')
    viewport = page.locator('.reading-viewport')

    def import_book(file, title):
        page.get_by_label('选择本地小说文件', exact=True).set_input_files(str(file))
        expect(page.get_by_role('button', name=f'阅读 {title}', exact=True)).to_be_visible()
        expect(page.get_by_role('dialog', name='把故事带进书架')).not_to_be_visible()
        page.get_by_role('button', name=f'阅读 {title}', exact=True).click()

    def menu():
        if not page.locator('.reader-menu-overlay').count():
            page.get_by_role('button', name='阅读菜单', exact=True).click()

    def settings():
        menu()
        page.locator('.reader-actions').get_by_role('button', name='设置', exact=True).click()

    def close_settings():
        page.get_by_role('button', name='关闭面板', exact=True).click()
        page.get_by_role('button', name='收起菜单', exact=True).click()

    def mode(name):
        settings()
        page.get_by_role('button', name=name, exact=True).click()
        close_settings()

    def jump(chapter):
        menu()
        page.locator('.reader-actions').get_by_role('button', name='目录', exact=True).click()
        page.locator('.toc-list').get_by_role('button', name=f'第{chapter}章 测试章节{chapter}', exact=True).click()
        expect(page.locator('.reader-heading')).to_contain_text(f'第{chapter}章 测试章节{chapter}')

    def paragraph(chapter):
        return viewport.locator(f'[data-chapter="{chapter}"] span').filter(has_text='015 山路')

    def scroll_to_paragraph(chapter):
        target = paragraph(chapter)
        target.evaluate('el => { const v = el.closest(".reading-viewport"); v.scrollTop += el.getBoundingClientRect().top - v.getBoundingClientRect().top + 7 }')
        expect(page.locator('.reader-heading')).to_contain_text(f'第{chapter + 1}章 测试章节{chapter + 1}')
        page.wait_for_timeout(120)
        assert abs(target.evaluate('el => el.getBoundingClientRect().top - el.closest(".reading-viewport").getBoundingClientRect().top') + 7) < 1

    import_book(TARGET / '测试长篇.txt', '测试长篇')
    mode('滚动')
    # The next chapter must already be present before reaching the current chapter's end.
    expect(viewport.locator('[data-chapter="1"]')).to_have_count(1)
    # Straddle a boundary, then continue with the mouse wheel without using a chapter button.
    viewport.locator('[data-chapter="1"]').evaluate('el => { const v = el.closest(".reading-viewport"); v.scrollTop += el.getBoundingClientRect().top - v.getBoundingClientRect().top - 180 }')
    viewport.hover()
    page.mouse.wheel(0, 400)
    expect(page.locator('.reader-heading')).to_contain_text('第2章 测试章节2')
    expect(viewport.locator('[data-chapter="2"]')).to_have_count(1)
    for chapter in [1, 2, 1, 2, 1]:
        scroll_to_paragraph(chapter)
        indices = viewport.locator('[data-chapter]').evaluate_all('els => els.map(el => el.dataset.chapter)')
        assert len(indices) == len(set(indices))
    checks.append('next chapter pre-rendered; wheel crosses chapters; forward/backward window changes preserve text and pixel position')

    menu()
    page.locator('.reader-actions').get_by_role('button', name='书签', exact=True).click()
    page.get_by_role('button', name='收起菜单', exact=True).click()
    jump(1)
    menu()
    page.locator('.reader-actions').get_by_role('button', name='目录', exact=True).click()
    page.locator('.toc-tabs').get_by_role('button', name='书签').click()
    page.locator('.toc-list button').first.click()
    expect(page.locator('.reader-heading')).to_contain_text('第2章 测试章节2')
    expect(paragraph(1)).to_be_in_viewport()
    page.get_by_role('button', name='返回书架', exact=True).click()
    page.reload()
    page.get_by_role('button', name='阅读 测试长篇', exact=True).click()
    expect(page.locator('.reader-heading')).to_contain_text('第2章 测试章节2')
    expect(paragraph(1)).to_be_in_viewport()
    menu()
    page.get_by_role('slider', name='章节进度', exact=True).fill('2')
    expect(page.locator('.reader-heading')).to_contain_text('第3章 测试章节3')
    expect(page.locator('.reader-menu-overlay')).to_be_visible()
    page.get_by_role('button', name='收起菜单', exact=True).click()
    jump(2)
    before_key_scroll = viewport.evaluate('el => el.scrollTop')
    page.keyboard.press('PageDown')
    page.wait_for_timeout(600)
    assert viewport.evaluate('el => el.scrollTop') - before_key_scroll > viewport.evaluate('el => el.clientHeight * 0.75')
    scroll_to_paragraph(1)
    page.keyboard.press('F8')
    expect(page.get_by_role('textbox', name='工作便签内容')).to_be_visible()
    page.keyboard.press('PageDown')
    page.keyboard.press('F8')
    expect(page.locator('.reader-heading')).to_contain_text('第2章 测试章节2')
    assert abs(paragraph(1).evaluate('el => el.getBoundingClientRect().top - el.closest(".reading-viewport").getBoundingClientRect().top') + 7) < 1
    reflow_trace = []
    def trace_reflow(stage):
        reflow_trace.append({'stage': stage, **viewport.evaluate('''v => {
          const top = v.getBoundingClientRect().top;
          const first = [...v.querySelectorAll('[data-offset]')].find(el => el.getBoundingClientRect().bottom > top + 1);
          return {scrollTop: v.scrollTop, first: first?.textContent.slice(0, 20), chapter: first?.closest('[data-chapter]').dataset.chapter, offset: first?.dataset.offset};
        }''')})
    trace_reflow('before settings')
    menu()
    trace_reflow('menu open')
    page.locator('.reader-actions').get_by_role('button', name='设置', exact=True).click()
    trace_reflow('settings open')
    for _ in range(3):
        page.get_by_role('button', name='增大字号', exact=True).click()
        trace_reflow('font size')
    page.get_by_role('button', name='宽松', exact=True).click()
    trace_reflow('line height')
    page.get_by_role('button', name='黑体', exact=True).click()
    trace_reflow('font')
    close_settings()
    reflow_top = paragraph(1).evaluate('el => el.getBoundingClientRect().top - el.closest(".reading-viewport").getBoundingClientRect().top')
    assert abs(reflow_top + 7) < 1, {'paragraph_top_after_font_change': reflow_top, 'trace': reflow_trace}
    page.screenshot(path=str(ROOT / 'test-results' / ('continuous-native.png' if args.cdp else 'continuous-browser.png')))
    if not args.cdp:
        page.set_viewport_size({'width': 340, 'height': 560})
        page.wait_for_timeout(150)
        assert abs(paragraph(1).evaluate('el => el.getBoundingClientRect().top - el.closest(".reading-viewport").getBoundingClientRect().top') + 7) < 1
    checks.append('cross-chapter bookmark, directory, slider, reload persistence and typography reflow retain the reading position')

    mode('滑动')
    # Reflow invalidates preloaded pages. Read the whole next chapter and compare every character.
    jump(1)
    page.wait_for_timeout(700)
    jump(2)
    source = page.evaluate('''async () => {
      const db = await new Promise(resolve => { const r = indexedDB.open('xiandu-library'); r.onsuccess = () => resolve(r.result) });
      const books = await new Promise(resolve => { const r = db.transaction('books').objectStore('books').getAll(); r.onsuccess = () => resolve(r.result) });
      const id = books.find(book => book.title === '测试长篇').id;
      const content = await new Promise(resolve => { const r = db.transaction('content').objectStore('content').get(id); r.onsuccess = () => resolve(r.result) });
      db.close(); return content.chapters[1].text;
    }''')
    texts = []
    for _ in range(80):
        if '第2章' not in page.locator('.reader-heading').inner_text():
            break
        page_text = page.locator('[data-testid=page-text]')
        expect(page_text).not_to_be_empty()
        texts.append(page_text.text_content())
        assert page_text.evaluate('el => el.scrollHeight <= el.clientHeight + 1')
        page.get_by_role('button', name='下一页', exact=True).click()
    assert ''.join(texts) == source, 'Paging must neither duplicate nor drop text across a preloaded chapter'
    expect(page.locator('.reader-heading')).to_contain_text('第3章 测试章节3')
    page.get_by_role('button', name='上一页', exact=True).click()
    expect(page.locator('[data-testid=page-text]')).to_have_text(texts[-1])
    checks.append('preloaded pagination after font/line-height/width changes preserves every character and backward chapter boundaries')

    mode('滚动')
    jump(3)
    viewport.evaluate('el => el.scrollTop = el.scrollHeight')
    expect(page.locator('.reader-footer')).to_contain_text('100%')
    page.keyboard.press('PageDown')
    expect(page.locator('.reader-heading')).to_contain_text('第3章 测试章节3')
    expect(page.get_by_role('status')).to_contain_text('全书读完了')
    page.get_by_role('button', name='返回书架', exact=True).click()

    short = TARGET / '连续短章节.txt'
    short.write_text('\n\n'.join(f'第{i + 1}章 短章\n\n这是第{i + 1}章的独立正文。' for i in range(40)), encoding='utf-8')
    if not args.cdp:
        page.set_viewport_size({'width': 420, 'height': 780})
    import_book(short, '连续短章节')
    seen = set()
    max_mounted = 0
    for _ in range(100):
        page.wait_for_timeout(70)
        visible = viewport.locator('[data-chapter]').evaluate_all('''els => els.filter(el => {
          const v = el.closest('.reading-viewport').getBoundingClientRect(), r = el.getBoundingClientRect();
          return r.bottom > v.top && r.top < v.bottom;
        }).map(el => Number(el.dataset.chapter))''')
        seen.update(visible)
        max_mounted = max(max_mounted, viewport.locator('[data-chapter]').count())
        if '100%' in page.locator('.reader-footer').inner_text():
            break
        viewport.hover()
        page.mouse.wheel(0, 350)
    expect(page.locator('.reader-footer')).to_contain_text('100%')
    assert seen == set(range(40)), seen
    assert max_mounted <= 12, max_mounted
    checks.append('40 short chapters flow continuously with bounded mounted content; end of book stops cleanly at 100%')
    assert not errors, errors
    assert not console_errors, console_errors
    report = {'runtime': 'Tauri / WebView2' if args.cdp else 'Chromium', 'passed': checks, 'max_mounted_short_chapters': max_mounted, 'page_errors': errors, 'console_errors': console_errors}
    (ROOT / 'test-results' / ('continuity-native-report.json' if args.cdp else 'continuity-browser-report.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=True, indent=2))
    browser.close()
