"""Regression for fractional-pixel chapter boundaries; uses only original test text."""
from pathlib import Path
import argparse
import json
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / 'test-results'
parser = argparse.ArgumentParser()
parser.add_argument('--cdp')
args = parser.parse_args()
RESULTS.mkdir(exist_ok=True)
fixture = RESULTS / '滚动边界回归.txt'
fixture.write_text('\n\n'.join(
    f'第{chapter+1}章 边界回归\n\n' + '\n\n'.join(
        f'这里是第{paragraph+1}段。' + '山路上有微风，远处亮起了一盏灯。' * (1 + (chapter + paragraph) % 7)
        for paragraph in range(23 + chapter % 8)
    ) for chapter in range(30)
), encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(args.cdp) if args.cdp else p.chromium.launch(
        headless=True, executable_path=p.chromium.executable_path,
        args=['--force-device-scale-factor=1.5'],
    )
    page = browser.contexts[0].pages[0] if args.cdp else browser.new_page(viewport={'width':420,'height':780})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    if args.cdp:
        page.reload()
    else:
        page.goto('http://127.0.0.1:1420')
    page.get_by_label('选择本地小说文件', exact=True).set_input_files(str(fixture))
    expect(page.get_by_role('dialog', name='把故事带进书架')).not_to_be_visible()
    page.get_by_role('button', name='阅读 滚动边界回归', exact=True).click()
    page.get_by_role('button', name='阅读菜单', exact=True).click()
    page.locator('.reader-actions').get_by_role('button', name='设置', exact=True).click()
    page.get_by_role('button', name='滚动', exact=True).click()
    while int(page.locator('.stepper > span').inner_text()) != 21:
        name = '增大字号' if int(page.locator('.stepper > span').inner_text()) < 21 else '减小字号'
        page.get_by_role('button', name=name, exact=True).click()
    page.get_by_role('button', name='宽松', exact=True).click()
    page.get_by_role('button', name='黑体', exact=True).click()
    page.get_by_role('button', name='关闭面板', exact=True).click()
    page.get_by_role('button', name='收起菜单', exact=True).click()
    viewport = page.locator('.reading-viewport')
    boundaries = 0
    for chapter in range(24):
        target = viewport.locator(f'[data-chapter="{chapter}"] .reading-text span').last
        for edge in [-3, -1, 0, .25, .5, .75, 1, 1.25, 1.5, 2, 3, 1, 0, 1, 2, .5, 1.5, 0, 2, 0]:
            target.evaluate('''(el, edge) => {
              const v = el.closest('.reading-viewport');
              v.scrollTop += el.getBoundingClientRect().bottom - v.getBoundingClientRect().top - edge;
            }''', edge)
            page.wait_for_timeout(25)
            assert not errors, {'chapter':chapter,'edge':edge,'errors':errors}
            expect(page.get_by_text('页面暂时没有打开', exact=True)).to_have_count(0)
        boundaries += 1
    report = {'runtime':'Tauri / WebView2' if args.cdp else 'Chromium', 'chapter_boundaries':boundaries, 'boundary_positions':boundaries*20, 'errors':errors}
    (RESULTS / ('boundary-native-report.json' if args.cdp else 'boundary-browser-report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=True),flush=True)
    browser.close()
