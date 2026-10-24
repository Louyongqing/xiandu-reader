"""End-to-end acceptance checks; start the app on port 1420 before running."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright, expect
from make_fixtures import TARGET

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / 'test-results'
checks = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=p.chromium.executable_path)
    context = browser.new_context(viewport={'width': 420, 'height': 780}, device_scale_factor=1)
    page = context.new_page()
    errors, network_errors, external = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('requestfailed', lambda request: network_errors.append(request.url))
    page.on('request', lambda request: external.append(request.url) if request.url.startswith('http') and not request.url.startswith('http://127.0.0.1:1420') else None)
    page.goto('http://127.0.0.1:1420')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button', name='阅读 山野来信', exact=True)).to_be_visible()
    page.screenshot(path=str(RESULTS / 'shelf-mobile.png'))

    def open_book(title):
        page.get_by_role('button', name=f'阅读 {title}', exact=True).click()
        expect(page.locator('.reader')).to_be_visible()
        page.wait_for_selector('.reading-text:not(.reading-measure), .pdf-reader')
        if page.locator('[data-testid=page-text]').count():
            page.wait_for_function("document.querySelector('[data-testid=page-text]')?.textContent.length > 0")
        page.wait_for_timeout(250)

    def menu():
        if not page.locator('.reader-menu-overlay').count():
            page.get_by_role('button', name='阅读菜单', exact=True).click()

    def settings():
        menu()
        page.locator('.reader-actions').get_by_role('button', name='设置', exact=True).click()

    def back():
        if page.locator('.reader-menu-overlay').count():
            page.get_by_role('button', name='收起菜单', exact=True).click()
        page.get_by_role('button', name='返回书架', exact=True).click()

    open_book('山野来信')
    first = page.locator('[data-testid=page-text]').inner_text()
    page.get_by_role('button', name='下一页', exact=True).click()
    expect(page.locator('[data-testid=page-text]')).not_to_have_text(first)
    second = page.locator('[data-testid=page-text]').inner_text()
    page.keyboard.press('ArrowLeft')
    expect(page.locator('[data-testid=page-text]')).to_have_text(first)
    page.keyboard.press('ArrowRight')
    expect(page.locator('[data-testid=page-text]')).to_have_text(second)
    page.locator('[data-testid=page-text]').click(position={'x': 180, 'y': 100})
    expect(page.locator('.reader-menu-overlay')).to_be_visible()
    page.locator('.reader-actions').get_by_role('button', name='书签', exact=True).click()
    expect(page.locator('.reader-actions').get_by_role('button', name='已加书签', exact=True)).to_be_visible()
    page.locator('.reader-actions').get_by_role('button', name='夜间', exact=True).click()
    expect(page.locator('.reader')).to_have_class('reader theme-night')
    page.get_by_role('button', name='收起菜单', exact=True).click()
    page.wait_for_timeout(250)
    page.screenshot(path=str(RESULTS / 'reader-night.png'))
    page.keyboard.press('F8')
    expect(page.get_by_role('textbox', name='工作便签内容')).to_be_visible()
    page.keyboard.press('ArrowRight')
    page.get_by_role('textbox', name='工作便签内容').fill('测试便签：安排下午的工作')
    page.screenshot(path=str(RESULTS / 'work-note.png'))
    page.keyboard.press('F8')
    expect(page.locator('[data-testid=page-text]')).to_have_text(second)
    back()
    page.reload(); page.wait_for_load_state('networkidle')
    open_book('山野来信')
    expect(page.locator('[data-testid=page-text]')).to_have_text(second)
    expect(page.locator('.reader')).to_have_class('reader theme-night')
    checks.append('click/keyboard paging, bookmark, night mode, discreet mode, persisted progress/settings')

    settings()
    page.get_by_role('button', name='增大字号', exact=True).click()
    page.get_by_role('button', name='护眼背景', exact=True).click()
    page.keyboard.press('Escape')
    expect(page.locator('.work-note')).to_have_count(0)
    page.get_by_role('button', name='收起菜单', exact=True).click()
    page.wait_for_timeout(200)
    assert page.locator('.page-text').evaluate('(el) => el.scrollHeight <= el.clientHeight + 1')
    page.screenshot(path=str(RESULTS / 'reader-sage.png'))
    menu()
    page.locator('.reader-actions').get_by_role('button', name='目录', exact=True).click()
    page.get_by_role('button', name='第三章 风有回信', exact=True).click()
    expect(page.locator('.reader-heading')).to_contain_text('第三章 风有回信')
    page.get_by_role('button', name='上一页', exact=True).click()
    expect(page.locator('.reader-heading')).to_contain_text('第二章 一封没有日期的信')
    checks.append('font reflow, Escape closes modal, table of contents, backward chapter boundary')
    back()

    files = ['测试长篇.txt', '中文编码.txt', '测试书籍.epub', '测试书籍.fb2', '测试书籍.mobi', '测试文档.pdf']
    page.get_by_label('选择本地小说文件', exact=True).set_input_files([str(TARGET / name) for name in files])
    expect(page.locator('.book-item')).to_have_count(9, timeout=60000)
    expect(page.get_by_role('dialog', name='把故事带进书架')).not_to_be_visible(timeout=60000)
    for title in ['测试长篇', '中文编码', 'EPUB 导入验证', 'FB2 导入验证', 'MOBI Import Check', '测试文档']:
        page.get_by_role('textbox', name='搜索书架', exact=True).fill(title)
        expect(page.get_by_role('button', name=f'阅读 {title}', exact=True)).to_be_visible()
    page.get_by_role('textbox', name='搜索书架', exact=True).fill('')
    assert page.evaluate('window.IMPORTED_SCRIPT_RAN') is None
    assert not external, external
    checks.append('batch TXT UTF-8/GB18030, EPUB, FB2, MOBI and PDF import; imported scripts/images never execute/request')

    open_book('测试长篇')
    page.get_by_role('button', name='下一页', exact=True).click()
    page.get_by_role('button', name='下一页', exact=True).click()
    page.wait_for_timeout(200)
    assert page.locator('.page-text').evaluate('(el) => el.scrollHeight <= el.clientHeight + 1')
    page.set_viewport_size({'width': 340, 'height': 560})
    page.wait_for_timeout(300)
    assert page.locator('.page-text').evaluate('(el) => el.scrollHeight <= el.clientHeight + 1')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(RESULTS / 'reader-small.png'))
    page.set_viewport_size({'width': 420, 'height': 780})
    settings(); page.get_by_role('button', name='滚动', exact=True).click()
    page.get_by_role('button', name='关闭面板', exact=True).click()
    page.get_by_role('button', name='收起菜单', exact=True).click()
    page.locator('.reading-viewport').evaluate('(el) => el.scrollTop = 1200')
    page.wait_for_timeout(300)
    assert page.locator('.reading-viewport').evaluate('(el) => el.scrollTop') > 1000
    back(); open_book('测试长篇')
    assert page.locator('.reading-viewport').evaluate('(el) => el.scrollTop') > 500
    settings(); page.get_by_role('button', name='滑动', exact=True).click()
    page.get_by_role('button', name='关闭面板', exact=True).click()
    page.get_by_role('button', name='收起菜单', exact=True).click()
    checks.append('340x560 reflow without overflow; scrolling and restored scroll position')
    back()

    open_book('测试文档')
    expect(page.locator('canvas')).to_be_visible(timeout=30000)
    page.wait_for_function("document.querySelector('canvas').style.visibility === 'visible'")
    first_pdf = page.locator('canvas').evaluate('(el) => el.toDataURL()')
    page.get_by_role('button', name='下一页', exact=True).click()
    page.wait_for_function("document.querySelector('canvas').style.visibility === 'visible'")
    expect(page.locator('.reader-footer')).to_contain_text('2 / 2 页')
    assert page.locator('canvas').evaluate('(el) => el.toDataURL()') != first_pdf
    page.get_by_role('button', name='放大 PDF', exact=True).click()
    expect(page.locator('.pdf-zoom')).to_contain_text('125%')
    page.wait_for_timeout(200)
    page.screenshot(path=str(RESULTS / 'pdf.png'))
    checks.append('PDF canvas rendering, paging and zoom')
    back()

    page.get_by_label('选择本地小说文件', exact=True).set_input_files(str(TARGET / '测试长篇.txt'))
    expect(page.get_by_role('dialog', name='把故事带进书架')).not_to_be_visible(timeout=15000)
    expect(page.get_by_role('status')).to_contain_text('已在书架')
    page.get_by_label('选择本地小说文件', exact=True).set_input_files([str(TARGET / name) for name in ['empty.txt', 'bad.epub', 'unsupported.doc', 'encrypted.mobi']])
    expect(page.locator('.import-errors p')).to_have_count(4, timeout=15000)
    expect(page.locator('.import-errors')).to_contain_text('DRM')
    page.get_by_role('button', name='关闭面板', exact=True).click()
    page.get_by_role('button', name='管理 测试长篇', exact=True).click()
    page.get_by_role('button', name='收藏这本书', exact=True).click()
    page.get_by_role('button', name='收藏', exact=True).click()
    expect(page.locator('.book-item')).to_have_count(1)
    page.get_by_role('button', name='全部书籍', exact=True).click()
    page.get_by_role('button', name='列表视图', exact=True).click()
    expect(page.locator('.books-list')).to_be_visible()
    page.get_by_role('button', name='管理 中文编码', exact=True).click()
    page.get_by_role('button', name='从书架移除', exact=True).click()
    page.get_by_role('button', name='移除', exact=True).click()
    expect(page.get_by_role('button', name='阅读 中文编码', exact=True)).to_have_count(0)
    page.reload(); page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button', name='阅读 中文编码', exact=True)).to_have_count(0)
    checks.append('duplicate handling; corrupt/unsupported/empty/DRM errors; favorite, list and persistent delete')
    assert not errors, errors
    assert not network_errors, network_errors
    assert not external, external
    report = {'passed': checks, 'page_errors': errors, 'network_errors': network_errors, 'external_requests': external}
    (RESULTS / 'browser-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=True, indent=2))
    context.close(); browser.close()
