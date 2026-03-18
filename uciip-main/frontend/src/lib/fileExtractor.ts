import JSZip from 'jszip'

export interface ExtractedEntry {
  path: string
  name: string
  isDirectory: boolean
  size: number
  content?: string        // text content for readable files
  dataUrl?: string        // data URL for images
}

export interface ExtractionResult {
  entries: ExtractedEntry[]
  textContent: string       // concatenated text content for analysis
  emails: string[]
  phones: string[]
  domains: string[]
  urls: string[]
  totalFiles: number
  totalSize: number
}

// ─── Regex patterns for IOC extraction ────────────────────────────────────────
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
const PHONE_REGEX = /(\+?\d[\d\s\-().]{7,}\d)/g
const DOMAIN_REGEX = /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b/g
const URL_REGEX = /https?:\/\/[^\s"'<>]+/g

const TEXT_EXTENSIONS = new Set([
  'txt', 'log', 'csv', 'json', 'xml', 'html', 'htm',
  'md', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'env', 'js', 'ts', 'py', 'sql'
])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'])

function getExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.has(getExtension(name))
}

function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(name))
}

// ─── Read a single File object as text ────────────────────────────────────────
function readAsText(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

// ─── Read a single File object as data URL ────────────────────────────────────
function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// ─── Extract IOCs from text ───────────────────────────────────────────────────
function extractIOCs(text: string): { emails: string[]; phones: string[]; domains: string[]; urls: string[] } {
  const urls = [...new Set(Array.from(text.matchAll(URL_REGEX), m => m[0]))]
  const emails = [...new Set(Array.from(text.matchAll(EMAIL_REGEX), m => m[0]))]
  // Only keep phone-like strings that look phone-ish (≥8 digits)
  const rawPhones = Array.from(text.matchAll(PHONE_REGEX), m => m[0].trim())
  const phones = [...new Set(rawPhones.filter(p => (p.match(/\d/g)?.length ?? 0) >= 8))]
  // Extract domains but exclude those already captured in emails or that look like file extensions
  const rawDomains = Array.from(text.matchAll(DOMAIN_REGEX), m => m[0])
  const emailDomainSet = new Set(emails.map(e => e.split('@')[1]))
  const domains = [...new Set(
    rawDomains.filter(d =>
      !emailDomainSet.has(d) &&
      !urls.some(u => u.includes(d)) === false ? true : !emailDomainSet.has(d)
    )
  )].slice(0, 50) // cap to avoid noise

  return { emails, phones, domains, urls }
}

// ─── Traverse a FileSystemDirectoryEntry recursively ─────────────────────────
function traverseEntry(entry: FileSystemEntry, basePath = ''): Promise<File[]> {
  const path = basePath ? `${basePath}/${entry.name}` : entry.name

  if (entry.isFile) {
    return new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject)
    }).then(file => {
      // Attach relative path via a custom property
      Object.defineProperty(file, 'relativePath', { value: path, writable: false })
      return [file]
    })
  }

  if (entry.isDirectory) {
    return new Promise<FileSystemEntry[]>((resolve, reject) => {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      const results: FileSystemEntry[] = []
      function readBatch() {
        reader.readEntries(entries => {
          if (entries.length === 0) {
            resolve(results)
          } else {
            results.push(...entries)
            readBatch()
          }
        }, reject)
      }
      readBatch()
    }).then(entries =>
      Promise.all(entries.map(e => traverseEntry(e, path))).then(arrays => arrays.flat())
    )
  }

  return Promise.resolve([])
}

// ─── Main: extract a dropped DataTransferItemList (supports folders) ──────────
export async function extractFromDataTransfer(items: DataTransferItemList): Promise<ExtractionResult> {
  const allFiles: { file: File; path: string }[] = []

  const promises: Promise<void>[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null

    if (entry) {
      promises.push(
        traverseEntry(entry).then(files => {
          files.forEach(f => {
            const rp = (f as any).relativePath ?? f.name
            allFiles.push({ file: f, path: rp })
          })
        })
      )
    } else {
      const file = item.getAsFile()
      if (file) allFiles.push({ file, path: file.name })
    }
  }

  await Promise.all(promises)

  return buildExtractionResult(allFiles)
}

// ─── Main: extract contents from a single File (ZIP or plain) ─────────────────
export async function extractFromFile(file: File): Promise<ExtractionResult> {
  const ext = getExtension(file.name)

  if (ext === 'zip') {
    return extractZip(file)
  }

  // Single plain file
  const entry: ExtractedEntry = {
    path: file.name,
    name: file.name,
    isDirectory: false,
    size: file.size,
  }

  let combinedText = ''
  if (isTextFile(file.name)) {
    try {
      entry.content = await readAsText(file)
      combinedText = entry.content
    } catch { /* ignore */ }
  } else if (isImageFile(file.name)) {
    try {
      entry.dataUrl = await readAsDataUrl(file)
    } catch { /* ignore */ }
  }

  const iocs = extractIOCs(combinedText)
  return {
    entries: [entry],
    textContent: combinedText,
    ...iocs,
    totalFiles: 1,
    totalSize: file.size,
  }
}

// ─── ZIP extraction ────────────────────────────────────────────────────────────
async function extractZip(file: File): Promise<ExtractionResult> {
  const zip = new JSZip()
  const loaded = await zip.loadAsync(file)

  const entries: ExtractedEntry[] = []
  let combinedText = ''
  let totalSize = 0

  const tasks = Object.keys(loaded.files).map(async (relativePath) => {
    const zipEntry = loaded.files[relativePath]
    const name = relativePath.split('/').pop() ?? relativePath

    const entry: ExtractedEntry = {
      path: relativePath,
      name,
      isDirectory: zipEntry.dir,
      size: 0,
    }

    if (!zipEntry.dir) {
      if (isTextFile(name)) {
        try {
          const text = await zipEntry.async('text')
          entry.content = text.slice(0, 50_000) // cap per file
          entry.size = text.length
          combinedText += '\n' + entry.content
          totalSize += text.length
        } catch { /* binary or unreadable */ }
      } else if (isImageFile(name)) {
        try {
          const blob = await zipEntry.async('blob')
          entry.size = blob.size
          entry.dataUrl = await readAsDataUrl(blob)
          totalSize += blob.size
        } catch { /* ignore */ }
      } else {
        try {
          const blob = await zipEntry.async('blob')
          entry.size = blob.size
          totalSize += blob.size
        } catch { /* ignore */ }
      }
    }

    entries.push(entry)
  })

  await Promise.all(tasks)

  // Sort: directories first, then by path
  entries.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.path.localeCompare(b.path)
  })

  const iocs = extractIOCs(combinedText)
  return {
    entries,
    textContent: combinedText,
    ...iocs,
    totalFiles: entries.filter(e => !e.isDirectory).length,
    totalSize,
  }
}

// ─── Build result from a list of { file, path } pairs ────────────────────────
async function buildExtractionResult(fileList: { file: File; path: string }[]): Promise<ExtractionResult> {
  const entries: ExtractedEntry[] = []
  let combinedText = ''
  let totalSize = 0

  await Promise.all(fileList.map(async ({ file, path }) => {
    // if it's a zip, recurse
    if (getExtension(file.name) === 'zip') {
      const nested = await extractZip(file)
      nested.entries.forEach(e => {
        entries.push({ ...e, path: `${path}/${e.path}` })
      })
      combinedText += '\n' + nested.textContent
      totalSize += nested.totalSize
      return
    }

    const entry: ExtractedEntry = {
      path,
      name: file.name,
      isDirectory: false,
      size: file.size,
    }

    if (isTextFile(file.name)) {
      try {
        const text = await readAsText(file)
        entry.content = text.slice(0, 50_000)
        combinedText += '\n' + entry.content
        totalSize += text.length
      } catch { /* ignore */ }
    } else if (isImageFile(file.name)) {
      try {
        entry.dataUrl = await readAsDataUrl(file)
        totalSize += file.size
      } catch { /* ignore */ }
    } else {
      totalSize += file.size
    }

    entry.size = file.size
    entries.push(entry)
  }))

  entries.sort((a, b) => a.path.localeCompare(b.path))

  const iocs = extractIOCs(combinedText)
  return {
    entries,
    textContent: combinedText,
    ...iocs,
    totalFiles: entries.filter(e => !e.isDirectory).length,
    totalSize,
  }
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
