import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SOURCE_DIR = path.resolve('MIDI LOOPS/Loops')
const OUTPUT_DIR = path.resolve('src/assets/sampler-snippets')
const SNIPPETS_PER_FILE = 10
const SNIPPET_SECONDS = 1
const MAX_ATTEMPTS_PER_SNIPPET = 80
const MIN_AUDIBLE_PEAK = 64
const MIN_AUDIBLE_RMS = 10

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

async function readSnippetStats(filePath) {
  const buffer = await fs.readFile(filePath)
  let offset = 12
  let dataStart = -1
  let dataSize = 0

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)

    if (id === 'data') {
      dataStart = offset + 8
      dataSize = size
      break
    }

    offset += 8 + size + (size % 2)
  }

  if (dataStart === -1) {
    return { peak: 0, rms: 0 }
  }

  const sampleCount = Math.floor(dataSize / 2)
  let peak = 0
  let sumSquares = 0

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = buffer.readInt16LE(dataStart + index * 2)
    const absSample = Math.abs(sample)
    peak = Math.max(peak, absSample)
    sumSquares += sample * sample
  }

  return {
    peak,
    rms: sampleCount === 0 ? 0 : Math.sqrt(sumSquares / sampleCount),
  }
}

function isAudible({ peak, rms }) {
  return peak >= MIN_AUDIBLE_PEAK && rms >= MIN_AUDIBLE_RMS
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

    let acceptedCount = 0
    let attemptCount = 0

    while (acceptedCount < SNIPPETS_PER_FILE && attemptCount < SNIPPETS_PER_FILE * MAX_ATTEMPTS_PER_SNIPPET) {
      attemptCount += 1
      const start = maxStart === 0 ? 0 : random() * maxStart
      const outputName = `${number}_${name}_${bpm}_bpm_${String(acceptedCount + 1).padStart(2, '0')}.wav`
      const outputPath = path.join(OUTPUT_DIR, outputName)

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
        outputPath,
      ])

      if (isAudible(await readSnippetStats(outputPath))) {
        acceptedCount += 1
      } else {
        await fs.rm(outputPath, { force: true })
      }
    }

    if (acceptedCount < SNIPPETS_PER_FILE) {
      console.warn(`Only wrote ${acceptedCount} audible snippet(s) for ${fileName}`)
    }
  }

  console.log(`Wrote ${fileNames.length * SNIPPETS_PER_FILE} sampler snippet(s) to ${path.relative(process.cwd(), OUTPUT_DIR)}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
