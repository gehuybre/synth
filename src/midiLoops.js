import { parseMidi } from 'midi-file'

const STEP_COUNT = 16
const DEFAULT_BPM = 120
const SNIPPET_VARIANTS = [
  { id: 'hook', label: 'Hook', mode: 'hook', barPick: 0, voiceOrder: 'high' },
  { id: 'chords', label: 'Chords', mode: 'chords', barPick: 0, voiceOrder: 'low' },
  { id: 'bass', label: 'Bass', mode: 'bass', barPick: 0, voiceOrder: 'low' },
  { id: 'groove', label: 'Groove', mode: 'full', barPick: 0, voiceOrder: 'low' },
  { id: 'high', label: 'High', mode: 'high', barPick: 1, voiceOrder: 'high' },
  { id: 'low', label: 'Low', mode: 'low', barPick: 1, voiceOrder: 'low' },
]

const MIDI_LOOP_FILES = import.meta.glob('../MIDI LOOPS/*.mid', {
  query: '?url',
  import: 'default',
  eager: true,
})
const MIDI_SNIPPET_FILES = import.meta.glob('../MIDI LOOPS/snippets/*.mid', {
  query: '?url',
  import: 'default',
  eager: true,
})

function parseLoopMetadata(path) {
  const name = path.split('/').at(-1) ?? ''
  const match = name.match(/(ATP\d+)\s+\d+\s+([A-G](?:#|S)?)\s+PAD/i)

  if (!match) {
    return null
  }

  return {
    series: match[1].toUpperCase(),
    padId: match[2].toLowerCase().replace('#', 's'),
    path,
  }
}

const groupedMidiLoops = Object.entries(MIDI_LOOP_FILES)
  .map(([path, url]) => {
    const metadata = parseLoopMetadata(path)

    return metadata ? { ...metadata, url } : null
  })
  .filter(Boolean)
  .reduce((groups, entry) => {
    const current = groups.get(entry.series) ?? []
    current.push(entry)
    groups.set(entry.series, current)
    return groups
  }, new Map())

export const MIDI_LOOP_PRESETS = Array.from(groupedMidiLoops.entries())
  .map(([series, entries]) => {
    const selected =
      entries.find((entry) => entry.padId === 'c') ??
      entries.slice().sort((left, right) => left.path.localeCompare(right.path))[0]

    return {
      id: `midi:${series.toLowerCase()}:pad`,
      label: `${series} Pad`,
      url: selected.url,
      source: 'midi',
      basePadId: selected.padId,
    }
  })
  .sort((left, right) => left.label.localeCompare(right.label))

function formatSnippetLabel(path) {
  const name = path
    .split('/')
    .at(-1)
    ?.replace(/\.mid$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')

  return name || 'MIDI Snippet'
}

export const MIDI_SNIPPET_PRESETS = Object.entries(MIDI_SNIPPET_FILES)
  .flatMap(([path, url]) => {
    const snippetName = path
      .split('/')
      .at(-1)
      ?.replace(/\.mid$/i, '')
      .toLowerCase()

    return SNIPPET_VARIANTS.map((variant) => ({
      id: `snippet:${snippetName}:${variant.id}`,
      label: `Snippet: ${formatSnippetLabel(path)} ${variant.label}`,
      url,
      source: 'midi',
      basePadId: 'c',
      snippetMode: variant.mode,
      snippetBarPick: variant.barPick,
      snippetVoiceOrder: variant.voiceOrder,
    }))
  })
  .sort((left, right) => left.label.localeCompare(right.label))

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left - right)
}

function findTempoBpm(midi) {
  for (const track of midi.tracks) {
    for (const event of track) {
      if (event.type === 'setTempo' && event.microsecondsPerBeat) {
        return Math.round(60000000 / event.microsecondsPerBeat)
      }
    }
  }

  return DEFAULT_BPM
}

function findBarTicks(midi) {
  const ticksPerBeat = midi.header.ticksPerBeat ?? 96

  for (const track of midi.tracks) {
    for (const event of track) {
      if (event.type === 'timeSignature') {
        return ticksPerBeat * event.numerator * (4 / event.denominator)
      }
    }
  }

  return ticksPerBeat * 4
}

function extractTracks(midi) {
  return midi.tracks
    .map((events, trackIndex) => {
      let tick = 0
      let trackName = `Track ${trackIndex + 1}`
      let lastChannel = null
      const activeNotes = new Map()
      const notes = []

      events.forEach((event) => {
        tick += event.deltaTime ?? 0

        if (event.type === 'trackName' && event.text) {
          trackName = event.text.replace(/\0/g, '').trim() || trackName
        }

        if (event.channel !== undefined) {
          lastChannel = event.channel
        }

        if (event.type === 'noteOn' && event.velocity > 0) {
          const entries = activeNotes.get(event.noteNumber) ?? []
          entries.push({
            start: tick,
            velocity: event.velocity,
          })
          activeNotes.set(event.noteNumber, entries)
        }

        if (
          event.type === 'noteOff' ||
          (event.type === 'noteOn' && event.velocity === 0)
        ) {
          const entries = activeNotes.get(event.noteNumber)

          if (!entries?.length) {
            return
          }

          const note = entries.shift()

          notes.push({
            noteNumber: event.noteNumber,
            start: note.start,
            end: Math.max(tick, note.start + 1),
            velocity: note.velocity,
          })
        }
      })

      activeNotes.forEach((entries, noteNumber) => {
        entries.forEach((entry) => {
          notes.push({
            noteNumber,
            start: entry.start,
            end: Math.max(tick, entry.start + 1),
            velocity: entry.velocity,
          })
        })
      })

      return {
        name: trackName,
        channel: lastChannel,
        notes,
      }
    })
    .filter((track) => track.notes.length > 0)
}

function detectTrackRole(track) {
  const upperName = track.name.toUpperCase()

  if (
    track.channel === 9 ||
    /KICK|CLAP|SNARE|HAT|CYMBAL|PERC|TOM|RIM|DRUM/.test(upperName)
  ) {
    return 'drum'
  }

  if (/BASS|SUB/.test(upperName)) {
    return 'bass'
  }

  if (/PAD|CHORD|KEY|PIANO|PLUCK|ARP|LEAD/.test(upperName)) {
    return 'melody'
  }

  const averageNote =
    track.notes.reduce((sum, note) => sum + note.noteNumber, 0) / track.notes.length

  return averageNote < 55 ? 'bass' : 'melody'
}

function trackAverageNote(track) {
  return track.notes.reduce((sum, note) => sum + note.noteNumber, 0) / track.notes.length
}

function trackPitchRange(track) {
  const pitches = track.notes.map((note) => note.noteNumber)

  return {
    min: Math.min(...pitches),
    max: Math.max(...pitches),
    average: trackAverageNote(track),
  }
}

function selectSnippetTracks(tracks, mode) {
  const tracksWithRole = tracks.map((track) => ({
    ...track,
    role: detectTrackRole(track),
    range: trackPitchRange(track),
  }))
  const bassTracks = tracksWithRole.filter((track) => track.role === 'bass')
  const melodyTracks = tracksWithRole.filter((track) => track.role === 'melody')

  if (mode === 'bass') {
    return bassTracks.length
      ? bassTracks
      : tracksWithRole
          .slice()
          .sort((left, right) => left.range.average - right.range.average)
          .slice(0, 2)
  }

  if (mode === 'hook') {
    const candidates = melodyTracks.length ? melodyTracks : tracksWithRole

    return candidates
      .slice()
      .sort((left, right) => right.range.max - left.range.max)
      .slice(0, 2)
  }

  if (mode === 'chords') {
    const candidates = melodyTracks.length ? melodyTracks : tracksWithRole

    return candidates
      .slice()
      .sort((left, right) => right.notes.length - left.notes.length)
      .slice(0, 3)
  }

  if (mode === 'high') {
    const candidates = melodyTracks.filter((track) => track.range.average >= 60)

    return (candidates.length ? candidates : melodyTracks.length ? melodyTracks : tracksWithRole)
      .slice()
      .sort((left, right) => right.range.average - left.range.average)
      .slice(0, 3)
  }

  if (mode === 'low') {
    const candidates = tracksWithRole.filter((track) => track.range.average < 64)

    return (candidates.length ? candidates : bassTracks.length ? bassTracks : tracksWithRole)
      .slice()
      .sort((left, right) => left.range.average - right.range.average)
      .slice(0, 3)
  }

  return tracksWithRole
}

function rankCandidateBars(tracks, barTicks) {
  const totalTicks = tracks.reduce(
    (maxTick, track) =>
      Math.max(maxTick, ...track.notes.map((note) => note.end)),
    0,
  )
  const barCount = Math.max(1, Math.ceil(totalTicks / barTicks))
  const candidates = []

  for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
    const start = barIndex * barTicks
    const end = start + barTicks
    const stepPitches = Array.from({ length: STEP_COUNT }, () => [])
    const occupiedSteps = new Set()
    const pitchClasses = new Set()
    const pitches = []
    let noteCount = 0

    tracks.forEach((track) => {
      track.notes.forEach((note) => {
        if (note.start >= end || note.end <= start) {
          return
        }

        noteCount += 1
        pitches.push(note.noteNumber)
        pitchClasses.add(note.noteNumber % 12)

        const stepIndex = clamp(
          Math.floor(((Math.max(note.start, start) - start) / barTicks) * STEP_COUNT),
          0,
          STEP_COUNT - 1,
        )
        occupiedSteps.add(stepIndex)
        stepPitches[stepIndex].push(note.noteNumber)
      })
    })

    if (!noteCount) {
      continue
    }

    const occupiedCount = occupiedSteps.size
    const densityScore = Math.max(0, 14 - Math.abs(occupiedCount - 9) * 1.6)
    const noteCountScore = Math.max(0, 16 - Math.abs(noteCount - 24) * 0.28)
    const polyphonyScore =
      stepPitches.filter((notes) => uniqueSorted(notes).length > 1).length * 1.35
    const pitchRange = Math.max(...pitches) - Math.min(...pitches)
    const rangeScore = Math.max(0, 8 - Math.max(0, pitchRange - 28) * 0.25)
    const pitchVarietyScore = Math.min(10, pitchClasses.size * 1.25)
    const silencePenalty = occupiedCount < 4 ? 12 : 0
    const chaosPenalty = noteCount > 72 ? (noteCount - 72) * 0.4 : 0

    candidates.push({
      barIndex,
      start,
      score:
        densityScore +
        noteCountScore +
        polyphonyScore +
        rangeScore +
        pitchVarietyScore -
        silencePenalty -
        chaosPenalty,
    })
  }

  if (!candidates.length) {
    return [{ barIndex: 0, start: 0, score: 0 }]
  }

  const ranked = candidates.sort((left, right) => right.score - left.score)
  const selected = []

  ranked.forEach((candidate) => {
    if (
      selected.length >= SNIPPET_VARIANTS.length ||
      selected.some((item) => Math.abs(item.barIndex - candidate.barIndex) <= 1)
    ) {
      return
    }

    selected.push(candidate)
  })

  ranked.forEach((candidate) => {
    if (
      selected.length >= SNIPPET_VARIANTS.length ||
      selected.some((item) => item.barIndex === candidate.barIndex)
    ) {
      return
    }

    selected.push(candidate)
  })

  return selected
}

function chooseSnippetBarStart(tracks, barTicks, snippetIndex = 0) {
  const rankedBars = rankCandidateBars(tracks, barTicks)
  const selectedBar = rankedBars[snippetIndex % rankedBars.length] ?? rankedBars[0]

  return selectedBar.start
}

function collectStepPitches(notes, barStart, barTicks) {
  const stepTicks = barTicks / STEP_COUNT

  return Array.from({ length: STEP_COUNT }, (_, stepIndex) => {
    const start = barStart + stepIndex * stepTicks
    const end = start + stepTicks

    return uniqueSorted(
      notes
        .filter((note) => note.start < end && note.end > start)
        .map((note) => note.noteNumber),
    )
  })
}

function guessPresetId(name, role) {
  const upperName = name.toUpperCase()

  if (role === 'bass') {
    if (/REESE|DRIVE|DIST/i.test(upperName)) {
      return 'reese'
    }

    if (/SUB|LOW/i.test(upperName)) {
      return 'submarine'
    }

    return 'tunnel'
  }

  if (/PAD/i.test(upperName)) {
    return 'mist'
  }

  if (/CHIME|BELL/i.test(upperName)) {
    return 'chime'
  }

  if (/KEY|PIANO|ORGAN/i.test(upperName)) {
    return 'organ'
  }

  if (/PLUCK|ARP/i.test(upperName)) {
    return 'glass'
  }

  return 'warehouse'
}

function buildRowsFromTrack(track, role, options) {
  const stepPitches = collectStepPitches(track.notes, options.barStart, options.barTicks)
  const maxVoices = role === 'bass' ? options.maxBassVoices : options.maxMelodyVoices
  const voicesUsed = Math.min(
    maxVoices,
    Math.max(1, ...stepPitches.map((notes) => notes.length)),
  )

  return Array.from({ length: voicesUsed }, (_, voiceIndex) => ({
    presetId: guessPresetId(track.name, role),
    steps: stepPitches.map((notes) => {
      const orderedNotes = options.voiceOrder === 'high' ? notes.slice().reverse() : notes
      const noteNumber = orderedNotes[voiceIndex]
      return noteNumber === undefined
        ? 'rest'
        : options.noteIdForMidiNumber(noteNumber)
    }),
  }))
}

export async function loadMidiLoopSong(url, options) {
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()
  const midi = parseMidi(new Uint8Array(buffer))
  const tracks = extractTracks(midi)
  const melodicTracks = tracks.filter((track) => detectTrackRole(track) !== 'drum')
  const snippetTracks = selectSnippetTracks(melodicTracks, options.snippetMode ?? 'full')
  const barTicks = findBarTicks(midi)
  const barStart = chooseSnippetBarStart(
    snippetTracks,
    barTicks,
    options.snippetBarPick ?? options.snippetIndex ?? 0,
  )
  const bassTracks = []
  const melodyTracks = []

  snippetTracks.forEach((track) => {
    const role = detectTrackRole(track)

    if (role === 'drum') {
      return
    }

    const remainingVoices =
      role === 'bass'
        ? options.maxBassVoices - bassTracks.length
        : options.maxMelodyVoices - melodyTracks.length

    if (remainingVoices <= 0) {
      return
    }

    const rows = buildRowsFromTrack(track, role, {
      ...options,
      barStart,
      barTicks,
      voiceOrder: options.snippetVoiceOrder ?? 'low',
      maxBassVoices: remainingVoices,
      maxMelodyVoices: remainingVoices,
    })

    if (role === 'bass') {
      bassTracks.push(...rows)
      return
    }

    melodyTracks.push(...rows)
  })

  return {
    bpm: findTempoBpm(midi),
    bassTracks,
    melodyTracks,
    drums: {},
  }
}
