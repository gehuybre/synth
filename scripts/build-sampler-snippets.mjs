import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SOURCE_DIR = path.resolve('MIDI LOOPS/Loops')
const OUTPUT_DIR = path.resolve('src/assets/sampler-snippets')
const SNIPPETS_PER_FILE = 10
const SNIPPET_SECONDS = 1

function hashString(value) {
  let hash = 2166136261

  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function seededRandom(seed) {
  let value = seed

  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/\.wav$/i, '')
    .replace(/^\d+\s+/, '')
    .replace(/\s+\d+\s*bpm$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseLoopName(fileName, fallbackIndex) {
  const match = fileName.match(/^(\d+)\s+(.+?)\s+(\d+)\s*bpm\.wav$/i)

  return {
    number: match?.[1] ?? String(fallbackIndex + 1).padStart(2, '0'),
    name: match ? slugify(fileName) : 'sample',
    bpm: match?.[3] ?? '160',
  }
}

async function getDuration(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ])

  return Number(stdout.trim())
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  for (const entry of await fs.readdir(OUTPUT_DIR)) {
    if (entry.endsWith('.wav')) {
      await fs.rm(path.join(OUTPUT_DIR, entry), { force: true })
    }
  }

  const fileNames = (await fs.readdir(SOURCE_DIR))
    .filter((fileName) => fileName.toLowerCase().endsWith('.wav'))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))

  for (const [fileIndex, fileName] of fileNames.entries()) {
    const sourcePath = path.join(SOURCE_DIR, fileName)
    const duration = await getDuration(sourcePath)
    const random = seededRandom(hashString(fileName))
    const { number, name, bpm } = parseLoopName(fileName, fileIndex)
    const maxStart = Math.max(0, duration - SNIPPET_SECONDS)

    for (let snippetIndex = 0; snippetIndex < SNIPPETS_PER_FILE; snippetIndex += 1) {
      const start = maxStart === 0 ? 0 : random() * maxStart
      const outputName = `${number}_${name}_${bpm}_bpm_${String(snippetIndex + 1).padStart(2, '0')}.wav`

      await execFileAsync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        start.toFixed(3),
        '-i',
        sourcePath,
        '-t',
        String(SNIPPET_SECONDS),
        '-ac',
        '1',
        '-ar',
        '22050',
        '-c:a',
        'pcm_s16le',
        path.join(OUTPUT_DIR, outputName),
      ])
    }
  }

  console.log(`Wrote ${fileNames.length * SNIPPETS_PER_FILE} sampler snippet(s) to ${path.relative(process.cwd(), OUTPUT_DIR)}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
