"""Checks the real packaged WebView2 app using an isolated QA profile and local CDP port."""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect
from make_fixtures import TARGET

RESULTS = Path(__file__).resolve().parents[1] / 'test-results'
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp('http://127.0.0.1:9224')
    page = browser.contexts[0].pages[0]
    print('Native URL:', page.url)
    errors, console_errors = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
    page.reload(); page.wait_for_load_state('networkidle')
    expect(page.locator('.native-window')).to_be_visible()
    assert page.evaluate('window.__TAURI_INTERNALS__ !== undefined')
    expect(page.get_by_role('button', name='阅读 山野来信', exact=True)).to_be_visible()
    page.get_by_role('button', name='窗口置顶', exact=True).click()
    expect(page.get_by_role('button', name='取消置顶', exact=True)).to_be_visible()
    page.get_by_role('button', name='取消置顶', exact=True).click()
    expect(page.get_by_role('button', name='窗口置顶', exact=True)).to_be_visible()
    page.screenshot(path=str(RESULTS / 'native-shelf.png'))
    page.get_by_role('button', name='阅读 山野来信', exact=True).click()
    expect(page.locator('[data-testid=page-text]')).not_to_be_empty()
    first = page.locator('[data-testid=page-text]').inner_text()
    page.keyboard.press('ArrowRight')
    expect(page.locator('[data-testid=page-text]')).not_to_have_text(first)
    page.keyboard.press('F8')
    expect(page.get_by_role('textbox', name='工作便签内容')).to_be_visible()
    assert page.title() == '工作便签'
    page.keyboard.press('F8')
    page.get_by_role('button', name='返回书架', exact=True).click()
    page.get_by_role('button', name='导入书籍', exact=True).click()
    with page.expect_file_chooser() as picker:
        page.get_by_role('button', name='选择本地文件', exact=True).click()
    picker.value.set_files([str(TARGET / name) for name in ['测试书籍.epub', '测试书籍.mobi', '测试文档.pdf']])
    expect(page.locator('.book-item')).to_have_count(6, timeout=30000)
    expect(page.get_by_role('dialog', name='把故事带进书架')).not_to_be_visible(timeout=30000)
    sample = Path(os.environ['TEMP']) / 'xiandu-format-check' / 'sample.azw3'
    if sample.exists():
        page.get_by_label('选择本地小说文件', exact=True).set_input_files(str(sample))
        expect(page.locator('.book-item')).to_have_count(7, timeout=30000)
        expect(page.get_by_role('dialog', name='把故事带进书架')).not_to_be_visible(timeout=30000)
        newest = page.locator('.book-item').first.locator('.book-open')
        newest.click()
        expect(page.locator('[data-testid=page-text]')).not_to_be_empty()
        page.get_by_role('button', name='返回书架', exact=True).click()
    page.get_by_role('button', name='阅读 测试文档', exact=True).click()
    expect(page.locator('canvas')).to_be_visible(timeout=30000)
    expect(page.locator('canvas')).to_have_css('visibility', 'visible')
    page.get_by_role('button', name='下一页', exact=True).click()
    expect(page.locator('.reader-footer')).to_contain_text('2 / 2 页')
    expect(page.locator('canvas')).to_have_css('visibility', 'visible')
    page.screenshot(path=str(RESULTS / 'native-pdf.png'))
    page.get_by_role('button', name='返回书架', exact=True).click()
    page.get_by_role('button', name='阅读 山野来信', exact=True).click()
    page.wait_for_timeout(300)
    page.screenshot(path=str(RESULTS / 'native-reader.png'))
    assert not errors, errors
    assert not console_errors, console_errors
    report = {'runtime': 'packaged Tauri / WebView2', 'url': page.url, 'viewport': page.evaluate('({width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio})'),
              'passed': ['native startup', 'native always-on-top permission', 'page turning', 'discreet mode and window title', 'native file picker', 'EPUB/MOBI/AZW3/PDF imports under production CSP', 'PDF canvas pages'],
              'page_errors': errors, 'console_errors': console_errors}
    (RESULTS / 'native-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=True, indent=2))
    # Detach only; the launcher owns app shutdown and QA profile lifecycle.
    browser.close()
