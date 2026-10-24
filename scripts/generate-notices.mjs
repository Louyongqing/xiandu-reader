import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const texts = new Map()
const components = []
const missing = []
const supplemental = JSON.parse(readFileSync(join(root, 'docs/licenses/sources.json'), 'utf8'))

function licenseFiles(directory) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (item) =>
        item.isFile() && /^(licen[cs]e|copying|copyright|notice)(?:[._-]|$)/i.test(item.name),
    )
    .map((item) => join(directory, item.name))
}

function addComponent(name, version, license, directory, extraFiles = []) {
  const supplement = supplemental[`${name}@${version}`]
  const files = [
    ...new Set([
      ...licenseFiles(directory),
      ...extraFiles,
      ...(supplement?.files || []).map((item) => join(root, 'docs/licenses', item.file)),
    ]),
  ]
  const references = []
  for (const file of files) {
    if (!existsSync(file)) continue
    const content = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim()
    if (!content) continue
    const hash = createHash('sha256').update(content).digest('hex')
    if (!texts.has(hash)) texts.set(hash, { id: texts.size + 1, content })
    references.push(texts.get(hash).id)
  }
  const source = name.startsWith('cargo:')
    ? `https://crates.io/api/v1/crates/${name.slice(6)}/${version}/download`
    : `https://www.npmjs.com/package/${name.slice(4)}/v/${version}`
  components.push({ name, version, license, source, references: [...new Set(references)] })
  if (!references.length) missing.push(`${name}@${version} (${license})`)
}

const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || entry.dev || !existsSync(join(root, path, 'package.json'))) continue
  const directory = join(root, path)
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  // PDF.js uses these only in Node; native canvas binaries are not shipped in the WebView build.
  if (pkg.name.startsWith('@napi-rs/canvas')) continue
  const extras =
    pkg.name === 'pdfjs-dist'
      ? ['cmaps', 'standard_fonts', 'wasm'].flatMap((folder) =>
          licenseFiles(join(directory, folder)),
        )
      : []
  addComponent(
    `npm:${pkg.name}`,
    pkg.version,
    pkg.license || entry.license || 'See license text',
    directory,
    extras,
  )
}

const metadata = spawnSync(
  'cargo',
  [
    'metadata',
    '--locked',
    '--offline',
    '--format-version',
    '1',
    '--filter-platform',
    'x86_64-pc-windows-msvc',
  ],
  {
    cwd: join(root, 'src-tauri'),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  },
)
if (metadata.status !== 0) throw new Error(metadata.stderr || 'Cargo metadata failed')
const graph = JSON.parse(metadata.stdout)
const included = new Set(graph.resolve.nodes.map((node) => node.id))
for (const pkg of graph.packages) {
  if (!pkg.source || !included.has(pkg.id)) continue
  const directory = dirname(pkg.manifest_path)
  const extras = [
    ...licenseFiles(join(directory, 'licenses')),
    ...licenseFiles(join(directory, 'license')),
    ...(pkg.license_file ? [resolve(directory, pkg.license_file)] : []),
  ]
  addComponent(
    `cargo:${pkg.name}`,
    pkg.version,
    pkg.license || 'See license text',
    directory,
    extras,
  )
}

components.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
const table = components
  .map(
    (item) =>
      `| [${item.name}](${item.source}) | ${item.version} | ${item.license.replaceAll('|', '\\|')} | ${item.references.map((id) => `[${id}](#license-${id})`).join(', ') || 'See upstream source'} |`,
  )
  .join('\n')
const licenses = Array.from(texts.values())
  .map(
    ({ id, content }) =>
      `<a id="license-${id}"></a>\n\n## License ${id}\n\n\`\`\`text\n${content}\n\`\`\``,
  )
  .join('\n\n')
writeFileSync(
  join(root, 'THIRD_PARTY_NOTICES.md'),
  `# Third-party notices\n\nThis application includes the following third-party components and resources. Their original licenses and copyright notices remain applicable. The application's MIT license does not replace these terms. JSZip is used under its MIT license option; fxhash and mac are used under their Apache-2.0 option.\n\nGenerated from package-lock.json and Cargo.lock for x86_64-pc-windows-msvc. Includes installed production npm dependencies (excluding Node-only optional canvas binaries), bundled PDF resources, and resolved Rust build/runtime dependencies. Some listed components may not be present in the final binary. Identical license texts are deduplicated. Supplemental license provenance is recorded in docs/licenses/sources.json. Component links provide the corresponding upstream version and source; third-party source code is unmodified.\n\n| Component | Version | Declared license | License texts |\n| --- | --- | --- | --- |\n${table}\n\n${licenses}\n`,
)
if (missing.length) process.exitCode = 1
console.log(
  JSON.stringify(
    {
      components: components.length,
      uniqueLicenseTexts: texts.size,
      withoutBundledLicenseFile: missing,
    },
    null,
    2,
  ),
)
