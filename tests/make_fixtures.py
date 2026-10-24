"""Small original fixtures for import and corruption/security regression checks."""
from pathlib import Path
import struct
import zipfile

TARGET = Path(__file__).resolve().parents[1] / 'test-results' / 'fixtures'
TARGET.mkdir(parents=True, exist_ok=True)
paragraph = '山路安静地向前延伸，风从树林里走过。我们停下来，看见远处亮起了一盏灯。'
chapters = [f'第{n}章 测试章节{n}\n\n' + '\n\n'.join(f'{i:03d} {paragraph}' for i in range(50)) for n in range(1, 4)]
(TARGET / '测试长篇.txt').write_text('\n\n'.join(chapters), encoding='utf-8')
(TARGET / '中文编码.txt').write_bytes(('第一章 中文编码\n\n' + paragraph * 10).encode('gb18030'))
(TARGET / 'empty.txt').write_text('', encoding='utf-8')
(TARGET / 'bad.epub').write_bytes(b'not a valid zip')
(TARGET / 'unsupported.doc').write_bytes(b'unsupported file')

with zipfile.ZipFile(TARGET / '测试书籍.epub', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
    z.writestr('META-INF/container.xml', '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    z.writestr('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>EPUB 导入验证</dc:title><dc:creator>测试作者</dc:creator></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>')
    for n in range(1, 3):
        z.writestr(f'OEBPS/c{n}.xhtml', f'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>第{n}章</title></head><body><h1>第{n}章 电子书</h1><script>window.IMPORTED_SCRIPT_RAN=true</script><img src="https://example.invalid/tracker.png" onerror="window.IMPORTED_SCRIPT_RAN=true"/>' + ''.join(f'<p>{paragraph}</p>' for _ in range(30)) + '</body></html>')

(TARGET / '测试书籍.fb2').write_text('<?xml version="1.0" encoding="UTF-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>FB2 导入验证</book-title><author><first-name>闲读</first-name><last-name>测试</last-name></author></title-info></description><body><section><title><p>第一章 FB2</p></title><p>' + paragraph * 8 + '</p></section></body></FictionBook>', encoding='utf-8')

# Minimal uncompressed PalmDOC/MOBI 6 with an empty EXTH header.
title = b'MOBI Import Check'
body = ('<html><head></head><body><h1>第一章 Kindle</h1><p>' + paragraph * 25 + '</p><mbp:pagebreak/><h1>第二章 继续</h1><p>' + paragraph * 10 + '</p></body></html>').encode('utf-8')
record0 = bytearray(280 + len(title))
struct.pack_into('>HHIHHHH', record0, 0, 1, 0, len(body), 1, 4096, 0, 0)
record0[16:20] = b'MOBI'
for offset, value in [(20, 248), (24, 2), (28, 65001), (32, 42), (36, 6), (84, 280), (88, len(title)), (108, 2), (128, 64), (244, 0xffffffff)]:
    struct.pack_into('>I', record0, offset, value)
record0[264:268] = b'EXTH'
struct.pack_into('>II', record0, 268, 12, 0)
record0[280:] = title
header = bytearray(96)
header[0:len(title)] = title
header[60:68] = b'BOOKMOBI'
struct.pack_into('>H', header, 76, 2)
struct.pack_into('>I', header, 78, 96)
struct.pack_into('>I', header, 86, 96 + len(record0))
(TARGET / '测试书籍.mobi').write_bytes(header + record0 + body)
encrypted = bytearray(header + record0 + body)
struct.pack_into('>H', encrypted, 96 + 12, 2)
(TARGET / 'encrypted.mobi').write_bytes(encrypted)

# Two original PDF pages, generated without a PDF authoring dependency.
objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>']
for page_number in range(2):
    stream = f'BT /F1 24 Tf 40 730 Td (PDF page {page_number + 1} - Local reading test) Tj 0 -50 Td /F1 14 Tf (This page is original test content.) Tj ET'.encode()
    objects += [f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 480 800] /Resources << /Font << /F1 7 0 R >> >> /Contents {4 + page_number * 2} 0 R >>'.encode(), f'<< /Length {len(stream)} >>\nstream\n'.encode() + stream + b'\nendstream']
objects.append(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
pdf = bytearray(b'%PDF-1.4\n')
offsets = [0]
for i, obj in enumerate(objects, start=1):
    offsets.append(len(pdf)); pdf.extend(f'{i} 0 obj\n'.encode() + obj + b'\nendobj\n')
xref = len(pdf)
pdf.extend(f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'.encode())
for offset in offsets[1:]: pdf.extend(f'{offset:010d} 00000 n \n'.encode())
pdf.extend(f'trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode())
(TARGET / '测试文档.pdf').write_bytes(pdf)
print('Created original test fixtures:', TARGET)
