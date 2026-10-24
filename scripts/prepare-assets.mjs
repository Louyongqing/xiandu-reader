import { cpSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  const destination = resolve('public/pdf', folder)
  mkdirSync(destination, { recursive: true })
  cpSync(resolve('node_modules/pdfjs-dist', folder), destination, { recursive: true })
}
