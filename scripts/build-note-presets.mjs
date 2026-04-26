import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const NOTES_DIR = 'MIDI LOOPS/notes'
const OUT_FILE = 'src/notePresets.generated.js'
const DEFAULT_BPM = 96
const DEFAULT_OCTAVE = 4
const LINE_BREAK_RESTS = 2
const SECTION_BREAK_RESTS = 4

const NOTE_TO_SEMITONE = new Map([
  ['C', 0],
  ['C#', 1],
  ['DB', 1],
  ['D', 2],
  ['D#', 3],
  ['EB', 3],
  ['E', 4],
  ['F', 5],
  ['F#', 6],
  ['GB', 6],
  ['G', 7],
  ['G#', 8],
  ['AB', 8],
  ['A', 9],
  ['A#', 10],
  ['BB', 10],
  ['B', 11],
])
const NOTE_IDS = ['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b']
const BPM_BY_SLUG = new Map([
  ['believer', 125],
  ['clint-eastwood', 84],
  ['mario', 100],
])
const PRESET_BY_SLUG = new Map([
  ['believer', 'supersaw'],
  ['clint-eastwood', 'organ'],
  ['mario', 'chip'],
])

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function titleFromFilename(file) {
  return basename(file, '.txt')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function padIdFromKey(text) {
  const keyMatch = text.match(/^\s*Key:\s*([A-G](?:#|b)?)/im)

  if (!keyMatch) {
    return 'c'
  }

  const keyName = keyMatch[1].toUpperCase()
  const semitone = NOTE_TO_SEMITONE.get(keyName)

  return semitone === undefined ? 'c' : NOTE_IDS[semitone]
}

function noteTokenToId(token) {
  const prefix = token.match(/^[\^_*]+/)?.[0] ?? ''
  const noteName = token.slice(prefix.length).toUpperCase()
  const semitone = NOTE_TO_SEMITONE.get(noteName)

  if (semitone === undefined) {
    return null
  }

  const octaveOffset =
    [...prefix].filter((character) => character === '^').length -
    [...prefix].filter((character) => character === '_').length +
    [...prefix].filter((character) => character === '*').length * 2
  const octave = DEFAULT_OCTAVE + octaveOffset

  return `${NOTE_IDS[semitone]}${octave}`
}

function repeatRest(count) {
  return Array.from({ length: count }, () => 'rest')
}

function trimRests(steps) {
  let firstNoteIndex = 0
  let lastNoteIndex = steps.length - 1

  while (steps[firstNoteIndex] === 'rest') {
    firstNoteIndex += 1
  }

  while (steps[lastNoteIndex] === 'rest') {
    lastNoteIndex -= 1
  }

  return steps.slice(firstNoteIndex, lastNoteIndex + 1)
}

function restCountForGap(gap) {
  const spaceCount = (gap.match(/\s/g) ?? []).length
  const hasTie = /[-–—]/.test(gap)

  if (hasTie && spaceCount <= 4) {
    return 0
  }

  if (spaceCount <= 2) {
    return 0
  }

  if (spaceCount <= 5) {
    return 1
  }

  if (spaceCount <= 9) {
    return 2
  }

  if (spaceCount <= 14) {
    return 3
  }

  return 4
}

function extractNoteMatches(line) {
  if (/^\s*(Note range|Key|Transposed by):/i.test(line)) {
    return []
  }

  const matches = [...line.matchAll(/[\^_*]*[A-G](?:#|b)?/g)]

  if (!matches.length) {
    return []
  }

  const leftover = line
    .replace(/[\^_*]*[A-G](?:#|b)?/g, '')
    .replace(/[\s\-–—|.,…()]+/g, '')

  return leftover ? [] : matches
}

function extractLineSteps(line) {
  const matches = extractNoteMatches(line)

  return matches.flatMap((match, index) => {
    const token = noteTokenToId(match[0])

    if (!token) {
      return []
    }

    if (index === 0) {
      return [token]
    }

    const previousMatch = matches[index - 1]
    const gap = line.slice(previousMatch.index + previousMatch[0].length, match.index)

    return [...repeatRest(restCountForGap(gap)), token]
  })
}

function noteCountForSteps(steps) {
  return steps.filter((step) => step !== 'rest').length
}

function sectionLabelFromLine(line) {
  const trimmed = line.trim()

  if (!trimmed.endsWith(':')) {
    return null
  }

  return trimmed.slice(0, -1).trim()
}

function uniqueNoteCount(steps) {
  return new Set(steps.filter((step) => step !== 'rest')).size
}

function sectionSignature(steps) {
  return steps.filter((step) => step !== 'rest').join(' ')
}

function isUsefulSection(section) {
  return noteCountForSteps(section.steps) >= 5 && uniqueNoteCount(section.steps) >= 3
}

function parseNoobNotesText(text) {
  const sections = []
  let currentSteps = []
  let currentLabel = null
  let pendingLabel = null

  const closeSection = () => {
    const steps = trimRests(currentSteps)
    const isUseful = noteCountForSteps(steps) >= 5

    if (steps.length) {
      sections.push({
        label: currentLabel,
        order: sections.length,
        steps,
      })
    }

    currentSteps = []

    if (currentLabel && !isUseful) {
      return
    }

    currentLabel = pendingLabel
    pendingLabel = null
  }

  text.split(/\r?\n/).forEach((line) => {
    const label = sectionLabelFromLine(line)

    if (label) {
      closeSection()
      pendingLabel = label
      currentLabel = label
      return
    }

    const lineSteps = extractLineSteps(line)

    if (lineSteps.length) {
      if (!currentLabel && pendingLabel) {
        currentLabel = pendingLabel
        pendingLabel = null
      }

      if (currentSteps.length) {
        currentSteps.push(...repeatRest(LINE_BREAK_RESTS))
      }

      currentSteps.push(...lineSteps)
      return
    }

    if (!line.trim()) {
      closeSection()
    }
  })

  closeSection()

  const usefulSections = []
  const seenSignatures = new Set()

  sections.filter(isUsefulSection).forEach((section) => {
    const signature = sectionSignature(section.steps)

    if (seenSignatures.has(signature)) {
      return
    }

    seenSignatures.add(signature)
    usefulSections.push(section)
  })

  if (usefulSections.length) {
    return usefulSections
      .map((section) => ({
        ...section,
        score:
          Math.min(noteCountForSteps(section.steps), 32) * 2 +
          uniqueNoteCount(section.steps) * 4 +
          (/chorus|hook/i.test(section.label ?? '') ? 120 : 0) -
          Math.max(0, section.steps.length - 64),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 6)
      .sort((left, right) => left.order - right.order)
  }

  const fullSteps = trimRests(
    sections.flatMap((section, index) =>
      index === 0 ? section.steps : [...repeatRest(SECTION_BREAK_RESTS), ...section.steps],
    ),
  )

  return fullSteps.length ? [{ label: null, steps: fullSteps }] : []
}

function bpmFromText(text, slug) {
  const bpmMatch = text.match(/^\s*BPM:\s*(\d{2,3})/im)

  if (bpmMatch) {
    return Number(bpmMatch[1])
  }

  return BPM_BY_SLUG.get(slug) ?? DEFAULT_BPM
}

function presetIdForSlug(slug) {
  return PRESET_BY_SLUG.get(slug) ?? 'toy'
}

function createDrumPattern(stepCount, slug) {
  if (stepCount < 8) {
    return {}
  }

  const arrays = {
    kick: repeatBoolean(stepCount),
    clap: repeatBoolean(stepCount),
    hat: repeatBoolean(stepCount),
    openHat: repeatBoolean(stepCount),
  }

  for (let index = 0; index < stepCount; index += 1) {
    const barStep = index % 16

    arrays.hat[index] = barStep % 2 === 0
    arrays.clap[index] = barStep === 4 || barStep === 12
    arrays.openHat[index] = slug === 'believer' && barStep === 14

    if (slug === 'clint-eastwood') {
      arrays.kick[index] = [0, 6, 10].includes(barStep)
    } else {
      arrays.kick[index] = barStep === 0 || barStep === 8
    }
  }

  return arrays
}

function repeatBoolean(count) {
  return Array.from({ length: count }, () => false)
}

function presetsFromFile(file) {
  const path = join(NOTES_DIR, file)
  const text = readFileSync(path, 'utf8')
  const title = titleFromFilename(file)
  const slug = slugify(title)
  const sections = parseNoobNotesText(text)

  if (!sections.length) {
    return []
  }

  const labelCounts = new Map()

  return sections.map((section, index) => {
    const labelBase = section.label ?? `Part ${index + 1}`
    const labelCount = (labelCounts.get(labelBase) ?? 0) + 1
    const displayLabel =
      section.label && labelCount > 1 ? `${labelBase} ${labelCount}` : labelBase

    labelCounts.set(labelBase, labelCount)

    return {
      id: `notes:${slug}-part-${index + 1}-${slugify(labelBase)}`,
      label: `Notes: ${title} ${displayLabel}`,
      source: 'notes',
      bpm: bpmFromText(text, slug),
      basePadId: padIdFromKey(text),
      loopLength: section.steps.length,
      bassTracks: [],
      melodyTracks: [
        {
          presetId: presetIdForSlug(slug),
          steps: section.steps,
        },
      ],
      drums: createDrumPattern(section.steps.length, slug),
    }
  })
}

const presets = readdirSync(NOTES_DIR)
  .filter((file) => file.toLowerCase().endsWith('.txt'))
  .flatMap(presetsFromFile)
  .sort((left, right) => left.label.localeCompare(right.label))

const file = `// Generated by scripts/build-note-presets.mjs. Do not edit by hand.
export const NOTE_TEXT_PRESETS = ${JSON.stringify(presets, null, 2)}
`

writeFileSync(OUT_FILE, file)
console.log(`Wrote ${presets.length} note preset(s) to ${OUT_FILE}`)
