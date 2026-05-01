import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GROOVE_DRUM_LOOP_PRESETS,
  loadGrooveDrumLoop,
} from './midiLoops'
import './App.css'

const SAMPLER_SAMPLE_URLS = import.meta.glob('./assets/sampler-snippets/*.wav', {
  eager: true,
  import: 'default',
  query: '?url',
})
const STEP_COUNT = 16
const MIN_PATTERN_LENGTH = 1
const MAX_PATTERN_LENGTH = 64
const MAX_MELODY_VOICES = 4
const MAX_BASS_VOICES = 3
const STEP_INTERVAL_DIVISOR = 4
const MIN_NOTE_NUMBER = 0
const MAX_NOTE_NUMBER = 127
const NOTE_MENU_ROW_COUNT = 5
const NOTE_MENU_COLUMN_COUNT = 6
const NOTE_MENU_PAGE_SIZE = NOTE_MENU_ROW_COUNT * NOTE_MENU_COLUMN_COUNT
const DEFAULT_LANE_VOLUME = 1
const USER_PRESETS_STORAGE_KEY = 'groovebox:user-presets:v1'
const DISTORTION_CURVE_SAMPLES = 4096
const MAX_DISTORTION_CURVE_CACHE_SIZE = 80
const DEFAULT_SOUND_MACROS = {
  tone: 0.58,
  punch: 0.62,
  space: 0.26,
  motion: 0.18,
  width: 0.52,
}
const EFFECT_SCENES = [
  {
    id: 'dry',
    label: 'Dry',
    dirt: 0.78,
    space: 0.18,
    motion: 0.7,
    width: 0.76,
    lows: 1,
    body: 0,
    air: 1.2,
    compressor: 0.9,
  },
  {
    id: 'club',
    label: 'Club',
    dirt: 1.08,
    space: 0.46,
    motion: 0.95,
    width: 0.86,
    lows: 2.6,
    body: 0.9,
    air: 0.8,
    compressor: 1.25,
  },
  {
    id: 'tape',
    label: 'Tape',
    dirt: 1.36,
    space: 0.32,
    motion: 0.82,
    width: 0.68,
    lows: 1.8,
    body: 1.4,
    air: -1.1,
    compressor: 1.05,
  },
  {
    id: 'dub',
    label: 'Dub',
    dirt: 0.96,
    space: 1.28,
    motion: 1.12,
    width: 1,
    lows: 2,
    body: -0.4,
    air: 0.4,
    compressor: 1,
  },
  {
    id: 'wide',
    label: 'Wide',
    dirt: 0.88,
    space: 0.68,
    motion: 1.45,
    width: 1.42,
    lows: 0.8,
    body: -0.3,
    air: 1.8,
    compressor: 0.95,
  },
  {
    id: 'broken',
    label: 'Broken',
    dirt: 1.72,
    space: 0.52,
    motion: 1.58,
    width: 0.92,
    lows: 1,
    body: 1.8,
    air: -0.2,
    compressor: 1.45,
  },
]
const DEFAULT_EFFECT_SCENE_ID = 'club'
const AUDIO_PROFILES = {
  standard: {
    latencyHint: 'interactive',
    distortionOversample: '2x',
    scheduleAheadTime: 0.12,
    lookAheadMs: 25,
  },
  constrained: {
    latencyHint: 'playback',
    distortionOversample: 'none',
    scheduleAheadTime: 0.2,
    lookAheadMs: 40,
  },
}
const NOTE_NAMES = [
  { id: 'c', label: 'C' },
  { id: 'cs', label: 'C#' },
  { id: 'd', label: 'D' },
  { id: 'ds', label: 'D#' },
  { id: 'e', label: 'E' },
  { id: 'f', label: 'F' },
  { id: 'fs', label: 'F#' },
  { id: 'g', label: 'G' },
  { id: 'gs', label: 'G#' },
  { id: 'a', label: 'A' },
  { id: 'as', label: 'A#' },
  { id: 'b', label: 'B' },
]
const NOTE_LETTER_TO_SEMITONE = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
}
const NOTE_PAGE_COUNT = Math.ceil(
  (MAX_NOTE_NUMBER - MIN_NOTE_NUMBER + 1) / NOTE_MENU_PAGE_SIZE,
)

function noteColorForNumber(noteNumber) {
  const hue = (noteNumber * 31) % 360
  return `hsl(${hue} 82% 58%)`
}

const NOTE_GAME_KEYS = [
  { note: 60, label: 'C', key: 'a' },
  { note: 62, label: 'D', key: 's' },
  { note: 64, label: 'E', key: 'd' },
  { note: 65, label: 'F', key: 'f' },
  { note: 67, label: 'G', key: 'j' },
  { note: 69, label: 'A', key: 'k' },
  { note: 71, label: 'B', key: 'l' },
  { note: 72, label: 'C', key: ';' },
]
const NOTE_GAME_SNIPPETS = [
  {
    id: 'joy',
    title: 'Ode to Joy',
    composer: 'Beethoven',
    missingIndices: [7, 14, 23],
    notes: [
      64, 64, 65, 67, 67, 65, 64, 62,
      60, 60, 62, 64, 64, 62, 62, 64,
      64, 65, 67, 67, 65, 64, 62, 60,
      60, 62, 64, 62, 60, 60,
    ],
    harmony: [
      [48, 55], [48, 55], [48, 57], [48, 55],
      [47, 55], [47, 55], [48, 55], [43, 50],
      [48, 55], [48, 55], [43, 55], [48, 55],
      [47, 55], [43, 55], [47, 55], [48, 55],
      [48, 55], [48, 55], [48, 57], [48, 55],
      [47, 55], [47, 55], [48, 55], [43, 50],
      [48, 55], [43, 55], [48, 55], [43, 55],
      [48, 55], [48, 55],
    ],
  },
  {
    id: 'night',
    title: 'Eine kleine Nachtmusik',
    composer: 'Mozart',
    missingIndices: [6, 13, 21],
    notes: [
      67, 62, 67, 62, 67, 71, 72, 71,
      69, 67, 65, 64, 65, 67, 69, 67,
      65, 64, 62, 64, 65, 67, 62, 67,
    ],
    harmony: [
      [43, 55], [43, 55], [43, 55], [43, 55],
      [47, 55], [47, 55], [48, 55], [47, 55],
      [45, 52], [43, 55], [41, 53], [40, 52],
      [41, 53], [43, 55], [45, 52], [43, 55],
      [41, 53], [40, 52], [38, 50], [40, 52],
      [41, 53], [43, 55], [43, 55], [43, 55],
    ],
  },
  {
    id: 'swan',
    title: 'Swan Lake',
    composer: 'Tchaikovsky',
    missingIndices: [5, 12, 19],
    notes: [
      69, 71, 72, 71, 69, 67, 65, 67,
      69, 65, 67, 69, 71, 72, 71, 69,
      67, 65, 67, 69, 65, 64, 65,
    ],
    harmony: [
      [45, 52], [45, 52], [45, 52], [45, 52],
      [43, 50], [43, 50], [41, 48], [43, 50],
      [45, 52], [41, 48], [43, 50], [45, 52],
      [47, 52], [48, 55], [47, 52], [45, 52],
      [43, 50], [41, 48], [43, 50], [45, 52],
      [41, 48], [40, 47], [41, 48],
    ],
  },
]
const NOTE_GAME_STEP_MS = 760
const NOTE_GAME_GATE_X = 72
const NOTE_GAME_NOTE_SPACING = 17
const NOTE_GAME_HARMONY_MIN = 38
const NOTE_GAME_HARMONY_MAX = 57

function noteGameLabel(noteNumber) {
  const note = NOTE_NAMES[noteNumber % 12]
  const octave = Math.floor(noteNumber / 12) - 1

  return `${note.label}${octave}`
}

function noteGameLanePercent(noteNumber) {
  const min = NOTE_GAME_KEYS[0].note
  const max = NOTE_GAME_KEYS[NOTE_GAME_KEYS.length - 1].note

  return 88 - ((noteNumber - min) / (max - min)) * 76
}

function noteGameHarmonyLanePercent(noteNumber) {
  return 86 - ((noteNumber - NOTE_GAME_HARMONY_MIN) / (NOTE_GAME_HARMONY_MAX - NOTE_GAME_HARMONY_MIN)) * 30
}

function noteGameFrequency(noteNumber) {
  return 440 * 2 ** ((noteNumber - 69) / 12)
}

const PAD_OPTIONS = NOTE_NAMES.map((note, index) => ({
  id: note.id,
  label: note.label,
  semitone: index,
  color: noteColorForNumber(60 + index),
}))
const NOTE_MENU_CATEGORIES = Array.from({ length: NOTE_PAGE_COUNT }, (_, index) => {
  const min = MIN_NOTE_NUMBER + index * NOTE_MENU_PAGE_SIZE
  const max = Math.min(MAX_NOTE_NUMBER, min + NOTE_MENU_PAGE_SIZE - 1)
  const minOctave = Math.floor(min / 12) - 1
  const maxOctave = Math.floor(max / 12) - 1

  return {
    id: `notes-${index}`,
    label: `${NOTE_NAMES[min % 12].label}${minOctave}-${NOTE_NAMES[max % 12].label}${maxOctave}`,
    min,
    max,
  }
})
const NOTE_SHORTCUT_ROWS = [
  { id: 'plain', label: 'No mod', keyLabel: '1-6', modifierKey: null },
  { id: 'option', label: 'Option', keyLabel: 'Option 1-6', modifierKey: 'altKey' },
  { id: 'ctrl', label: 'Ctrl', keyLabel: 'Ctrl 1-6', modifierKey: 'ctrlKey' },
  { id: 'shift', label: 'Shift', keyLabel: 'Shift 1-6', modifierKey: 'shiftKey' },
  { id: 'tap', label: 'Tap', keyLabel: 'Click / Tap', modifierKey: null },
]
const SCALE_OPTIONS = [
  {
    id: 'major-pentatonic',
    label: 'Major Penta',
    intervals: [0, 2, 4, 7, 9],
  },
  {
    id: 'minor-pentatonic',
    label: 'Minor Penta',
    intervals: [0, 3, 5, 7, 10],
  },
  {
    id: 'major',
    label: 'Major',
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  {
    id: 'minor',
    label: 'Minor',
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  {
    id: 'blues',
    label: 'Blues',
    intervals: [0, 3, 5, 6, 7, 10],
  },
  {
    id: 'chromatic',
    label: 'All Notes',
    intervals: null,
  },
]
const CHORD_OPTIONS = [
  { id: 'one', label: 'I', degree: 0 },
  { id: 'two', label: 'ii', degree: 1 },
  { id: 'three', label: 'iii', degree: 2 },
  { id: 'four', label: 'IV', degree: 3 },
  { id: 'five', label: 'V', degree: 4 },
  { id: 'six', label: 'vi', degree: 5 },
]
const CHORD_PROGRESSIONS = [
  ['one', 'five', 'six', 'four'],
  ['six', 'four', 'one', 'five'],
  ['one', 'four', 'five', 'four'],
  ['two', 'five', 'one', 'six'],
]
const PAD_APP_KEYS = [
  'q',
  'w',
  'e',
  'r',
  'a',
  's',
  'd',
  'f',
  'z',
  'x',
  'c',
  'v',
]
const PAD_APP_ROOTS = NOTE_NAMES.map((note, index) => ({
  ...note,
  semitone: index,
}))
const PAD_APP_SCALES = [
  { id: 'major', label: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11], qualities: ['', 'm', 'm', '', '', 'm', 'dim'] },
  { id: 'minor', label: 'Minor', intervals: [0, 2, 3, 5, 7, 8, 10], qualities: ['m', 'dim', '', 'm', 'm', '', ''] },
  { id: 'dorian', label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], qualities: ['m', 'm', '', '', 'm', 'dim', ''] },
  { id: 'lydian', label: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11], qualities: ['', '', 'm', 'dim', '', 'm', 'm'] },
]
const PAD_APP_CHORDS = [
  { degree: 0, roman: 'I', name: 'Home' },
  { degree: 1, roman: 'ii', name: 'Lift' },
  { degree: 2, roman: 'iii', name: 'Color' },
  { degree: 3, roman: 'IV', name: 'Open' },
  { degree: 4, roman: 'V', name: 'Push' },
  { degree: 5, roman: 'vi', name: 'Soft' },
  { degree: 0, roman: 'I7', name: 'Bright', variant: 'seventh' },
  { degree: 4, roman: 'Vsus', name: 'Float', variant: 'sus' },
  { degree: 5, roman: 'vi7', name: 'Deep', variant: 'seventh' },
  { degree: 3, roman: 'IVadd9', name: 'Glow', variant: 'add9' },
  { degree: 1, roman: 'ii7', name: 'Jazz', variant: 'seventh' },
  { degree: 4, roman: 'V7', name: 'Turn', variant: 'dominant' },
]
const PAD_APP_COLORS = [
  '#ff4d6d',
  '#fb8500',
  '#ffbe0b',
  '#2ec4b6',
  '#3a86ff',
  '#8338ec',
  '#06d6a0',
  '#ef476f',
  '#118ab2',
  '#f15bb5',
  '#00bbf9',
  '#8ac926',
]
const PAD_APP_NOTE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19]
const PAD_APP_VARIATIONS = [
  { id: 'low-open', label: 'Open', detail: '-8va spread' },
  { id: 'sus2', label: 'Sus2', detail: 'Soft tension' },
  { id: 'add9', label: 'Add9', detail: 'Glow' },
  { id: 'minor-color', label: 'Minor', detail: 'Darker' },
  { id: 'plain', label: 'Core', detail: 'Natural' },
  { id: 'major7', label: 'Maj7', detail: 'Dreamy' },
  { id: 'tight', label: 'Tight', detail: 'Close voicing' },
  { id: 'sus4', label: 'Sus4', detail: 'Lift' },
  { id: 'octave', label: 'Oct', detail: '+8va' },
]
const PAD_APP_PERFORMANCE_MODES = [
  { id: 'hit', label: 'Hit' },
  { id: 'strum', label: 'Strum' },
  { id: 'arp', label: 'Arp' },
  { id: 'repeat', label: 'Repeat' },
]
const PAD_APP_MENUS = [
  { id: 'key', label: 'Key' },
  { id: 'sound', label: 'Sound' },
  { id: 'play', label: 'Play' },
  { id: 'loop', label: 'Loop' },
]
const PAD_APP_ARP_DIRECTIONS = [
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
  { id: 'bounce', label: 'Bounce' },
  { id: 'random', label: 'Random' },
]
const PAD_APP_INSTRUMENTS = [
  {
    id: 'glass',
    label: 'Glass Pad',
    oscillator: 'triangle',
    sheen: 'sine',
    attack: 0.018,
    chordGain: 0.1,
    noteGain: 0.2,
    filterPeak: 1.1,
    detune: 4,
  },
  {
    id: 'analog',
    label: 'Analog Saw',
    oscillator: 'sawtooth',
    sheen: 'triangle',
    attack: 0.012,
    chordGain: 0.085,
    noteGain: 0.18,
    filterPeak: 0.82,
    detune: 9,
  },
  {
    id: 'organ',
    label: 'Soft Organ',
    oscillator: 'square',
    sheen: 'sine',
    attack: 0.008,
    chordGain: 0.075,
    noteGain: 0.15,
    filterPeak: 0.74,
    detune: 0,
  },
  {
    id: 'pluck',
    label: 'Pluck',
    oscillator: 'triangle',
    sheen: 'square',
    attack: 0.006,
    chordGain: 0.13,
    noteGain: 0.24,
    filterPeak: 1.35,
    detune: 2,
    percussive: true,
  },
]

function TilePicker({ label, options, value, onChange, getDetail }) {
  return (
    <div className="pad-control">
      <span>{label}</span>
      <div className="tile-picker">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? 'active' : ''}
            onClick={() => onChange(option.id)}
          >
            <strong>{option.label}</strong>
            {getDetail ? <small>{getDetail(option)}</small> : null}
          </button>
        ))}
      </div>
    </div>
  )
}
const PAD_APP_PROGRESSIONS = [
  { id: 'pop', label: 'I-V-vi-IV', padIds: ['pad-0', 'pad-4', 'pad-5', 'pad-3'] },
  { id: 'sad', label: 'vi-IV-I-V', padIds: ['pad-5', 'pad-3', 'pad-0', 'pad-4'] },
  { id: 'lift', label: 'I-IV-V-IV', padIds: ['pad-0', 'pad-3', 'pad-4', 'pad-3'] },
]
const SAMPLER_STEP_COUNT = 8
const SAMPLER_LANES = [
  { id: 'high', label: 'High', pitch: 1.34, color: '#ff4d6d' },
  { id: 'middle', label: 'Normal', pitch: 1, color: '#2ec4b6' },
  { id: 'low', label: 'Low', pitch: 0.74, color: '#3a86ff' },
]
const SAMPLER_COLORS = [
  '#ff4d6d',
  '#ffbe0b',
  '#2ec4b6',
  '#3a86ff',
  '#8338ec',
  '#fb8500',
  '#06d6a0',
  '#f15bb5',
]

function createSamplerSamples() {
  return Object.entries(SAMPLER_SAMPLE_URLS)
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath, undefined, { numeric: true }))
    .map(([path, url], index) => {
      const fileName = path.split('/').pop()?.replace(/\.wav$/i, '') ?? `Sample ${index + 1}`
      const match = fileName.match(/^(\d+)_([a-z0-9-]+)_(\d+)_bpm_(\d+)$/i)
      const number = match
        ? `${match[1]}-${match[4]}`
        : String(index + 1).padStart(2, '0')
      const bpm = match ? Number(match[3]) : 160

      return {
        id: `sample-${number}`,
        sampleId: `sample-${number}`,
        label: number,
        name: match ? match[2].replace(/-/g, ' ').toLowerCase() : 'sample',
        bpm,
        url,
        color: SAMPLER_COLORS[index % SAMPLER_COLORS.length],
        chunk: { start: 0, length: 1 },
      }
    })
}

function createEmptySamplerGrid() {
  return SAMPLER_LANES.map(() => Array.from({ length: SAMPLER_STEP_COUNT }, () => null))
}
const PAD_APP_DRUM_VOICES = [
  { id: 'kick', label: 'Kick' },
  { id: 'snare', label: 'Snare' },
  { id: 'clap', label: 'Clap' },
  { id: 'hat', label: 'Hat' },
  { id: 'openHat', label: 'Open' },
  { id: 'shaker', label: 'Shake' },
  { id: 'rim', label: 'Rim' },
  { id: 'tom', label: 'Tom' },
  { id: 'crash', label: 'Crash' },
]
// Human-style presets informed by Google Magenta's CC BY 4.0 Groove MIDI Dataset.
const PAD_APP_BEATS = [
  {
    id: 'house',
    label: 'House',
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    clap: [4, 12],
    hat: [2, 6, 10, 14],
    openHat: [6, 14],
  },
  {
    id: 'break',
    label: 'Break',
    kick: [0, 3, 8, 11],
    snare: [4, 10, 12],
    hat: [2, 5, 7, 9, 13, 15],
    openHat: [15],
    crash: [0],
  },
  {
    id: 'trap',
    label: 'Trap',
    kick: [0, 6, 9, 14],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 7, 8, 10, 12, 14, 15],
    clap: [4, 12],
    rim: [3, 11],
  },
  {
    id: 'gmd-funk',
    label: 'GMD Funk',
    kick: [0, 3, 7, 10, 14],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    openHat: [7, 15],
    rim: [11],
    shaker: [1, 3, 5, 7, 9, 11, 13, 15],
  },
  {
    id: 'gmd-hiphop',
    label: 'GMD HipHop',
    kick: [0, 6, 10],
    snare: [4, 12],
    hat: [0, 2, 5, 7, 8, 10, 13, 15],
    clap: [12],
    rim: [3],
  },
  {
    id: 'gmd-pop',
    label: 'GMD Pop',
    kick: [0, 5, 8, 11],
    snare: [4, 12],
    clap: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    openHat: [14],
    crash: [0],
  },
  {
    id: 'gmd-reggae',
    label: 'GMD Reggae',
    kick: [2, 10],
    snare: [4, 12],
    rim: [4, 12],
    hat: [1, 3, 5, 7, 9, 11, 13, 15],
    openHat: [6, 14],
  },
  {
    id: 'gmd-rock',
    label: 'GMD Rock',
    kick: [0, 6, 8, 14],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    tom: [13, 15],
    crash: [0],
  },
]

function padAppFilterFrequency(amount) {
  return 260 + amount ** 2 * 7800
}

function midiNumberToFrequency(noteNumber) {
  return Number((440 * 2 ** ((noteNumber - 69) / 12)).toFixed(2))
}

function midiNumberToNoteId(noteNumber) {
  const octave = Math.floor(noteNumber / 12) - 1
  const note = NOTE_NAMES[noteNumber % 12]
  return `${note.id}${octave}`
}

function createNoteOptions() {
  return [
    { id: 'rest', label: 'Rest', frequency: null, color: '#1f2937' },
    ...Array.from({ length: MAX_NOTE_NUMBER - MIN_NOTE_NUMBER + 1 }, (_, offset) => {
      const noteNumber = MIN_NOTE_NUMBER + offset
      const octave = Math.floor(noteNumber / 12) - 1
      const note = NOTE_NAMES[noteNumber % 12]

      return {
        id: midiNumberToNoteId(noteNumber),
        label: `${note.label}${octave}`,
        frequency: midiNumberToFrequency(noteNumber),
        color: noteColorForNumber(noteNumber),
      }
    }),
  ]
}

const NOTE_OPTIONS = createNoteOptions()
const NOTE_ID_TO_MIDI_NUMBER = new Map(
  Array.from({ length: MAX_NOTE_NUMBER - MIN_NOTE_NUMBER + 1 }, (_, offset) => {
    const noteNumber = MIN_NOTE_NUMBER + offset
    return [midiNumberToNoteId(noteNumber), noteNumber]
  }),
)

const PRESET_DEFAULTS = {
  color: '#4cc9f0',
  waveform: 'triangle',
  detune: 4,
  detuneLevel: 0.08,
  subLevel: 0.08,
  subWaveform: 'sine',
  harmonicLevel: 0.08,
  harmonicWaveform: 'triangle',
  harmonicRatio: 2,
  harmonicDetune: 0,
  attack: 0.004,
  decay: 0.24,
  cutoff: 1200,
  envAmount: 800,
  resonance: 3,
  filterType: 'lowpass',
  filterFloorRatio: 0.86,
  gain: 0.2,
  sustainLevel: 0.22,
  noiseLevel: 0,
  noiseFilterType: 'highpass',
  noiseCutoff: 2400,
  driveAmount: 8,
  vibratoRate: 0,
  vibratoDepth: 0,
  delayLevel: 0,
  delayTime: 0.18,
  delayFeedback: 0.2,
  pan: 0,
}

const SYNTH_PRESETS = [
  {
    id: 'synthtalk',
    label: 'Synth Talk Bass',
    color: '#dc2626',
    role: 'bass',
    waveform: 'sawtooth',
    detune: 5,
    detuneLevel: 0.1,
    subLevel: 0.32,
    subWaveform: 'sawtooth',
    harmonicLevel: 0.14,
    harmonicWaveform: 'sawtooth',
    harmonicRatio: 2,
    harmonicDetune: -4,
    attack: 0.004,
    decay: 0.18,
    cutoff: 420,
    envAmount: 2300,
    resonance: 7,
    filterType: 'lowpass',
    filterFloorRatio: 0.62,
    gain: 0.22,
    sustainLevel: 0.14,
    driveAmount: 24,
    vibratoRate: 0.45,
    vibratoDepth: 1.4,
    delayLevel: 0.025,
    delayTime: 0.13,
    delayFeedback: 0.1,
  },
  {
    id: 'acid',
    label: 'Warm Mono Bass',
    color: '#c2410c',
    role: 'bass',
    waveform: 'triangle',
    detune: 3,
    detuneLevel: 0.1,
    subLevel: 0.26,
    subWaveform: 'sine',
    harmonicLevel: 0.1,
    harmonicWaveform: 'sawtooth',
    attack: 0.006,
    decay: 0.24,
    cutoff: 760,
    envAmount: 1200,
    resonance: 5,
    filterType: 'lowpass',
    filterFloorRatio: 0.76,
    gain: 0.24,
    sustainLevel: 0.22,
    driveAmount: 18,
    delayLevel: 0.02,
    delayTime: 0.14,
    delayFeedback: 0.12,
  },
  {
    id: 'warehouse',
    label: 'Velvet Stab',
    color: '#ca8a04',
    role: 'melody',
    waveform: 'sawtooth',
    detune: 8,
    detuneLevel: 0.12,
    subLevel: 0.04,
    harmonicLevel: 0.1,
    harmonicWaveform: 'triangle',
    attack: 0.012,
    decay: 0.28,
    cutoff: 1280,
    envAmount: 880,
    resonance: 3,
    filterType: 'lowpass',
    filterFloorRatio: 0.86,
    gain: 0.17,
    sustainLevel: 0.24,
    driveAmount: 8,
    delayLevel: 0.14,
    delayTime: 0.24,
    delayFeedback: 0.24,
    pan: -0.08,
  },
  {
    id: 'tunnel',
    label: 'Round Bass',
    color: '#0f766e',
    role: 'bass',
    waveform: 'triangle',
    detune: 2,
    detuneLevel: 0.08,
    subLevel: 0.34,
    subWaveform: 'sine',
    harmonicLevel: 0.06,
    harmonicWaveform: 'sine',
    attack: 0.006,
    decay: 0.28,
    cutoff: 540,
    envAmount: 720,
    resonance: 3,
    filterType: 'lowpass',
    filterFloorRatio: 0.72,
    gain: 0.27,
    sustainLevel: 0.3,
    driveAmount: 12,
  },
  {
    id: 'strobe',
    label: 'Silk Lead',
    color: '#7c3aed',
    role: 'melody',
    waveform: 'triangle',
    detune: 6,
    detuneLevel: 0.08,
    subLevel: 0.03,
    harmonicLevel: 0.16,
    harmonicWaveform: 'sine',
    harmonicRatio: 2,
    attack: 0.006,
    decay: 0.23,
    cutoff: 2100,
    envAmount: 900,
    resonance: 4,
    filterType: 'lowpass',
    filterFloorRatio: 0.88,
    gain: 0.18,
    sustainLevel: 0.2,
    driveAmount: 6,
    vibratoRate: 4.8,
    vibratoDepth: 4,
    delayLevel: 0.18,
    delayTime: 0.2,
    delayFeedback: 0.24,
    pan: 0.1,
  },
  {
    id: 'submarine',
    label: 'Clean Sub',
    color: '#0284c7',
    role: 'bass',
    waveform: 'sine',
    detune: 1,
    detuneLevel: 0.04,
    subLevel: 0.42,
    subWaveform: 'triangle',
    harmonicLevel: 0.06,
    harmonicWaveform: 'triangle',
    harmonicRatio: 2,
    attack: 0.008,
    decay: 0.36,
    cutoff: 360,
    envAmount: 280,
    resonance: 2,
    filterType: 'lowpass',
    filterFloorRatio: 0.68,
    gain: 0.3,
    sustainLevel: 0.42,
    driveAmount: 8,
  },
  {
    id: 'rubber',
    label: 'Muted Bass',
    color: '#ea580c',
    role: 'bass',
    waveform: 'triangle',
    detune: 5,
    detuneLevel: 0.1,
    subLevel: 0.28,
    harmonicLevel: 0.08,
    harmonicWaveform: 'square',
    attack: 0.004,
    decay: 0.2,
    cutoff: 640,
    envAmount: 1100,
    resonance: 5,
    filterType: 'lowpass',
    filterFloorRatio: 0.74,
    gain: 0.23,
    sustainLevel: 0.16,
    driveAmount: 16,
  },
  {
    id: 'reese',
    label: 'Wide Bass',
    color: '#0d9488',
    role: 'bass',
    waveform: 'sawtooth',
    detune: 14,
    detuneLevel: 0.18,
    subLevel: 0.26,
    harmonicLevel: 0.05,
    harmonicWaveform: 'triangle',
    attack: 0.008,
    decay: 0.34,
    cutoff: 900,
    envAmount: 650,
    resonance: 3,
    filterType: 'lowpass',
    filterFloorRatio: 0.84,
    gain: 0.19,
    sustainLevel: 0.26,
    noiseLevel: 0.008,
    noiseCutoff: 1400,
    driveAmount: 16,
    vibratoRate: 0.35,
    vibratoDepth: 2,
  },
  {
    id: 'pulse',
    label: 'Soft Pulse Bass',
    color: '#6d28d9',
    role: 'bass',
    waveform: 'square',
    detune: 6,
    detuneLevel: 0.08,
    subLevel: 0.2,
    harmonicLevel: 0.12,
    harmonicWaveform: 'square',
    harmonicRatio: 2,
    attack: 0.004,
    decay: 0.2,
    cutoff: 780,
    envAmount: 900,
    resonance: 4,
    filterType: 'lowpass',
    filterFloorRatio: 0.8,
    gain: 0.21,
    sustainLevel: 0.18,
    driveAmount: 12,
    delayLevel: 0.03,
    delayTime: 0.16,
    delayFeedback: 0.12,
  },
  {
    id: 'glass',
    label: 'Pearl Pluck',
    color: '#0891b2',
    role: 'melody',
    waveform: 'triangle',
    detune: 4,
    detuneLevel: 0.06,
    subLevel: 0.03,
    harmonicLevel: 0.18,
    harmonicWaveform: 'sine',
    harmonicRatio: 2,
    attack: 0.004,
    decay: 0.2,
    cutoff: 2500,
    envAmount: 1200,
    resonance: 4,
    filterType: 'bandpass',
    filterFloorRatio: 0.92,
    gain: 0.17,
    sustainLevel: 0.12,
    driveAmount: 4,
    delayLevel: 0.18,
    delayTime: 0.26,
    delayFeedback: 0.28,
    pan: 0.12,
  },
  {
    id: 'neon',
    label: 'Warm Keys',
    color: '#b91c1c',
    role: 'melody',
    waveform: 'triangle',
    detune: 5,
    detuneLevel: 0.08,
    subLevel: 0.05,
    harmonicLevel: 0.14,
    harmonicWaveform: 'sine',
    attack: 0.012,
    decay: 0.32,
    cutoff: 1600,
    envAmount: 700,
    resonance: 3,
    filterType: 'lowpass',
    filterFloorRatio: 0.9,
    gain: 0.18,
    sustainLevel: 0.28,
    noiseLevel: 0.006,
    noiseCutoff: 2400,
    driveAmount: 4,
    delayLevel: 0.12,
    delayTime: 0.24,
    delayFeedback: 0.2,
  },
  {
    id: 'organ',
    label: 'Drawbar Keys',
    color: '#16a34a',
    role: 'melody',
    waveform: 'sine',
    detune: 2,
    detuneLevel: 0.04,
    subLevel: 0.1,
    subWaveform: 'triangle',
    harmonicLevel: 0.18,
    harmonicWaveform: 'square',
    harmonicRatio: 2,
    attack: 0.018,
    decay: 0.45,
    cutoff: 2000,
    envAmount: 350,
    resonance: 2,
    filterType: 'lowpass',
    filterFloorRatio: 0.92,
    gain: 0.17,
    sustainLevel: 0.62,
    driveAmount: 4,
    vibratoRate: 3.2,
    vibratoDepth: 2,
    delayLevel: 0.08,
    delayTime: 0.28,
    delayFeedback: 0.16,
  },
  {
    id: 'mist',
    label: 'Warm Pad',
    color: '#4f46e5',
    role: 'melody',
    waveform: 'sawtooth',
    detune: 12,
    detuneLevel: 0.16,
    subLevel: 0.06,
    harmonicLevel: 0.1,
    harmonicWaveform: 'triangle',
    attack: 0.08,
    decay: 0.72,
    cutoff: 840,
    envAmount: 360,
    resonance: 2,
    filterType: 'lowpass',
    filterFloorRatio: 0.96,
    gain: 0.14,
    sustainLevel: 0.7,
    noiseLevel: 0.006,
    noiseCutoff: 1700,
    driveAmount: 4,
    vibratoRate: 0.35,
    vibratoDepth: 4,
    delayLevel: 0.26,
    delayTime: 0.34,
    delayFeedback: 0.36,
    pan: -0.12,
  },
  {
    id: 'bell',
    label: 'Soft Bell',
    color: '#be123c',
    role: 'melody',
    waveform: 'sine',
    detune: 1,
    detuneLevel: 0.02,
    subLevel: 0,
    harmonicLevel: 0.22,
    harmonicWaveform: 'sine',
    harmonicRatio: 2.01,
    attack: 0.003,
    decay: 0.36,
    cutoff: 2400,
    envAmount: 1000,
    resonance: 5,
    filterType: 'bandpass',
    filterFloorRatio: 0.92,
    gain: 0.16,
    sustainLevel: 0.12,
    driveAmount: 2,
    delayLevel: 0.26,
    delayTime: 0.29,
    delayFeedback: 0.3,
    pan: 0.14,
  },
  {
    id: 'drift',
    label: 'Clean Lead',
    color: '#9333ea',
    role: 'melody',
    waveform: 'sawtooth',
    detune: 7,
    detuneLevel: 0.09,
    subLevel: 0.04,
    harmonicLevel: 0.12,
    harmonicWaveform: 'triangle',
    attack: 0.006,
    decay: 0.22,
    cutoff: 1900,
    envAmount: 1000,
    resonance: 5,
    filterType: 'lowpass',
    filterFloorRatio: 0.88,
    gain: 0.18,
    sustainLevel: 0.2,
    driveAmount: 10,
    vibratoRate: 5,
    vibratoDepth: 5,
    delayLevel: 0.16,
    delayTime: 0.21,
    delayFeedback: 0.24,
  },
  {
    id: 'chime',
    label: 'Air Chime',
    color: '#0e7490',
    role: 'melody',
    waveform: 'triangle',
    detune: 5,
    detuneLevel: 0.06,
    subLevel: 0.02,
    harmonicLevel: 0.18,
    harmonicWaveform: 'sine',
    harmonicRatio: 3,
    attack: 0.004,
    decay: 0.34,
    cutoff: 2700,
    envAmount: 900,
    resonance: 4,
    filterType: 'bandpass',
    filterFloorRatio: 0.94,
    gain: 0.15,
    sustainLevel: 0.14,
    driveAmount: 2,
    delayLevel: 0.24,
    delayTime: 0.27,
    delayFeedback: 0.3,
  },
  {
    id: 'boom808',
    label: 'Deep Mono Bass',
    color: '#059669',
    role: 'bass',
    waveform: 'sine',
    detune: 1,
    detuneLevel: 0.02,
    subLevel: 0.36,
    subWaveform: 'sine',
    harmonicLevel: 0.08,
    harmonicWaveform: 'triangle',
    harmonicRatio: 2,
    attack: 0.004,
    decay: 0.4,
    cutoff: 450,
    envAmount: 240,
    resonance: 1.5,
    filterType: 'lowpass',
    filterFloorRatio: 0.7,
    gain: 0.28,
    sustainLevel: 0.4,
    driveAmount: 10,
  },
  {
    id: 'wobble',
    label: 'Slow Motion Bass',
    color: '#65a30d',
    role: 'bass',
    waveform: 'triangle',
    detune: 8,
    detuneLevel: 0.1,
    subLevel: 0.3,
    harmonicLevel: 0.08,
    harmonicWaveform: 'square',
    attack: 0.004,
    decay: 0.3,
    cutoff: 720,
    envAmount: 850,
    resonance: 5,
    filterType: 'lowpass',
    filterFloorRatio: 0.8,
    gain: 0.21,
    sustainLevel: 0.28,
    driveAmount: 18,
    vibratoRate: 1.2,
    vibratoDepth: 4,
  },
  {
    id: 'toy',
    label: 'Felt Keys',
    color: '#d97706',
    role: 'melody',
    waveform: 'triangle',
    detune: 3,
    detuneLevel: 0.05,
    subLevel: 0.03,
    harmonicLevel: 0.18,
    harmonicWaveform: 'sine',
    harmonicRatio: 2.01,
    attack: 0.012,
    decay: 0.28,
    cutoff: 2100,
    envAmount: 750,
    resonance: 3,
    filterType: 'lowpass',
    filterFloorRatio: 0.9,
    gain: 0.18,
    sustainLevel: 0.22,
    driveAmount: 2,
    delayLevel: 0.14,
    delayTime: 0.24,
    delayFeedback: 0.24,
  },
  {
    id: 'chip',
    label: 'Clean Square',
    color: '#22c55e',
    role: 'melody',
    waveform: 'square',
    detune: 0,
    detuneLevel: 0,
    subLevel: 0.02,
    harmonicLevel: 0.08,
    harmonicWaveform: 'square',
    harmonicRatio: 2,
    attack: 0.002,
    decay: 0.14,
    cutoff: 2300,
    envAmount: 700,
    resonance: 2,
    filterType: 'lowpass',
    filterFloorRatio: 0.88,
    gain: 0.16,
    sustainLevel: 0.1,
    driveAmount: 1,
    delayLevel: 0.05,
    delayTime: 0.16,
    delayFeedback: 0.12,
  },
  {
    id: 'supersaw',
    label: 'Satin Lead',
    color: '#db2777',
    role: 'melody',
    waveform: 'sawtooth',
    detune: 14,
    detuneLevel: 0.16,
    subLevel: 0.04,
    harmonicLevel: 0.1,
    harmonicWaveform: 'sawtooth',
    harmonicDetune: -8,
    attack: 0.008,
    decay: 0.3,
    cutoff: 1800,
    envAmount: 900,
    resonance: 4,
    filterType: 'lowpass',
    filterFloorRatio: 0.88,
    gain: 0.17,
    sustainLevel: 0.28,
    driveAmount: 8,
    vibratoRate: 4,
    vibratoDepth: 3,
    delayLevel: 0.2,
    delayTime: 0.22,
    delayFeedback: 0.28,
  },
  {
    id: 'cloud',
    label: 'Wide Pad',
    color: '#2563eb',
    role: 'melody',
    waveform: 'sawtooth',
    detune: 16,
    detuneLevel: 0.18,
    subLevel: 0.06,
    harmonicLevel: 0.12,
    harmonicWaveform: 'triangle',
    attack: 0.1,
    decay: 0.8,
    cutoff: 920,
    envAmount: 320,
    resonance: 2,
    filterType: 'lowpass',
    filterFloorRatio: 0.97,
    gain: 0.13,
    sustainLevel: 0.76,
    noiseLevel: 0.006,
    noiseCutoff: 1400,
    driveAmount: 4,
    vibratoRate: 0.3,
    vibratoDepth: 4,
    delayLevel: 0.32,
    delayTime: 0.36,
    delayFeedback: 0.42,
    pan: -0.08,
  },
]

const DRUM_TRACKS = [
  { id: 'kick', label: 'Kick', color: '#ff5d73' },
  { id: 'clap', label: 'Clap', color: '#ffb703' },
  { id: 'hat', label: 'Hat', color: '#4cc9f0' },
  { id: 'openHat', label: 'Open Hat', color: '#06b6d4' },
  { id: 'shaker', label: 'Shaker', color: '#10b981' },
  { id: 'rim', label: 'Rim', color: '#7209b7' },
  { id: 'tom', label: 'Tom', color: '#f97316' },
  { id: 'crash', label: 'Crash', color: '#e11d48' },
]

const createEmptySteps = (stepCount = STEP_COUNT) =>
  Array.from({ length: stepCount }, () => 'rest')

const EMPTY_STEPS = createEmptySteps()

const createEmptyDrumSteps = (stepCount = STEP_COUNT) =>
  Array.from({ length: stepCount }, () => false)

const createEmptyChordSteps = (stepCount = STEP_COUNT) =>
  Array.from({ length: stepCount }, () => 'rest')

function createDrumState(overrides = {}, stepCount = STEP_COUNT) {
  return Object.fromEntries(
    DRUM_TRACKS.map((track) => [
      track.id,
      [...(overrides[track.id] ?? createEmptyDrumSteps(stepCount))],
    ]),
  )
}

function createDrumMixerState(overrides = {}) {
  return Object.fromEntries(
    DRUM_TRACKS.map((track) => [
      track.id,
      {
        muted: overrides[track.id]?.muted ?? false,
        volume: overrides[track.id]?.volume ?? DEFAULT_LANE_VOLUME,
      },
    ]),
  )
}

const INITIAL_DRUMS = createDrumState({
  kick: [
    true,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
  ],
  clap: [
    false,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
  ],
  hat: [
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    true,
    true,
  ],
  openHat: [
    false,
    false,
    false,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    true,
    false,
  ],
  shaker: [
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
  ],
  rim: [
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    true,
  ],
  tom: [
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    true,
    false,
  ],
  crash: [
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ],
})

const INITIAL_CHORD_STEPS = [
  'one',
  'rest',
  'rest',
  'rest',
  'four',
  'rest',
  'rest',
  'rest',
  'five',
  'rest',
  'rest',
  'rest',
  'four',
  'rest',
  'rest',
  'rest',
]

function createTrack(kind, labelNumber, presetId, steps) {
  return {
    id: `${kind}-${labelNumber}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    label: `${kind === 'bass' ? 'Bass' : 'Melody'} ${labelNumber}`,
    presetId,
    steps: [...steps],
    muted: false,
    volume: DEFAULT_LANE_VOLUME,
  }
}

const INITIAL_BASS_TRACKS = [
  createTrack('bass', 1, 'synthtalk', [
    'c2',
    'rest',
    'c2',
    'rest',
    'c2',
    'rest',
    'ds2',
    'rest',
    'c2',
    'rest',
    'g2',
    'rest',
    'ds2',
    'rest',
    'c2',
    'rest',
  ]),
]

const INITIAL_MELODY_TRACKS = [
  createTrack('melody', 1, 'toy', [
    'rest',
    'rest',
    'c4',
    'rest',
    'rest',
    'as3',
    'rest',
    'rest',
    'rest',
    'g3',
    'rest',
    'rest',
    'rest',
    'c4',
    'rest',
    'rest',
  ]),
  createTrack('melody', 2, 'supersaw', [
    'rest',
    'rest',
    'g4',
    'rest',
    'rest',
    'f4',
    'rest',
    'rest',
    'rest',
    'ds4',
    'rest',
    'rest',
    'rest',
    'g4',
    'rest',
    'rest',
  ]),
]

function noteIdForMidiNumber(noteNumber) {
  const clamped = Math.min(MAX_NOTE_NUMBER, Math.max(MIN_NOTE_NUMBER, noteNumber))
  return midiNumberToNoteId(clamped)
}

function transposeNoteId(noteId, semitoneOffset) {
  if (noteId === 'rest' || semitoneOffset === 0) {
    return noteId
  }

  const midiNumber = NOTE_ID_TO_MIDI_NUMBER.get(noteId)

  if (midiNumber === undefined) {
    return noteId
  }

  return noteIdForMidiNumber(midiNumber + semitoneOffset)
}

function findScale(scaleId) {
  return SCALE_OPTIONS.find((scale) => scale.id === scaleId) ?? SCALE_OPTIONS[0]
}

function scaleIntervalsFor(scaleId) {
  return findScale(scaleId).intervals ?? NOTE_NAMES.map((_, index) => index)
}

function isNoteRoot(noteId, rootSemitone) {
  const midiNumber = NOTE_ID_TO_MIDI_NUMBER.get(noteId)

  if (midiNumber === undefined) {
    return false
  }

  return midiNumber % 12 === rootSemitone
}

function isNoteInScale(noteId, rootSemitone, scaleId) {
  const scale = findScale(scaleId)

  if (!scale.intervals) {
    return true
  }

  const midiNumber = NOTE_ID_TO_MIDI_NUMBER.get(noteId)

  if (midiNumber === undefined) {
    return false
  }

  return scale.intervals.includes((midiNumber - rootSemitone + 120) % 12)
}

function snapMidiNumberToScale(midiNumber, rootSemitone, scaleId) {
  if (isNoteInScale(noteIdForMidiNumber(midiNumber), rootSemitone, scaleId)) {
    return midiNumber
  }

  for (let offset = 1; offset <= 12; offset += 1) {
    const lower = midiNumber - offset
    const upper = midiNumber + offset

    if (
      lower >= MIN_NOTE_NUMBER &&
      isNoteInScale(noteIdForMidiNumber(lower), rootSemitone, scaleId)
    ) {
      return lower
    }

    if (
      upper <= MAX_NOTE_NUMBER &&
      isNoteInScale(noteIdForMidiNumber(upper), rootSemitone, scaleId)
    ) {
      return upper
    }
  }

  return midiNumber
}

function snapNoteIdToScale(noteId, rootSemitone, scaleId) {
  if (noteId === 'rest') {
    return noteId
  }

  const midiNumber = NOTE_ID_TO_MIDI_NUMBER.get(noteId)

  if (midiNumber === undefined) {
    return noteId
  }

  return noteIdForMidiNumber(snapMidiNumberToScale(midiNumber, rootSemitone, scaleId))
}

function midiNumberForRoot(rootSemitone, octave) {
  return (octave + 1) * 12 + rootSemitone
}

function noteIdForScaleDegree(rootSemitone, scaleId, baseOctave, degree) {
  const scaleIntervals = scaleIntervalsFor(scaleId)
  const degreeIndex = ((degree % scaleIntervals.length) + scaleIntervals.length) % scaleIntervals.length
  const octaveOffset = Math.floor(degree / scaleIntervals.length)
  const midiNumber =
    midiNumberForRoot(rootSemitone, baseOctave) +
    scaleIntervals[degreeIndex] +
    octaveOffset * 12

  return noteIdForMidiNumber(midiNumber)
}

function findChord(chordId) {
  return CHORD_OPTIONS.find((chord) => chord.id === chordId) ?? CHORD_OPTIONS[0]
}

function createFriendlyChordSteps(variation, stepCount = STEP_COUNT) {
  const progression = CHORD_PROGRESSIONS[variation % CHORD_PROGRESSIONS.length]
  const steps = createEmptyChordSteps(stepCount)
  const chordSpacing = Math.max(1, Math.floor(stepCount / progression.length))

  progression.forEach((chordId, index) => {
    const stepIndex = index * chordSpacing

    if (stepIndex < steps.length) {
      steps[stepIndex] = chordId
    }
  })

  return steps
}

function chordNoteIdsForChordId(chordId, rootSemitone, scaleId, baseOctave = 3) {
  if (chordId === 'rest') {
    return []
  }

  const chord = findChord(chordId)
  const intervals = [0, 2, 4]

  return intervals.map((interval) =>
    noteIdForScaleDegree(rootSemitone, scaleId, baseOctave, chord.degree + interval),
  )
}

function chordRootNoteId(chordId, rootSemitone, scaleId, baseOctave = 3) {
  if (chordId === 'rest') {
    return 'rest'
  }

  return noteIdForScaleDegree(rootSemitone, scaleId, baseOctave, findChord(chordId).degree)
}

function chordLabelForId(chordId) {
  if (chordId === 'rest') {
    return 'Rest'
  }

  return findChord(chordId).label
}

function chordNotesLabel(chordId, rootSemitone, scaleId) {
  const noteLabels = chordNoteIdsForChordId(chordId, rootSemitone, scaleId).map(
    (noteId) => findNote(noteId).label,
  )

  return noteLabels.join(' ')
}

function createChordAwareBassSteps(rootSemitone, scaleId, chordSteps) {
  const steps = [...EMPTY_STEPS]

  chordSteps.forEach((chordId, stepIndex) => {
    if (chordId === 'rest') {
      return
    }

    const chord = findChord(chordId)
    const root = noteIdForScaleDegree(rootSemitone, scaleId, 2, chord.degree)
    const fifth = noteIdForScaleDegree(rootSemitone, scaleId, 2, chord.degree + 4)

    steps[stepIndex] = root

    if (stepIndex + 2 < steps.length) {
      steps[stepIndex + 2] = fifth
    }

    if (stepIndex + 3 < steps.length) {
      steps[stepIndex + 3] = root
    }
  })

  return steps
}

function createChordAwareMelodySteps(rootSemitone, scaleId, chordSteps, variation) {
  const phrases = [
    [0, 1, 2, 1],
    [2, 1, 0, 2],
    [1, 2, 1, 0],
  ]
  const phrase = phrases[variation % phrases.length]
  const steps = [...EMPTY_STEPS]

  chordSteps.forEach((chordId, stepIndex) => {
    if (chordId === 'rest') {
      return
    }

    const chord = findChord(chordId)
    const phraseIndex = Math.floor(stepIndex / 4) % phrase.length
    const degreeOffset = [0, 2, 4][phrase[phraseIndex]]
    const nextDegreeOffset = [0, 2, 4][phrase[(phraseIndex + 1) % phrase.length]]

    steps[stepIndex] = noteIdForScaleDegree(
      rootSemitone,
      scaleId,
      4,
      chord.degree + degreeOffset,
    )

    if (stepIndex + 2 < steps.length) {
      steps[stepIndex + 2] = noteIdForScaleDegree(
        rootSemitone,
        scaleId,
        4,
        chord.degree + nextDegreeOffset,
      )
    }
  })

  return steps
}

function noteMenuCategoryFor(noteId, kind = 'melody') {
  if (noteId === 'rest') {
    return kind === 'bass' ? NOTE_MENU_CATEGORIES[0].id : NOTE_MENU_CATEGORIES[1].id
  }

  const midiNumber = NOTE_ID_TO_MIDI_NUMBER.get(noteId)

  if (midiNumber === undefined) {
    return kind === 'bass' ? NOTE_MENU_CATEGORIES[0].id : NOTE_MENU_CATEGORIES[1].id
  }

  const pageIndex = Math.max(
    0,
    Math.min(
      NOTE_PAGE_COUNT - 1,
      Math.floor((midiNumber - MIN_NOTE_NUMBER) / NOTE_MENU_PAGE_SIZE),
    ),
  )

  return NOTE_MENU_CATEGORIES[pageIndex].id
}

function shortcutRowForEvent(event) {
  if (event.altKey) {
    return 1
  }

  if (event.ctrlKey) {
    return 2
  }

  if (event.shiftKey) {
    return 3
  }

  return 0
}

function shortcutDigitForEvent(event) {
  if (/^[1-6]$/.test(event.key)) {
    return Number(event.key)
  }

  const codeMatch = event.code?.match(/^Digit([1-6])$/)

  return codeMatch ? Number(codeMatch[1]) : null
}

function noteLetterForEvent(event) {
  const key = event.key?.toLowerCase()

  return Object.hasOwn(NOTE_LETTER_TO_SEMITONE, key) ? key : null
}

function octaveForEvent(event) {
  const codeMatch = event.code?.match(/^Digit([0-9])$/)

  if (codeMatch) {
    return Number(codeMatch[1])
  }

  return /^[0-9]$/.test(event.key) ? Number(event.key) : null
}

function noteIdForKeyboardChord(noteLetter, octave, isSharp) {
  if (!noteLetter || octave === null) {
    return null
  }

  const midiNumber =
    (octave + 1) * 12 + NOTE_LETTER_TO_SEMITONE[noteLetter] + (isSharp ? 1 : 0)

  if (midiNumber < MIN_NOTE_NUMBER || midiNumber > MAX_NOTE_NUMBER) {
    return null
  }

  return midiNumberToNoteId(midiNumber)
}

function transposeTrackList(tracks, semitoneOffset) {
  if (!semitoneOffset) {
    return tracks
  }

  return tracks.map((track) => ({
    ...track,
    steps: track.steps.map((noteId) => transposeNoteId(noteId, semitoneOffset)),
  }))
}

function snapTrackListToScale(tracks, rootSemitone, scaleId) {
  return tracks.map((track) => ({
    ...track,
    steps: track.steps.map((noteId) => snapNoteIdToScale(noteId, rootSemitone, scaleId)),
  }))
}

function resizeList(items, length, fillValue) {
  return Array.from({ length }, (_, index) => items[index] ?? fillValue)
}

function resizeTrackSteps(tracks, length) {
  return tracks.map((track) => ({
    ...track,
    steps: resizeList(track.steps, length, 'rest'),
  }))
}

function resizeDrumState(drums, length) {
  return Object.fromEntries(
    DRUM_TRACKS.map((track) => [
      track.id,
      resizeList(drums[track.id] ?? [], length, false),
    ]),
  )
}

function clampPatternLength(value) {
  return Math.min(
    MAX_PATTERN_LENGTH,
    Math.max(MIN_PATTERN_LENGTH, Number(value) || STEP_COUNT),
  )
}

function readUserPresets() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(USER_PRESETS_STORAGE_KEY) ?? '[]')

    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeUserPresets(presets) {
  window.localStorage.setItem(USER_PRESETS_STORAGE_KEY, JSON.stringify(presets))
}

function createPresetTrackSnapshot(track) {
  return {
    label: track.label,
    presetId: track.presetId,
    steps: [...track.steps],
    muted: Boolean(track.muted),
    volume: track.volume ?? DEFAULT_LANE_VOLUME,
  }
}

function createUserPresetSnapshot(name, state) {
  return {
    id: `user-${Date.now().toString(36)}`,
    label: name,
    savedAt: new Date().toISOString(),
    bpm: state.bpm,
    drive: state.drive,
    volume: state.volume,
    tone: state.tone,
    punch: state.punch,
    space: state.space,
    motion: state.motion,
    width: state.width,
    effectSceneId: state.effectSceneId,
    patternLength: state.patternLength,
    selectedScaleId: state.selectedScaleId,
    selectedPadId: state.selectedPadId,
    chordPresetId: state.chordPresetId,
    chordMuted: state.chordMuted,
    chordVolume: state.chordVolume,
    chordSteps: [...state.chordSteps],
    bassTracks: state.bassTracks.map(createPresetTrackSnapshot),
    melodyTracks: state.melodyTracks.map(createPresetTrackSnapshot),
    drums: Object.fromEntries(
      Object.entries(state.drums).map(([trackId, steps]) => [trackId, [...steps]]),
    ),
    drumMixer: Object.fromEntries(
      Object.entries(state.drumMixer).map(([trackId, mixer]) => [
        trackId,
        {
          muted: Boolean(mixer.muted),
          volume: mixer.volume ?? DEFAULT_LANE_VOLUME,
        },
      ]),
    ),
  }
}

function instantiatePresetTrack(kind, track, index, loopLength) {
  return {
    ...createTrack(
      kind,
      index + 1,
      track.presetId ?? (kind === 'bass' ? 'boom808' : 'toy'),
      track.steps?.length ? track.steps : createEmptySteps(loopLength),
    ),
    label: track.label ?? `${kind === 'bass' ? 'Bass' : 'Melody'} ${index + 1}`,
    muted: Boolean(track.muted),
    volume: track.volume ?? DEFAULT_LANE_VOLUME,
  }
}

function instantiateUserPreset(preset) {
  const loopLength =
    Math.max(
      1,
      preset.patternLength ?? 0,
      preset.chordSteps?.length ?? 0,
      ...(preset.bassTracks ?? []).map((track) => track.steps?.length ?? 0),
      ...(preset.melodyTracks ?? []).map((track) => track.steps?.length ?? 0),
      ...Object.values(preset.drums ?? {}).map((steps) => steps.length),
    ) || STEP_COUNT
  const bassTracks = (preset.bassTracks ?? []).map((track, index) =>
    instantiatePresetTrack('bass', track, index, loopLength),
  )
  const melodyTracks = (preset.melodyTracks ?? []).map((track, index) =>
    instantiatePresetTrack('melody', track, index, loopLength),
  )

  return {
    ...preset,
    patternLength: loopLength,
    chordSteps: preset.chordSteps?.length
      ? [...preset.chordSteps]
      : createEmptyChordSteps(loopLength),
    bassTracks: bassTracks.length
      ? bassTracks
      : [createTrack('bass', 1, 'boom808', createEmptySteps(loopLength))],
    melodyTracks: melodyTracks.length
      ? melodyTracks
      : [createTrack('melody', 1, 'toy', createEmptySteps(loopLength))],
    drums: createDrumState(preset.drums, loopLength),
    drumMixer: createDrumMixerState(preset.drumMixer),
  }
}

function updateTrackSteps(currentTracks, trackId, stepIndex, noteId) {
  return currentTracks.map((track) =>
    track.id === trackId
      ? {
          ...track,
          steps: track.steps.map((stepNote, index) =>
            index === stepIndex ? noteId : stepNote,
          ),
        }
      : track,
  )
}

function createStepSelection(kind, trackId, stepIndex) {
  return { kind, trackId, stepIndex }
}

function stepSelectionKey(selection) {
  return `${selection.kind}:${selection.trackId}:${selection.stepIndex}`
}

function createStepSelectionRange(kind, trackId, startStep, endStep) {
  const firstStep = Math.min(startStep, endStep)
  const lastStep = Math.max(startStep, endStep)

  return Array.from({ length: lastStep - firstStep + 1 }, (_, index) =>
    createStepSelection(kind, trackId, firstStep + index),
  )
}

function updateTrackStepsForSelections(currentTracks, selections, noteId) {
  const selectionsByTrack = selections.reduce((stepsByTrack, selection) => {
    const selectedSteps = stepsByTrack.get(selection.trackId) ?? new Set()
    selectedSteps.add(selection.stepIndex)
    stepsByTrack.set(selection.trackId, selectedSteps)
    return stepsByTrack
  }, new Map())

  if (!selectionsByTrack.size) {
    return currentTracks
  }

  return currentTracks.map((track) => {
    const selectedSteps = selectionsByTrack.get(track.id)

    if (!selectedSteps) {
      return track
    }

    return {
      ...track,
      steps: track.steps.map((stepNote, index) =>
        selectedSteps.has(index) ? noteId : stepNote,
      ),
    }
  })
}

function getNoteMenuPosition(top, left) {
  return {
    top: Math.max(12, Math.min(top, window.innerHeight - 420)),
    left: Math.max(12, Math.min(left, window.innerWidth - 460)),
  }
}

function findNote(noteId) {
  return NOTE_OPTIONS.find((note) => note.id === noteId) ?? NOTE_OPTIONS[0]
}

function findPreset(presetId) {
  return {
    ...PRESET_DEFAULTS,
    ...(SYNTH_PRESETS.find((preset) => preset.id === presetId) ?? SYNTH_PRESETS[0]),
  }
}

function presetOptionsFor(kind) {
  return SYNTH_PRESETS.filter((preset) => preset.role === kind)
}

function findEffectScene(sceneId) {
  return (
    EFFECT_SCENES.find((scene) => scene.id === sceneId) ??
    EFFECT_SCENES.find((scene) => scene.id === DEFAULT_EFFECT_SCENE_ID) ??
    EFFECT_SCENES[0]
  )
}

function createMasterSaturationCurve(amount) {
  const curve = new Float32Array(DISTORTION_CURVE_SAMPLES)
  const drive = 1 + Math.max(0, Math.min(amount, 1.8)) * 2.2

  for (let index = 0; index < curve.length; index += 1) {
    const x = (index / (curve.length - 1)) * 2 - 1
    curve[index] = Math.tanh(x * drive) / Math.tanh(drive)
  }

  return curve
}

function createNoiseBuffer(context) {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
  const channel = buffer.getChannelData(0)

  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = Math.random() * 2 - 1
  }

  return buffer
}

function createDistortionCurve(amount) {
  const samples = DISTORTION_CURVE_SAMPLES
  const curve = new Float32Array(samples)
  const deg = Math.PI / 180

  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / samples - 1
    curve[index] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x))
  }

  return curve
}

function createDistortionCurveCache() {
  const cache = new Map()

  return {
    get(amount) {
      const safeAmount = Math.max(0.1, amount)
      const cacheKey = Math.round(safeAmount * 10) / 10
      const cachedCurve = cache.get(cacheKey)

      if (cachedCurve) {
        return cachedCurve
      }

      const curve = createDistortionCurve(cacheKey)
      cache.set(cacheKey, curve)

      if (cache.size > MAX_DISTORTION_CURVE_CACHE_SIZE) {
        cache.delete(cache.keys().next().value)
      }

      return curve
    },
  }
}

function getAudioProfile() {
  const hasCoarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  const isAndroid =
    typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
  const hasTouch =
    typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1

  return isAndroid || (hasTouch && hasCoarsePointer)
    ? AUDIO_PROFILES.constrained
    : AUDIO_PROFILES.standard
}

function chordQualityIntervals(quality, variant) {
  if (variant === 'sus') {
    return [0, 5, 7, 12]
  }

  if (quality === 'dim') {
    return variant === 'seventh' ? [0, 3, 6, 10] : [0, 3, 6]
  }

  const third = quality === 'm' ? 3 : 4
  const seventh = variant === 'dominant' ? 10 : 11
  const intervals = [0, third, 7]

  if (variant === 'seventh' || variant === 'dominant') {
    intervals.push(seventh)
  }

  if (variant === 'add9') {
    intervals.push(14)
  }

  return intervals
}

function padAppMidiToFrequency(noteNumber) {
  return 440 * 2 ** ((noteNumber - 69) / 12)
}

function padAppNoteLabel(noteNumber) {
  const octave = Math.floor(noteNumber / 12) - 1
  const note = NOTE_NAMES[((noteNumber % 12) + 12) % 12]

  return `${note.label}${octave}`
}

function applyPadAppVariation(noteNumbers, variationId) {
  if (noteNumbers.length < 2) {
    return noteNumbers
  }

  const [rootNote, third = rootNote + 4, fifth = rootNote + 7, seventh] = noteNumbers

  switch (variationId) {
    case 'low-open':
      return [rootNote - 12, fifth, third + 12, seventh].filter(Number.isFinite)
    case 'sus2':
      return [rootNote, rootNote + 2, fifth, seventh].filter(Number.isFinite)
    case 'add9':
      return [...noteNumbers, rootNote + 14]
    case 'minor-color':
      return [rootNote, rootNote + 3, fifth, seventh].filter(Number.isFinite)
    case 'major7':
      return [rootNote, third, fifth, rootNote + 11]
    case 'tight':
      return noteNumbers.map((noteNumber) =>
        noteNumber - rootNote > 10 ? noteNumber - 12 : noteNumber,
      )
    case 'sus4':
      return [rootNote, rootNote + 5, fifth, seventh].filter(Number.isFinite)
    case 'octave':
      return [...noteNumbers, rootNote + 12]
    default:
      return noteNumbers
  }
}

function buildPadAppPads(rootSemitone, scaleId, octave, toneMode, variationId) {
  const scale = PAD_APP_SCALES.find((item) => item.id === scaleId) ?? PAD_APP_SCALES[0]
  const rootMidi = 12 * (octave + 1) + rootSemitone

  return PAD_APP_CHORDS.map((pad, index) => {
    const scaleOffset = scale.intervals[pad.degree]
    const rootNote = rootMidi + scaleOffset
    const quality = scale.qualities[pad.degree]
    const noteNumbers =
      toneMode === 'notes'
        ? [rootMidi + PAD_APP_NOTE_OFFSETS[index]]
        : applyPadAppVariation(
            chordQualityIntervals(quality, pad.variant).map((interval) => rootNote + interval),
            variationId,
          )

    return {
      ...pad,
      id: `pad-${index}`,
      keyName: PAD_APP_KEYS[index],
      color: PAD_APP_COLORS[index],
      noteNumbers,
      label: toneMode === 'notes' ? padAppNoteLabel(noteNumbers[0]) : pad.roman,
      sublabel: toneMode === 'notes' ? pad.name : noteNumbers.map(padAppNoteLabel).join(' '),
    }
  })
}

function ChordPadApp({ onOpenGroovebox, onOpenSampler, onOpenNoteGame }) {
  const [rootId, setRootId] = useState('c')
  const [scaleId, setScaleId] = useState('major')
  const [instrumentId, setInstrumentId] = useState('glass')
  const [toneMode, setToneMode] = useState('chords')
  const [performanceMode, setPerformanceMode] = useState('hit')
  const [strumDirection, setStrumDirection] = useState('up')
  const [arpDirection, setArpDirection] = useState('up')
  const [variationId, setVariationId] = useState('plain')
  const [tempo, setTempo] = useState(112)
  const [octave, setOctave] = useState(3)
  const [volume, setVolume] = useState(0.72)
  const [release, setRelease] = useState(0.38)
  const [filterCutoff, setFilterCutoff] = useState(0.72)
  const [delayMix, setDelayMix] = useState(0.16)
  const [delayTime, setDelayTime] = useState(0.22)
  const [isLatched, setIsLatched] = useState(false)
  const [hasBassLayer, setHasBassLayer] = useState(false)
  const [activeMenuId, setActiveMenuId] = useState('key')
  const [activePads, setActivePads] = useState([])
  const [isRecordingLoop, setIsRecordingLoop] = useState(false)
  const [isLoopPlaying, setIsLoopPlaying] = useState(false)
  const [loopEvents, setLoopEvents] = useState([])
  const [beatId, setBeatId] = useState('house')
  const [isBeatPlaying, setIsBeatPlaying] = useState(false)
  const [beatVolume, setBeatVolume] = useState(0.62)
  const [grooveDrumLoop, setGrooveDrumLoop] = useState(null)

  const audioContextRef = useRef(null)
  const masterGainRef = useRef(null)
  const masterFilterRef = useRef(null)
  const delayNodeRef = useRef(null)
  const delayGainRef = useRef(null)
  const feedbackGainRef = useRef(null)
  const activeVoicesRef = useRef(new Map())
  const keyPadRef = useRef(new Map())
  const padByIdRef = useRef(new Map())
  const pressedKeysRef = useRef(new Set())
  const loopRecordingStartRef = useRef(0)
  const loopAnchorRef = useRef(0)
  const loopCycleTimerRef = useRef(null)
  const loopTimeoutsRef = useRef([])
  const beatTimerRef = useRef(null)
  const beatStepRef = useRef(0)
  const beatPatternRef = useRef(PAD_APP_BEATS[0])
  const beatVolumeRef = useRef(beatVolume)
  const beatTimeoutsRef = useRef([])
  const ensurePadAudioRef = useRef(null)
  const playBeatHitRef = useRef(null)
  const playBeatStepRef = useRef(null)

  const root = PAD_APP_ROOTS.find((item) => item.id === rootId) ?? PAD_APP_ROOTS[0]
  const pads = buildPadAppPads(root.semitone, scaleId, octave, toneMode, variationId)
  const activeVariation =
    PAD_APP_VARIATIONS.find((variation) => variation.id === variationId) ??
    PAD_APP_VARIATIONS[4]
  const instrument =
    PAD_APP_INSTRUMENTS.find((preset) => preset.id === instrumentId) ??
    PAD_APP_INSTRUMENTS[0]
  const beat = PAD_APP_BEATS.find((item) => item.id === beatId) ?? PAD_APP_BEATS[0]
  const beatLabel = grooveDrumLoop?.label ?? beat.label
  const loopLengthSeconds = (60 / tempo) * 8
  const activeMenu =
    PAD_APP_MENUS.find((menu) => menu.id === activeMenuId) ?? PAD_APP_MENUS[0]
  const loopBarCount = Math.max(1, Math.min(6, Math.ceil(loopEvents.length / 4)))

  const ensurePadAudio = async () => {
    if (!audioContextRef.current) {
      const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext

      if (!AudioContextConstructor) {
        throw new Error('Web Audio is not available in this browser.')
      }

      const context = new AudioContextConstructor({ latencyHint: 'interactive' })
      const masterGain = context.createGain()
      const masterFilter = context.createBiquadFilter()
      const compressor = context.createDynamicsCompressor()
      const delay = context.createDelay(0.8)
      const feedback = context.createGain()
      const delayGain = context.createGain()

      masterGain.gain.value = volume
      masterFilter.type = 'lowpass'
      masterFilter.frequency.value = padAppFilterFrequency(filterCutoff)
      masterFilter.Q.value = 0.82
      compressor.threshold.value = -20
      compressor.knee.value = 16
      compressor.ratio.value = 5
      compressor.attack.value = 0.004
      compressor.release.value = 0.2
      delay.delayTime.value = delayTime
      feedback.gain.value = 0.18
      delayGain.gain.value = delayMix

      masterGain.connect(masterFilter)
      masterFilter.connect(compressor)
      compressor.connect(context.destination)
      masterFilter.connect(delay)
      delay.connect(feedback)
      feedback.connect(delay)
      delay.connect(delayGain)
      delayGain.connect(compressor)

      audioContextRef.current = context
      masterGainRef.current = masterGain
      masterFilterRef.current = masterFilter
      delayNodeRef.current = delay
      delayGainRef.current = delayGain
      feedbackGainRef.current = feedback
    }

    if (audioContextRef.current.state !== 'running') {
      await audioContextRef.current.resume()
    }

    return audioContextRef.current
  }

  useEffect(() => {
    ensurePadAudioRef.current = ensurePadAudio
  })

  useEffect(() => {
    keyPadRef.current = new Map(pads.map((pad) => [pad.keyName, pad]))
    padByIdRef.current = new Map(pads.map((pad) => [pad.id, pad]))
  }, [pads])

  useEffect(() => {
    if (!masterGainRef.current || !audioContextRef.current) {
      return
    }

    masterGainRef.current.gain.setTargetAtTime(
      volume,
      audioContextRef.current.currentTime,
      0.02,
    )
  }, [volume])

  useEffect(() => {
    if (!masterFilterRef.current || !audioContextRef.current) {
      return
    }

    masterFilterRef.current.frequency.setTargetAtTime(
      padAppFilterFrequency(filterCutoff),
      audioContextRef.current.currentTime,
      0.04,
    )
  }, [filterCutoff])

  useEffect(() => {
    if (!delayGainRef.current || !audioContextRef.current) {
      return
    }

    delayGainRef.current.gain.setTargetAtTime(
      toneMode === 'chords' ? delayMix : delayMix * 0.55,
      audioContextRef.current.currentTime,
      0.04,
    )
  }, [delayMix, toneMode])

  useEffect(() => {
    if (!delayNodeRef.current || !audioContextRef.current) {
      return
    }

    delayNodeRef.current.delayTime.setTargetAtTime(
      delayTime,
      audioContextRef.current.currentTime,
      0.04,
    )
  }, [delayTime])

  const stopPad = useCallback((padId) => {
    const context = audioContextRef.current
    const voices = activeVoicesRef.current.get(padId)

    if (!context || !voices) {
      return
    }

    if (voices.timerId) {
      window.clearInterval(voices.timerId)
    }

    const stopAt = context.currentTime + release + 0.08

    voices.items.forEach((voice) => {
      voice.gain.gain.cancelScheduledValues(context.currentTime)
      voice.gain.gain.setTargetAtTime(0.0001, context.currentTime, release / 3)
      voice.filter.frequency.setTargetAtTime(620, context.currentTime, release / 2)
      voice.oscillators.forEach((oscillator) => {
        try {
          oscillator.stop(stopAt)
        } catch {
          // A scheduled oscillator can already have a stop time when rapidly retriggered.
        }
      })
    })

    activeVoicesRef.current.delete(padId)
    setActivePads((currentPads) => currentPads.filter((id) => id !== padId))
  }, [release])

  const triggerPadNote = (
    context,
    noteNumber,
    index,
    totalNotes,
    startAt,
    duration,
    isPercussive = false,
  ) => {
    const gain = context.createGain()
    const filter = context.createBiquadFilter()
    const pan = context.createStereoPanner()
    const oscillator = context.createOscillator()
    const sheen = context.createOscillator()
    const shouldPercuss = isPercussive || instrument.percussive
    const peakGain = shouldPercuss
      ? instrument.noteGain
      : toneMode === 'chords'
        ? instrument.chordGain
        : instrument.noteGain
    const sustainGain = shouldPercuss
      ? 0.0001
      : toneMode === 'chords'
        ? instrument.chordGain * 0.62
        : instrument.noteGain * 0.64
    const attack = instrument.attack
    const filterTarget = 1800 + 2600 * instrument.filterPeak
    const stopAt = startAt + duration + 0.08

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(520, startAt)
    filter.frequency.exponentialRampToValueAtTime(
      toneMode === 'chords' ? filterTarget : filterTarget * 0.78,
      startAt + 0.16,
    )
    filter.Q.value = 1.4
    pan.pan.value = toneMode === 'chords' ? (index - (totalNotes - 1) / 2) * 0.18 : 0
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(peakGain, startAt + attack)

    if (shouldPercuss) {
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
    } else {
      gain.gain.setTargetAtTime(sustainGain, startAt + 0.12, 0.18)
    }

    oscillator.type = instrument.oscillator
    oscillator.frequency.value = padAppMidiToFrequency(noteNumber)
    oscillator.detune.value = instrument.detune
      ? index % 2 === 0
        ? -instrument.detune
        : instrument.detune
      : 0
    sheen.type = instrument.sheen
    sheen.frequency.value = padAppMidiToFrequency(noteNumber + 12)
    sheen.detune.value = index % 2 === 0 ? 2 : -2

    oscillator.connect(filter)
    sheen.connect(filter)
    filter.connect(gain)
    gain.connect(pan)
    pan.connect(masterGainRef.current)
    oscillator.start(startAt)
    sheen.start(startAt)
    oscillator.stop(stopAt)
    sheen.stop(stopAt)

    return { gain, filter, oscillators: [oscillator, sheen] }
  }

  const playBeatHit = (
    kind,
    startAt = audioContextRef.current?.currentTime ?? 0,
    velocity = 1,
  ) => {
    const context = audioContextRef.current

    if (!context || !masterGainRef.current) {
      return
    }

    const level = beatVolumeRef.current * Math.max(0.08, Math.min(1, velocity))
    const gain = context.createGain()

    gain.connect(masterGainRef.current)

    if (kind === 'kick') {
      const oscillator = context.createOscillator()
      const click = context.createOscillator()
      const clickGain = context.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(118, startAt)
      oscillator.frequency.exponentialRampToValueAtTime(42, startAt + 0.18)
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(0.82 * level, startAt + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.34)
      oscillator.connect(gain)
      oscillator.start(startAt)
      oscillator.stop(startAt + 0.36)

      click.type = 'triangle'
      click.frequency.value = 180
      clickGain.gain.setValueAtTime(0.16 * level, startAt)
      clickGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.035)
      click.connect(clickGain)
      clickGain.connect(masterGainRef.current)
      click.start(startAt)
      click.stop(startAt + 0.04)
      return
    }

    if (kind === 'snare') {
      const noiseBuffer = createNoiseBuffer(context)
      const noise = context.createBufferSource()
      const filter = context.createBiquadFilter()
      const body = context.createOscillator()
      const bodyGain = context.createGain()

      noise.buffer = noiseBuffer
      filter.type = 'bandpass'
      filter.frequency.value = 1700
      filter.Q.value = 0.65
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(0.4 * level, startAt + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18)
      noise.connect(filter)
      filter.connect(gain)
      noise.start(startAt)
      noise.stop(startAt + 0.2)

      body.type = 'triangle'
      body.frequency.value = 180
      bodyGain.gain.setValueAtTime(0.18 * level, startAt)
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.12)
      body.connect(bodyGain)
      bodyGain.connect(masterGainRef.current)
      body.start(startAt)
      body.stop(startAt + 0.13)
      return
    }

    if (kind === 'clap') {
      ;[0, 0.014, 0.031].forEach((offset, index) => {
        const noise = context.createBufferSource()
        const filter = context.createBiquadFilter()
        const clapGain = context.createGain()

        noise.buffer = createNoiseBuffer(context)
        filter.type = 'bandpass'
        filter.frequency.value = 1800 + index * 220
        filter.Q.value = 0.9
        clapGain.gain.setValueAtTime(0.0001, startAt + offset)
        clapGain.gain.exponentialRampToValueAtTime(0.2 * level, startAt + offset + 0.006)
        clapGain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.1)
        noise.connect(filter)
        filter.connect(clapGain)
        clapGain.connect(masterGainRef.current)
        noise.start(startAt + offset)
        noise.stop(startAt + offset + 0.12)
      })
      return
    }

    if (kind === 'rim') {
      const oscillator = context.createOscillator()
      const bodyGain = context.createGain()

      oscillator.type = 'square'
      oscillator.frequency.setValueAtTime(1600, startAt)
      bodyGain.gain.setValueAtTime(0.0001, startAt)
      bodyGain.gain.exponentialRampToValueAtTime(0.16 * level, startAt + 0.004)
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.07)
      oscillator.connect(bodyGain)
      bodyGain.connect(masterGainRef.current)
      oscillator.start(startAt)
      oscillator.stop(startAt + 0.08)
      return
    }

    if (kind === 'tom') {
      const oscillator = context.createOscillator()

      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(190, startAt)
      oscillator.frequency.exponentialRampToValueAtTime(96, startAt + 0.18)
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(0.38 * level, startAt + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.28)
      oscillator.connect(gain)
      oscillator.start(startAt)
      oscillator.stop(startAt + 0.3)
      return
    }

    const noiseBuffer = createNoiseBuffer(context)
    const noise = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const isOpenHat = kind === 'openHat'
    const isShaker = kind === 'shaker'
    const isCrash = kind === 'crash'
    const duration = isCrash ? 0.6 : isOpenHat ? 0.22 : isShaker ? 0.11 : 0.08
    const peak = isCrash ? 0.24 : isOpenHat ? 0.16 : isShaker ? 0.1 : 0.18

    noise.buffer = noiseBuffer
    filter.type = 'highpass'
    filter.frequency.value = isCrash ? 5200 : isShaker ? 9000 : 7200
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(peak * level, startAt + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
    noise.connect(filter)
    filter.connect(gain)
    noise.start(startAt)
    noise.stop(startAt + duration + 0.02)
  }

  const playBeatStep = (stepIndex) => {
    const pattern = beatPatternRef.current
    const startAt = audioContextRef.current?.currentTime ?? 0

    PAD_APP_DRUM_VOICES.forEach((voice) => {
      if (pattern[voice.id]?.includes(stepIndex)) {
        playBeatHit(voice.id, startAt)
      }
    })
  }

  useEffect(() => {
    playBeatHitRef.current = playBeatHit
  })

  useEffect(() => {
    playBeatStepRef.current = playBeatStep
  })

  const clearBeatTimers = useCallback(() => {
    if (beatTimerRef.current) {
      window.clearInterval(beatTimerRef.current)
      beatTimerRef.current = null
    }

    beatTimeoutsRef.current.forEach((timerId) => window.clearTimeout(timerId))
    beatTimeoutsRef.current = []
    beatStepRef.current = 0
  }, [])

  const scheduleGrooveDrumCycle = useCallback((loop) => {
    const context = audioContextRef.current

    if (!context) {
      return
    }

    const cycleStart = context.currentTime + 0.01

    beatTimeoutsRef.current.forEach((timerId) => window.clearTimeout(timerId))
    beatTimeoutsRef.current = loop.events.map((event) =>
      window.setTimeout(() => {
        playBeatHitRef.current?.(event.voice, cycleStart + event.offset, event.velocity)
      }, Math.max(0, event.offset * 1000 - 30)),
    )
  }, [])

  const startBeat = useCallback(async () => {
    await ensurePadAudioRef.current?.()
    clearBeatTimers()

    if (grooveDrumLoop?.events.length) {
      scheduleGrooveDrumCycle(grooveDrumLoop)
      beatTimerRef.current = window.setInterval(
        () => scheduleGrooveDrumCycle(grooveDrumLoop),
        grooveDrumLoop.duration * 1000,
      )
      return
    }

    beatStepRef.current = 0
    playBeatStepRef.current?.(beatStepRef.current)
    beatStepRef.current = 1
    beatTimerRef.current = window.setInterval(() => {
      playBeatStepRef.current?.(beatStepRef.current)
      beatStepRef.current = (beatStepRef.current + 1) % STEP_COUNT
    }, (60 / tempo / 4) * 1000)
  }, [clearBeatTimers, grooveDrumLoop, scheduleGrooveDrumCycle, tempo])

  const clearLoopTimers = useCallback(() => {
    if (loopCycleTimerRef.current) {
      window.clearInterval(loopCycleTimerRef.current)
      loopCycleTimerRef.current = null
    }

    loopTimeoutsRef.current.forEach((timerId) => window.clearTimeout(timerId))
    loopTimeoutsRef.current = []
  }, [])

  const padPlaybackNotes = (pad) =>
    hasBassLayer && toneMode === 'chords'
      ? [pad.noteNumbers[0] - 12, ...pad.noteNumbers]
      : pad.noteNumbers

  const orderedArpNotes = (notes) => {
    if (arpDirection === 'down') {
      return [...notes].reverse()
    }

    if (arpDirection === 'bounce') {
      const reversed = [...notes].reverse().slice(1, -1)
      return [...notes, ...reversed]
    }

    if (arpDirection === 'random') {
      return [notes[Math.floor(Math.random() * notes.length)]]
    }

    return notes
  }

  const playPad = async (pad, options = {}) => {
    const context = await ensurePadAudio()
    const playbackNotes = padPlaybackNotes(pad)

    if (!options.skipRecord && isRecordingLoop) {
      const loopStart =
        loopEvents.length || isLoopPlaying ? loopAnchorRef.current : loopRecordingStartRef.current
      const offset = Math.max(0, context.currentTime - loopStart)
      setLoopEvents((currentEvents) => [
        ...currentEvents,
        {
          padId: pad.id,
          offset: offset % loopLengthSeconds,
          duration: performanceMode === 'arp' || performanceMode === 'repeat' ? 0.9 : 0.55,
        },
      ])
    }

    if (!options.loopTrigger && isLatched && activeVoicesRef.current.has(pad.id)) {
      stopPad(pad.id)
      return
    }

    stopPad(pad.id)

    const now = context.currentTime
    const stepSeconds = 60 / tempo / 2
    const items = []
    let timerId = null

    if (performanceMode === 'arp' || performanceMode === 'repeat') {
      let stepIndex = 0
      const triggerStep = () => {
        const stepNow = context.currentTime
        const arpNotes = orderedArpNotes(playbackNotes)
        const noteIndex =
          performanceMode === 'repeat' ? stepIndex % playbackNotes.length : stepIndex
        const notes =
          performanceMode === 'repeat'
            ? playbackNotes
            : [arpNotes[noteIndex % arpNotes.length]]

        notes.forEach((noteNumber, index) => {
          items.push(
            triggerPadNote(
              context,
              noteNumber,
              index,
              notes.length,
              stepNow,
              stepSeconds * 0.72,
              true,
            ),
          )
        })

        stepIndex += 1
      }

      triggerStep()
      timerId = window.setInterval(triggerStep, stepSeconds * 1000)
    } else {
      const strumSpacing = performanceMode === 'strum' && toneMode === 'chords' ? 0.045 : 0
      const notes =
        performanceMode === 'strum' && strumDirection === 'down'
          ? [...playbackNotes].reverse()
          : playbackNotes

      notes.forEach((noteNumber, index) => {
        items.push(
          triggerPadNote(
            context,
            noteNumber,
            index,
            notes.length,
            now + index * strumSpacing,
            8,
          ),
        )
      })
    }

    activeVoicesRef.current.set(pad.id, { items, timerId })
    setActivePads((currentPads) =>
      currentPads.includes(pad.id) ? currentPads : [...currentPads, pad.id],
    )
  }

  const releasePad = (pad, options = {}) => {
    if (!options.loopTrigger && !isLatched) {
      stopPad(pad.id)
    }
  }

  const scheduleLoopCycle = () => {
    loopTimeoutsRef.current.forEach((timerId) => window.clearTimeout(timerId))
    loopTimeoutsRef.current = loopEvents.map((event) =>
      window.setTimeout(() => {
        const pad = padByIdRef.current.get(event.padId)

        if (!pad) {
          return
        }

        void playPad(pad, { skipRecord: true, loopTrigger: true })
        window.setTimeout(() => stopPad(pad.id), event.duration * 1000)
      }, event.offset * 1000),
    )
  }

  const startLoopPlayback = async () => {
    if (!loopEvents.length) {
      return
    }

    const context = await ensurePadAudio()
    clearLoopTimers()
    loopAnchorRef.current = context.currentTime
    scheduleLoopCycle()
    loopCycleTimerRef.current = window.setInterval(
      () => {
        loopAnchorRef.current = audioContextRef.current?.currentTime ?? loopAnchorRef.current
        scheduleLoopCycle()
      },
      loopLengthSeconds * 1000,
    )
    setIsLoopPlaying(true)
  }

  const stopLoopPlayback = () => {
    clearLoopTimers()
    setIsLoopPlaying(false)
  }

  const handleLoopRecordToggle = async () => {
    const context = await ensurePadAudio()

    if (isRecordingLoop) {
      setIsRecordingLoop(false)
      if (loopEvents.length) {
        void startLoopPlayback()
      }
      return
    }

    if (loopEvents.length) {
      if (!isLoopPlaying) {
        await startLoopPlayback()
      }
      loopRecordingStartRef.current = loopAnchorRef.current
    } else {
      stopLoopPlayback()
      loopRecordingStartRef.current = context.currentTime
      loopAnchorRef.current = context.currentTime
    }

    setActiveMenuId('loop')
    setIsRecordingLoop(true)
  }

  const handleLoopPlayToggle = () => {
    if (isLoopPlaying) {
      stopLoopPlayback()
      return
    }

    void startLoopPlayback()
  }

  const handleLoopClear = () => {
    stopLoopPlayback()
    setIsRecordingLoop(false)
    setLoopEvents([])
  }

  const handleLoopNew = async () => {
    const context = await ensurePadAudio()

    stopLoopPlayback()
    setLoopEvents([])
    loopRecordingStartRef.current = context.currentTime
    loopAnchorRef.current = context.currentTime
    setIsRecordingLoop(true)
    setActiveMenuId('loop')
  }

  const loadProgression = (progression) => {
    const beatSeconds = 60 / tempo

    stopLoopPlayback()
    setIsRecordingLoop(false)
    setLoopEvents(
      progression.padIds.map((padId, index) => ({
        padId,
        offset: index * beatSeconds * 2,
        duration: beatSeconds * 1.7,
      })),
    )
  }

  const handleBeatToggle = () => {
    if (isBeatPlaying) {
      clearBeatTimers()
      setIsBeatPlaying(false)
      return
    }

    setIsBeatPlaying(true)
  }

  const handleRandomGrooveDrumLoop = async () => {
    const choices = GROOVE_DRUM_LOOP_PRESETS.filter(
      (preset) => preset.type === 'beat' && preset.signature === '4-4',
    )
    const preset = choices[Math.floor(Math.random() * choices.length)]

    if (!preset) {
      return
    }

    const url = await preset.loadUrl()
    const loop = await loadGrooveDrumLoop(url)

    setGrooveDrumLoop({
      ...loop,
      label: preset.label,
      sourcePath: preset.path,
    })
    setTempo(loop.bpm)
    setIsBeatPlaying(true)
    setActiveMenuId('loop')
  }

  useEffect(() => {
    beatPatternRef.current = beat
  }, [beat])

  useEffect(() => {
    beatVolumeRef.current = beatVolume
  }, [beatVolume])

  useEffect(() => {
    if (isBeatPlaying) {
      void startBeat()
    } else {
      clearBeatTimers()
    }
  }, [beatId, clearBeatTimers, grooveDrumLoop, isBeatPlaying, startBeat, tempo])

  useEffect(() => () => clearBeatTimers(), [clearBeatTimers])

  useEffect(() => () => clearLoopTimers(), [clearLoopTimers])

  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase()
      const pad = keyPadRef.current.get(key)

      if (!pad || pressedKeysRef.current.has(key)) {
        return
      }

      event.preventDefault()
      pressedKeysRef.current.add(key)
      void playPad(pad)
    }

    const handleKeyUp = (event) => {
      const key = event.key.toLowerCase()
      const pad = keyPadRef.current.get(key)

      if (!pad) {
        return
      }

      event.preventDefault()
      pressedKeysRef.current.delete(key)
      releasePad(pad)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  })

  useEffect(() => {
    activeVoicesRef.current.forEach((_, padId) => stopPad(padId))
    pressedKeysRef.current.clear()
  }, [rootId, scaleId, toneMode, variationId, octave, stopPad])

  return (
    <main className="pad-app-shell">
      <header className="pad-hero">
        <div>
          <h1>Chord Pad</h1>
        </div>

        <nav className="app-switch-group" aria-label="Open app">
          <a href="#note-game" className="app-switch-button" onClick={onOpenNoteGame}>
            Game
          </a>
          <a href="#sampler" className="app-switch-button" onClick={onOpenSampler}>
            Sampler
          </a>
          <a href="#groovebox" className="app-switch-button" onClick={onOpenGroovebox}>
            Groovebox
          </a>
        </nav>
      </header>

      <section className="pad-workspace">
        <div className="pad-controls" aria-label="Chord Pad controls">
          <div className="menu-launcher" role="tablist" aria-label="Chord Pad menu">
            {PAD_APP_MENUS.map((menu) => (
              <button
                key={menu.id}
                type="button"
                className={activeMenuId === menu.id ? 'active' : ''}
                onClick={() => setActiveMenuId(menu.id)}
                role="tab"
                aria-selected={activeMenuId === menu.id}
              >
                {menu.label}
              </button>
            ))}
          </div>

          <div className={`menu-panel ${activeMenu.id}`} role="tabpanel">
            <div className="menu-panel-heading">
              <span>{activeMenu.label}</span>
              <strong>
                {root.label} {PAD_APP_SCALES.find((scale) => scale.id === scaleId)?.label}
              </strong>
            </div>

            {activeMenuId === 'key' ? (
              <>
                <TilePicker label="Root" options={PAD_APP_ROOTS} value={rootId} onChange={setRootId} />
                <TilePicker label="Scale" options={PAD_APP_SCALES} value={scaleId} onChange={setScaleId} />
                <label className="pad-control">
                  <span>Octave</span>
                  <input
                    type="range"
                    min="2"
                    max="5"
                    value={octave}
                    onChange={(event) => setOctave(Number(event.target.value))}
                  />
                  <strong>{octave}</strong>
                </label>
              </>
            ) : null}

            {activeMenuId === 'sound' ? (
              <>
                <TilePicker
                  label="Instrument"
                  options={PAD_APP_INSTRUMENTS}
                  value={instrumentId}
                  onChange={setInstrumentId}
                  getDetail={(preset) => preset.oscillator}
                />
                <TilePicker
                  label="Sound"
                  options={[
                    { id: 'chords', label: 'Chords' },
                    { id: 'notes', label: 'Notes' },
                  ]}
                  value={toneMode}
                  onChange={setToneMode}
                />
                <label className="pad-control">
                  <span>Filter</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={filterCutoff}
                    onChange={(event) => setFilterCutoff(Number(event.target.value))}
                  />
                  <strong>{Math.round(filterCutoff * 100)}</strong>
                </label>
                <label className="pad-control">
                  <span>Delay</span>
                  <input
                    type="range"
                    min="0"
                    max="0.42"
                    step="0.01"
                    value={delayMix}
                    onChange={(event) => setDelayMix(Number(event.target.value))}
                  />
                  <strong>{Math.round(delayMix * 100)}</strong>
                </label>
                <label className="pad-control">
                  <span>Echo Time</span>
                  <input
                    type="range"
                    min="0.08"
                    max="0.58"
                    step="0.01"
                    value={delayTime}
                    onChange={(event) => setDelayTime(Number(event.target.value))}
                  />
                  <strong>{delayTime.toFixed(2)}s</strong>
                </label>
                <label className="pad-control">
                  <span>Release</span>
                  <input
                    type="range"
                    min="0.08"
                    max="1.2"
                    step="0.01"
                    value={release}
                    onChange={(event) => setRelease(Number(event.target.value))}
                  />
                  <strong>{release.toFixed(2)}s</strong>
                </label>
              </>
            ) : null}

            {activeMenuId === 'play' ? (
              <>
                <TilePicker
                  label="Mode"
                  options={PAD_APP_PERFORMANCE_MODES}
                  value={performanceMode}
                  onChange={setPerformanceMode}
                />
                <TilePicker
                  label="Strum"
                  options={[
                    { id: 'up', label: 'Up' },
                    { id: 'down', label: 'Down' },
                  ]}
                  value={strumDirection}
                  onChange={setStrumDirection}
                />
                <TilePicker
                  label="Arp"
                  options={PAD_APP_ARP_DIRECTIONS}
                  value={arpDirection}
                  onChange={setArpDirection}
                />
                <div className="quick-toggle-row">
                  <button
                    type="button"
                    className={`latch-button ${isLatched ? 'active' : ''}`}
                    onClick={() => setIsLatched((current) => !current)}
                    aria-pressed={isLatched}
                  >
                    Hold
                  </button>
                  <button
                    type="button"
                    className={`latch-button ${hasBassLayer ? 'active' : ''}`}
                    onClick={() => setHasBassLayer((current) => !current)}
                    aria-pressed={hasBassLayer}
                  >
                    Bass
                  </button>
                </div>
              </>
            ) : null}

            {activeMenuId === 'loop' ? (
              <>
                <label className="pad-control">
                  <span>Tempo</span>
                  <input
                    type="range"
                    min="70"
                    max="180"
                    value={tempo}
                    onChange={(event) => setTempo(Number(event.target.value))}
                  />
                  <strong>{tempo} BPM</strong>
                </label>
                <label className="pad-control">
                  <span>Volume</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(event) => setVolume(Number(event.target.value))}
                  />
                  <strong>{Math.round(volume * 100)}</strong>
                </label>
                <div className="loop-control">
                  <div className="loop-control-top">
                    <span>Loop</span>
                    <strong>
                      {isRecordingLoop ? 'Recording' : isLoopPlaying ? 'Playing' : `${loopEvents.length} hits`}
                    </strong>
                  </div>

                  <div className="loop-track-meter" aria-label={`${loopBarCount} loop layers`}>
                    {Array.from({ length: 6 }, (_, index) => (
                      <span
                        key={index}
                        className={[
                          index < loopBarCount && loopEvents.length ? 'filled' : '',
                          isRecordingLoop && index === loopBarCount - 1 ? 'recording' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      />
                    ))}
                  </div>

                  <div className="loop-buttons">
                    <button
                      type="button"
                      className={isRecordingLoop ? 'active record' : ''}
                      onClick={() => void handleLoopRecordToggle()}
                    >
                      {isRecordingLoop ? 'Done' : loopEvents.length ? 'Dub' : 'Rec'}
                    </button>
                    <button type="button" className={isRecordingLoop ? 'record' : ''} onClick={() => void handleLoopNew()}>
                      New
                    </button>
                    <button
                      type="button"
                      className={isLoopPlaying ? 'active' : ''}
                      onClick={handleLoopPlayToggle}
                      disabled={!loopEvents.length}
                    >
                      {isLoopPlaying ? 'Stop' : 'Play'}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="clear-loop-button"
                    onClick={handleLoopClear}
                    disabled={!loopEvents.length && !isRecordingLoop}
                  >
                    Clear
                  </button>
                </div>

                <div className="beat-control">
                  <div className="loop-control-top">
                    <span>Drums</span>
                    <strong>{beatLabel}</strong>
                  </div>

                  <div className="beat-buttons">
                    <button
                      type="button"
                      className={grooveDrumLoop ? 'active random-beat' : 'random-beat'}
                      onClick={() => void handleRandomGrooveDrumLoop()}
                    >
                      Random MIDI
                    </button>
                    {PAD_APP_BEATS.map((pattern) => (
                      <button
                        key={pattern.id}
                        type="button"
                        className={!grooveDrumLoop && beatId === pattern.id ? 'active' : ''}
                        onClick={() => {
                          setGrooveDrumLoop(null)
                          setBeatId(pattern.id)
                        }}
                      >
                        {pattern.label}
                      </button>
                    ))}
                  </div>

                  <div className="loop-buttons drum-audition-buttons">
                    <button
                      type="button"
                      className={isBeatPlaying ? 'active' : ''}
                      onClick={handleBeatToggle}
                    >
                      {isBeatPlaying ? 'Stop' : 'Play'}
                    </button>
                    {PAD_APP_DRUM_VOICES.map((voice) => (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={async () => {
                          await ensurePadAudio()
                          playBeatHit(voice.id)
                        }}
                      >
                        {voice.label}
                      </button>
                    ))}
                  </div>

                  <label className="beat-volume">
                    <span>Vol</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={beatVolume}
                      onChange={(event) => setBeatVolume(Number(event.target.value))}
                    />
                    <strong>{Math.round(beatVolume * 100)}</strong>
                  </label>

                  <p className="beat-source-note">
                    {grooveDrumLoop
                      ? 'Playing human MIDI from MIDI LOOPS/groove. No metronome notes are used.'
                      : 'GMD-style grooves from human drummer MIDI, CC BY 4.0.'}
                  </p>
                </div>

                <div className="progression-buttons">
                  {PAD_APP_PROGRESSIONS.map((progression) => (
                    <button
                      key={progression.id}
                      type="button"
                      onClick={() => loadProgression(progression)}
                    >
                      {progression.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="pad-play-area">
          <div className="variation-panel">
            <div>
              <span>Variation</span>
              <strong>{activeVariation.label}</strong>
            </div>

            <div className="variation-grid" role="group" aria-label="Chord variations">
              {PAD_APP_VARIATIONS.map((variation) => (
                <button
                  key={variation.id}
                  type="button"
                  className={variationId === variation.id ? 'active' : ''}
                  onClick={() => setVariationId(variation.id)}
                >
                  <strong>{variation.label}</strong>
                  <span>{variation.detail}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="performance-grid" role="group" aria-label="Playable note and chord pads">
            {pads.map((pad) => (
              <button
                key={pad.id}
                type="button"
                className={`performance-pad ${activePads.includes(pad.id) ? 'active' : ''}`}
                style={{ '--pad-color': pad.color }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  void playPad(pad)
                }}
                onPointerUp={() => releasePad(pad)}
                onPointerCancel={() => releasePad(pad)}
                onPointerLeave={(event) => {
                  if (event.pointerType === 'mouse' && event.buttons === 1) {
                    releasePad(pad)
                  }
                }}
                aria-pressed={activePads.includes(pad.id)}
                aria-label={`${pad.label} pad, keyboard ${pad.keyName}`}
              >
                <span className="pad-key">{pad.keyName.toUpperCase()}</span>
                <strong>{pad.label}</strong>
                <span>{pad.sublabel}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}

function SamplerApp({ onOpenChordPad, onOpenGroovebox, onOpenNoteGame }) {
  const [samples] = useState(createSamplerSamples)
  const [pieces, setPieces] = useState([])
  const [grid, setGrid] = useState(createEmptySamplerGrid)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [selectedPadId, setSelectedPadId] = useState(samples[0]?.id ?? null)
  const [tempo, setTempo] = useState(samples[0]?.bpm ?? 160)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLooping, setIsLooping] = useState(true)
  const [currentStep, setCurrentStep] = useState(-1)

  const audioContextRef = useRef(null)
  const masterGainRef = useRef(null)
  const sampleBuffersRef = useRef(new Map())
  const playbackTimerRef = useRef(null)
  const loopRef = useRef(isLooping)
  const gridRef = useRef(grid)
  const pads = [...samples, ...pieces]
  const selectedPad = pads.find((pad) => pad.id === selectedPadId) ?? pads[0]
  const selectedPlacedSlot =
    selectedSlot && grid[selectedSlot.laneIndex]?.[selectedSlot.stepIndex]
      ? grid[selectedSlot.laneIndex][selectedSlot.stepIndex]
      : null
  const stepSeconds = 60 / tempo

  const ensureSamplerAudio = async () => {
    if (!audioContextRef.current) {
      const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext

      if (!AudioContextConstructor) {
        throw new Error('Web Audio is not available in this browser.')
      }

      const context = new AudioContextConstructor({ latencyHint: 'interactive' })
      const masterGain = context.createGain()

      masterGain.gain.value = 0.82
      masterGain.connect(context.destination)
      audioContextRef.current = context
      masterGainRef.current = masterGain
    }

    if (audioContextRef.current.state !== 'running') {
      await audioContextRef.current.resume()
    }

    return audioContextRef.current
  }

  const loadSampleBuffer = async (pad) => {
    const baseSample = samples.find((sample) => sample.sampleId === pad.sampleId) ?? samples[0]

    if (!baseSample) {
      return null
    }

    if (sampleBuffersRef.current.has(baseSample.sampleId)) {
      return sampleBuffersRef.current.get(baseSample.sampleId)
    }

    const context = await ensureSamplerAudio()
    const response = await fetch(baseSample.url)
    const audioData = await response.arrayBuffer()
    const buffer = await context.decodeAudioData(audioData)

    sampleBuffersRef.current.set(baseSample.sampleId, buffer)
    return buffer
  }

  const playSamplerPad = async (
    pad,
    lane = SAMPLER_LANES[1],
    startAt = audioContextRef.current?.currentTime ?? 0,
    maxDuration = 2.2,
  ) => {
    const context = await ensureSamplerAudio()
    const buffer = await loadSampleBuffer(pad)

    if (!buffer || !masterGainRef.current) {
      return
    }

    const source = context.createBufferSource()
    const gain = context.createGain()
    const chunkStart = buffer.duration * pad.chunk.start
    const chunkLength = buffer.duration * pad.chunk.length
    const duration = Math.max(0.05, Math.min(chunkLength, maxDuration))

    source.buffer = buffer
    source.playbackRate.value = lane.pitch
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(0.86, startAt + 0.01)
    gain.gain.setTargetAtTime(0.0001, startAt + duration * 0.82, 0.04)
    source.connect(gain)
    gain.connect(masterGainRef.current)
    source.start(startAt, chunkStart, duration)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
    }
  }

  const playGridStep = (stepIndex) => {
    const context = audioContextRef.current

    if (!context) {
      return
    }

    gridRef.current.forEach((laneSlots, laneIndex) => {
      const slot = laneSlots[stepIndex]

      if (!slot) {
        return
      }

      const lane = SAMPLER_LANES[laneIndex]
      const pad = pads.find((item) => item.id === slot.padId)

      if (!pad) {
        return
      }

      const repeat = Math.max(1, slot.repeat)
      const repeatGap = stepSeconds / repeat

      Array.from({ length: repeat }, (_, repeatIndex) => {
        void playSamplerPad(
          pad,
          lane,
          context.currentTime + repeatIndex * repeatGap,
          repeatGap * 0.82,
        )
      })
    })
  }

  const stopPlayback = useCallback(() => {
    if (playbackTimerRef.current) {
      window.clearInterval(playbackTimerRef.current)
      playbackTimerRef.current = null
    }

    setIsPlaying(false)
    setCurrentStep(-1)
  }, [])

  const startPlayback = async () => {
    await ensureSamplerAudio()
    stopPlayback()

    let stepIndex = 0
    setIsPlaying(true)
    setCurrentStep(stepIndex)
    playGridStep(stepIndex)
    playbackTimerRef.current = window.setInterval(() => {
      stepIndex += 1

      if (stepIndex >= SAMPLER_STEP_COUNT) {
        if (!loopRef.current) {
          stopPlayback()
          return
        }

        stepIndex = 0
      }

      setCurrentStep(stepIndex)
      playGridStep(stepIndex)
    }, stepSeconds * 1000)
  }

  const placePad = (laneIndex, stepIndex, padId) => {
    const pad = pads.find((item) => item.id === padId)

    if (!pad) {
      return
    }

    setGrid((currentGrid) =>
      currentGrid.map((laneSlots, currentLaneIndex) =>
        laneSlots.map((slot, currentStepIndex) =>
          currentLaneIndex === laneIndex && currentStepIndex === stepIndex
            ? {
                id: `${pad.id}-${laneIndex}-${stepIndex}-${Date.now()}`,
                padId: pad.id,
                repeat: slot?.repeat ?? 1,
              }
            : slot,
        ),
      ),
    )
    setSelectedSlot({ laneIndex, stepIndex })
  }

  const updateSelectedRepeat = (repeat) => {
    if (!selectedSlot) {
      return
    }

    setGrid((currentGrid) =>
      currentGrid.map((laneSlots, laneIndex) =>
        laneSlots.map((slot, stepIndex) =>
          laneIndex === selectedSlot.laneIndex && stepIndex === selectedSlot.stepIndex && slot
            ? { ...slot, repeat }
            : slot,
        ),
      ),
    )
  }

  const clearSelectedSlot = () => {
    if (!selectedSlot) {
      return
    }

    setGrid((currentGrid) =>
      currentGrid.map((laneSlots, laneIndex) =>
        laneSlots.map((slot, stepIndex) =>
          laneIndex === selectedSlot.laneIndex && stepIndex === selectedSlot.stepIndex ? null : slot,
        ),
      ),
    )
    setSelectedSlot(null)
  }

  const handleSplice = () => {
    if (!selectedPad) {
      return
    }

    const baseSample = samples.find((sample) => sample.sampleId === selectedPad.sampleId)

    if (!baseSample) {
      return
    }

    const spliceParts = [
      { id: 'start', label: `${baseSample.label}A`, start: 0 },
      { id: 'mid', label: `${baseSample.label}B`, start: 1 / 3 },
      { id: 'end', label: `${baseSample.label}C`, start: 2 / 3 },
    ].map((part, index) => ({
      id: `${baseSample.sampleId}-${part.id}`,
      sampleId: baseSample.sampleId,
      label: part.label,
      name: part.id,
      bpm: baseSample.bpm,
      url: baseSample.url,
      color: SAMPLER_COLORS[(samples.indexOf(baseSample) + index + 2) % SAMPLER_COLORS.length],
      chunk: { start: part.start, length: 1 / 3 },
    }))

    setPieces((currentPieces) => [
      ...currentPieces.filter((piece) => piece.sampleId !== baseSample.sampleId),
      ...spliceParts,
    ])
    setSelectedPadId(spliceParts[0].id)
  }

  useEffect(() => {
    loopRef.current = isLooping
  }, [isLooping])

  useEffect(() => {
    gridRef.current = grid
  }, [grid])

  useEffect(() => () => stopPlayback(), [stopPlayback])

  return (
    <main className="sampler-shell">
      <header className="sampler-hero">
        <div>
          <h1>Sampler</h1>
        </div>

        <nav className="app-switch-group" aria-label="Open app">
          <a href="#note-game" className="app-switch-button" onClick={onOpenNoteGame}>
            Game
          </a>
          <a href="#pad" className="app-switch-button" onClick={onOpenChordPad}>
            Chord Pad
          </a>
          <a href="#groovebox" className="app-switch-button" onClick={onOpenGroovebox}>
            Groovebox
          </a>
        </nav>
      </header>

      <section className="sampler-workspace">
        <div className="sampler-pad-bank" aria-label="Sample pads">
          {pads.map((pad) => (
            <button
              key={pad.id}
              type="button"
              className={`sampler-source-pad ${selectedPadId === pad.id ? 'active' : ''}`}
              style={{ '--sample-color': pad.color }}
              draggable
              onClick={() => {
                setSelectedPadId(pad.id)
                void playSamplerPad(pad)
              }}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', pad.id)
                setSelectedPadId(pad.id)
              }}
            >
              <strong>{pad.label}</strong>
              <span>{pad.name}</span>
            </button>
          ))}
        </div>

        <div className="sampler-lane-board">
          <div className="sampler-step-numbers" aria-hidden="true">
            <span />
            {Array.from({ length: SAMPLER_STEP_COUNT }, (_, index) => (
              <strong key={index}>{index + 1}</strong>
            ))}
          </div>

          {SAMPLER_LANES.map((lane, laneIndex) => (
            <div key={lane.id} className="sampler-lane" style={{ '--lane-color': lane.color }}>
              <button
                type="button"
                className="sampler-lane-label"
                onClick={() => selectedPad && void playSamplerPad(selectedPad, lane)}
              >
                {lane.label}
              </button>

              {grid[laneIndex].map((slot, stepIndex) => {
                const pad = slot ? pads.find((item) => item.id === slot.padId) : null
                const isSelected =
                  selectedSlot?.laneIndex === laneIndex && selectedSlot?.stepIndex === stepIndex

                return (
                  <button
                    key={`${lane.id}-${stepIndex}`}
                    type="button"
                    className={[
                      'sampler-slot',
                      slot ? 'filled' : '',
                      isSelected ? 'selected' : '',
                      currentStep === stepIndex ? 'playing' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ '--sample-color': pad?.color ?? lane.color }}
                    onClick={() => {
                      setSelectedSlot({ laneIndex, stepIndex })

                      if (pad) {
                        void playSamplerPad(pad, lane)
                      } else if (selectedPad) {
                        placePad(laneIndex, stepIndex, selectedPad.id)
                      }
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault()
                      placePad(laneIndex, stepIndex, event.dataTransfer.getData('text/plain'))
                    }}
                    aria-label={`${lane.label} step ${stepIndex + 1}`}
                  >
                    {pad ? (
                      <>
                        <strong>{pad.label}</strong>
                        <span>{'•'.repeat(slot.repeat)}</span>
                      </>
                    ) : (
                      <span>+</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <aside className="sampler-tools" aria-label="Sampler controls">
          <div className="sampler-transport">
            <button
              type="button"
              className={`sampler-play-button ${isPlaying ? 'stop' : 'play'}`}
              onClick={() => (isPlaying ? stopPlayback() : void startPlayback())}
            >
              {isPlaying ? 'Stop' : 'Play'}
            </button>
            <button
              type="button"
              className={`sampler-loop-button ${isLooping ? 'active' : ''}`}
              onClick={() => setIsLooping((current) => !current)}
              aria-pressed={isLooping}
            >
              Loop
            </button>
          </div>

          <label className="sampler-control">
            <span>Speed</span>
            <input
              type="range"
              min="90"
              max="190"
              value={tempo}
              onChange={(event) => setTempo(Number(event.target.value))}
            />
            <strong>{tempo}</strong>
          </label>

          <div className="sampler-repeat-box">
            <span>Repeat</span>
            <div>
              {[1, 2, 4].map((repeat) => (
                <button
                  key={repeat}
                  type="button"
                  className={selectedPlacedSlot?.repeat === repeat ? 'active' : ''}
                  onClick={() => updateSelectedRepeat(repeat)}
                  disabled={!selectedPlacedSlot}
                >
                  {'•'.repeat(repeat)}
                </button>
              ))}
            </div>
          </div>

          <div className="sampler-action-row">
            <button type="button" onClick={handleSplice} disabled={!selectedPad}>
              Split
            </button>
            <button
              type="button"
              onClick={() => {
                stopPlayback()
                setGrid(createEmptySamplerGrid())
                setSelectedSlot(null)
              }}
            >
              Clear
            </button>
            <button type="button" onClick={clearSelectedSlot} disabled={!selectedPlacedSlot}>
              Empty
            </button>
          </div>
        </aside>
      </section>
    </main>
  )
}

function GrooveboxApp({ onOpenChordPad, onOpenSampler, onOpenNoteGame }) {
  const [bassTracks, setBassTracks] = useState(INITIAL_BASS_TRACKS)
  const [melodyTracks, setMelodyTracks] = useState(INITIAL_MELODY_TRACKS)
  const [drums, setDrums] = useState(INITIAL_DRUMS)
  const [drumMixer, setDrumMixer] = useState(createDrumMixerState())
  const [chordSteps, setChordSteps] = useState(INITIAL_CHORD_STEPS)
  const [chordPresetId, setChordPresetId] = useState('cloud')
  const [chordMuted, setChordMuted] = useState(false)
  const [chordVolume, setChordVolume] = useState(DEFAULT_LANE_VOLUME)
  const [selectedTrackRef, setSelectedTrackRef] = useState({
    kind: 'bass',
    id: INITIAL_BASS_TRACKS[0].id,
  })
  const [selectedStep, setSelectedStep] = useState(0)
  const [selectedChordStep, setSelectedChordStep] = useState(0)
  const [selectedSteps, setSelectedSteps] = useState([
    createStepSelection('bass', INITIAL_BASS_TRACKS[0].id, 0),
  ])
  const [currentStep, setCurrentStep] = useState(-1)
  const [bpm, setBpm] = useState(134)
  const [patternLength, setPatternLength] = useState(STEP_COUNT)
  const [isPlaying, setIsPlaying] = useState(false)
  const [drive, setDrive] = useState(0.32)
  const [volume, setVolume] = useState(0.62)
  const [tone, setTone] = useState(DEFAULT_SOUND_MACROS.tone)
  const [punch, setPunch] = useState(DEFAULT_SOUND_MACROS.punch)
  const [space, setSpace] = useState(DEFAULT_SOUND_MACROS.space)
  const [motion, setMotion] = useState(DEFAULT_SOUND_MACROS.motion)
  const [width, setWidth] = useState(DEFAULT_SOUND_MACROS.width)
  const [effectSceneId, setEffectSceneId] = useState(DEFAULT_EFFECT_SCENE_ID)
  const [isNotePaintMode, setIsNotePaintMode] = useState(false)
  const [selectedScaleId, setSelectedScaleId] = useState(SCALE_OPTIONS[0].id)
  const [userPresets, setUserPresets] = useState(readUserPresets)
  const [selectedUserPresetId, setSelectedUserPresetId] = useState(
    () => readUserPresets()[0]?.id ?? '',
  )
  const [presetName, setPresetName] = useState('')
  const [selectedPadId, setSelectedPadId] = useState('c')
  const [selectedNoteCategoryId, setSelectedNoteCategoryId] = useState(
    NOTE_MENU_CATEGORIES[1].id,
  )
  const [noteMenu, setNoteMenu] = useState(null)
  const [chordMenu, setChordMenu] = useState(null)
  const [activeNoteShortcutRow, setActiveNoteShortcutRow] = useState(null)

  const audioContextRef = useRef(null)
  const masterGainRef = useRef(null)
  const masterBusRef = useRef(null)
  const noiseBufferRef = useRef(null)
  const audioProfileRef = useRef(getAudioProfile())
  const distortionCurveCacheRef = useRef(createDistortionCurveCache())
  const playbackStepRef = useRef(-1)
  const nextStepTimeRef = useRef(0)
  const schedulerTimeoutRef = useRef(null)
  const bassTracksRef = useRef(bassTracks)
  const melodyTracksRef = useRef(melodyTracks)
  const drumsRef = useRef(drums)
  const drumMixerRef = useRef(drumMixer)
  const chordStepsRef = useRef(chordSteps)
  const chordPresetIdRef = useRef(chordPresetId)
  const chordMutedRef = useRef(chordMuted)
  const chordVolumeRef = useRef(chordVolume)
  const scheduleStepPlaybackRef = useRef(() => {})
  const bassCounterRef = useRef(INITIAL_BASS_TRACKS.length + 1)
  const melodyCounterRef = useRef(INITIAL_MELODY_TRACKS.length + 1)
  const noteMenuRef = useRef(null)
  const chordMenuRef = useRef(null)
  const handleNoteAssignRef = useRef(() => {})
  const visibleNoteRowsRef = useRef([])
  const keyboardNoteShortcutRef = useRef({
    letter: null,
    octave: null,
    lastNoteId: null,
  })
  const synthDragRef = useRef(null)
  const drumPaintRef = useRef(null)
  const selectionAnchorRef = useRef(
    createStepSelection('bass', INITIAL_BASS_TRACKS[0].id, 0),
  )
  const makeNiceCounterRef = useRef(0)
  const suppressStepClickRef = useRef(false)

  const selectedTracks = selectedTrackRef.kind === 'bass' ? bassTracks : melodyTracks
  const selectedTrack =
    selectedTracks.find((track) => track.id === selectedTrackRef.id) ?? selectedTracks[0]
  const selectedStepIndex = selectedTrack?.steps.length ? selectedStep % selectedTrack.steps.length : 0
  const selectedNoteId = selectedTrack?.steps[selectedStepIndex] ?? 'rest'
  const selectedStepKeys = new Set(selectedSteps.map(stepSelectionKey))
  const selectedStepCount = selectedSteps.length
  const selectedChordId = chordSteps[selectedChordStep] ?? 'rest'
  const selectedPad = PAD_OPTIONS.find((option) => option.id === selectedPadId) ?? PAD_OPTIONS[0]
  const selectedRootSemitone = selectedPad.semitone
  const selectedNoteCategory =
    NOTE_MENU_CATEGORIES.find((item) => item.id === selectedNoteCategoryId) ??
    NOTE_MENU_CATEGORIES[0]
  const visibleNoteOptions = NOTE_OPTIONS.filter((note) => {
    const midiNumber = NOTE_ID_TO_MIDI_NUMBER.get(note.id)

    return (
      midiNumber !== undefined &&
      midiNumber >= selectedNoteCategory.min &&
      midiNumber <= selectedNoteCategory.max
    )
  })
  const visibleNoteRows = Array.from({ length: NOTE_MENU_ROW_COUNT }, (_, rowIndex) =>
    visibleNoteOptions.slice(
      rowIndex * NOTE_MENU_COLUMN_COUNT,
      rowIndex * NOTE_MENU_COLUMN_COUNT + NOTE_MENU_COLUMN_COUNT,
    ),
  )
  const patternStepCount = patternLength
  const activeEffectScene = findEffectScene(effectSceneId)
  const soundMacros = {
    tone,
    punch,
    space: Math.min(1, space * activeEffectScene.space),
    motion: Math.min(1, motion * activeEffectScene.motion),
    width: Math.min(1, width * activeEffectScene.width),
    dirt: Math.min(1, drive * activeEffectScene.dirt),
  }

  const applyMasterBusSettings = useCallback(() => {
    const context = audioContextRef.current
    const masterBus = masterBusRef.current

    if (!context || !masterBus) {
      return
    }

    const scene = findEffectScene(effectSceneId)
    const now = context.currentTime
    const macroDirt = Math.min(1, drive * scene.dirt)
    const macroTone = tone * 2 - 1
    const macroPunch = punch

    masterBus.input.gain.setTargetAtTime(volume, now, 0.02)
    masterBus.color.curve = createMasterSaturationCurve(macroDirt)
    masterBus.low.gain.setTargetAtTime(scene.lows + (1 - tone) * 1.8, now, 0.025)
    masterBus.body.gain.setTargetAtTime(scene.body + macroPunch * 1.2, now, 0.025)
    masterBus.air.gain.setTargetAtTime(scene.air + macroTone * 2.4, now, 0.025)
    masterBus.compressor.threshold.setTargetAtTime(-20 + macroPunch * 4, now, 0.025)
    masterBus.compressor.ratio.setTargetAtTime(3.2 + macroPunch * 3 * scene.compressor, now, 0.025)
    masterBus.compressor.attack.setTargetAtTime(0.012 - macroPunch * 0.009, now, 0.025)
    masterBus.compressor.release.setTargetAtTime(0.26 - macroPunch * 0.11, now, 0.025)
    masterBus.limiter.threshold.setTargetAtTime(-0.8, now, 0.02)
  }, [drive, effectSceneId, punch, tone, volume])

  const ensureAudio = async () => {
    if (!audioContextRef.current) {
      const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext

      if (!AudioContextConstructor) {
        throw new Error('Web Audio is not available in this browser.')
      }

      const context = new AudioContextConstructor({
        latencyHint: audioProfileRef.current.latencyHint,
      })
      const masterGain = context.createGain()
      const color = context.createWaveShaper()
      const low = context.createBiquadFilter()
      const body = context.createBiquadFilter()
      const air = context.createBiquadFilter()
      const compressor = context.createDynamicsCompressor()
      const limiter = context.createDynamicsCompressor()

      low.type = 'lowshelf'
      low.frequency.value = 120
      body.type = 'peaking'
      body.frequency.value = 760
      body.Q.value = 0.9
      air.type = 'highshelf'
      air.frequency.value = 5200

      color.oversample = audioProfileRef.current.distortionOversample

      compressor.knee.value = 18
      limiter.threshold.value = -0.8
      limiter.knee.value = 0
      limiter.ratio.value = 20
      limiter.attack.value = 0.001
      limiter.release.value = 0.08

      masterGain.gain.value = volume
      masterGain
        .connect(color)
        .connect(low)
        .connect(body)
        .connect(air)
        .connect(compressor)
        .connect(limiter)
        .connect(context.destination)

      audioContextRef.current = context
      masterGainRef.current = masterGain
      masterBusRef.current = {
        input: masterGain,
        color,
        low,
        body,
        air,
        compressor,
        limiter,
      }
      noiseBufferRef.current = createNoiseBuffer(context)
      applyMasterBusSettings()
    }

    if (audioContextRef.current.state !== 'running') {
      await audioContextRef.current.resume()
    }

    if (audioContextRef.current.state !== 'running') {
      console.warn('Audio context did not start. Try clicking once more.')
    }

    return audioContextRef.current
  }

  useEffect(() => {
    applyMasterBusSettings()
  }, [applyMasterBusSettings])

  useEffect(() => {
    bassTracksRef.current = bassTracks
  }, [bassTracks])

  useEffect(() => {
    melodyTracksRef.current = melodyTracks
  }, [melodyTracks])

  useEffect(() => {
    drumsRef.current = drums
  }, [drums])

  useEffect(() => {
    drumMixerRef.current = drumMixer
  }, [drumMixer])

  useEffect(() => {
    chordStepsRef.current = chordSteps
  }, [chordSteps])

  useEffect(() => {
    chordPresetIdRef.current = chordPresetId
  }, [chordPresetId])

  useEffect(() => {
    chordMutedRef.current = chordMuted
  }, [chordMuted])

  useEffect(() => {
    chordVolumeRef.current = chordVolume
  }, [chordVolume])

  useEffect(() => {
    return () => {
      if (schedulerTimeoutRef.current) {
        window.clearTimeout(schedulerTimeoutRef.current)
      }

      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  useEffect(() => {
    if (!noteMenu) {
      return undefined
    }

    const handlePointerDown = (event) => {
      if (noteMenuRef.current?.contains(event.target)) {
        return
      }

      setNoteMenu(null)
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setNoteMenu(null)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [noteMenu])

  useEffect(() => {
    if (!chordMenu) {
      return undefined
    }

    const handlePointerDown = (event) => {
      if (chordMenuRef.current?.contains(event.target)) {
        return
      }

      setChordMenu(null)
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setChordMenu(null)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [chordMenu])

  useEffect(() => {
    const stopPointerDrag = (event) => {
      const synthDrag = synthDragRef.current

      if (synthDrag?.type === 'select' && synthDrag.moved) {
        setActiveNoteShortcutRow(null)
        setNoteMenu(getNoteMenuPosition(event.clientY + 12, event.clientX - 12))
      }

      synthDragRef.current = null
      drumPaintRef.current = null
      window.setTimeout(() => {
        suppressStepClickRef.current = false
      }, 0)
    }

    window.addEventListener('pointerup', stopPointerDrag)
    window.addEventListener('pointercancel', stopPointerDrag)

    return () => {
      window.removeEventListener('pointerup', stopPointerDrag)
      window.removeEventListener('pointercancel', stopPointerDrag)
    }
  }, [])

  const getStepDuration = () => 60 / bpm / STEP_INTERVAL_DIVISOR

  const playSynthVoice = (
    noteId,
    presetId,
    scheduledTime,
    laneVolume = DEFAULT_LANE_VOLUME,
  ) => {
    const note = findNote(noteId)
    const preset = findPreset(presetId)
    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    const outputLevel = Math.max(0, laneVolume)

    if (!context || !masterGain || !note.frequency || outputLevel <= 0) {
      return
    }

    const startTime = scheduledTime ?? context.currentTime + 0.01
    const isBassVoice = preset.role === 'bass'
    const macroTone = soundMacros.tone
    const macroPunch = soundMacros.punch
    const macroSpace = soundMacros.space
    const macroMotion = soundMacros.motion
    const macroWidth = soundMacros.width
    const macroDirt = soundMacros.dirt
    const duration = Math.max(
      getStepDuration() * (0.72 + macroPunch * 0.34),
      preset.decay * (1.12 - macroPunch * 0.28),
    )
    const envelope = context.createGain()
    const filter = context.createBiquadFilter()
    const shaper = context.createWaveShaper()
    const panner =
      typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null
    const cleanupNodes = []

    filter.type = preset.filterType
    const cutoff = Math.max(90, preset.cutoff * (0.55 + macroTone * 1.25))
    const envelopeAmount = preset.envAmount * (0.55 + macroPunch * 0.9)
    const filterFloor = Math.max(120, cutoff * preset.filterFloorRatio * (0.86 + macroTone * 0.2))

    filter.frequency.setValueAtTime(cutoff, startTime)
    filter.frequency.linearRampToValueAtTime(
      Math.min(18000, cutoff + envelopeAmount),
      startTime + 0.025,
    )
    filter.frequency.exponentialRampToValueAtTime(
      filterFloor,
      startTime + duration,
    )
    filter.Q.setValueAtTime(preset.resonance * (0.82 + macroTone * 0.34), startTime)

    envelope.gain.setValueAtTime(0.0001, startTime)
    envelope.gain.linearRampToValueAtTime(
      preset.gain * outputLevel * (0.86 + macroPunch * 0.22),
      startTime + Math.max(0.002, preset.attack * (1.25 - macroPunch * 0.55)),
    )
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, preset.gain * preset.sustainLevel * outputLevel),
      startTime + duration * 0.5,
    )
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

    shaper.curve = distortionCurveCacheRef.current.get(macroDirt * preset.driveAmount)
    shaper.oversample = audioProfileRef.current.distortionOversample

    if (panner) {
      const panWidth = isBassVoice ? Math.min(macroWidth, 0.25) : macroWidth
      panner.pan.setValueAtTime((preset.pan ?? 0) * (0.35 + panWidth * 1.5), startTime)
    }

    const mainOscillator = context.createOscillator()
    mainOscillator.type = preset.waveform
    mainOscillator.frequency.setValueAtTime(note.frequency, startTime)

    const detunedOscillator = context.createOscillator()
    detunedOscillator.type = preset.waveform
    detunedOscillator.frequency.setValueAtTime(note.frequency, startTime)
    detunedOscillator.detune.setValueAtTime(preset.detune * (0.7 + macroMotion * 0.75), startTime)

    const harmonicOscillator = context.createOscillator()
    harmonicOscillator.type = preset.harmonicWaveform
    harmonicOscillator.frequency.setValueAtTime(
      note.frequency * preset.harmonicRatio,
      startTime,
    )
    harmonicOscillator.detune.setValueAtTime(preset.harmonicDetune, startTime)

    const subOscillator = context.createOscillator()
    subOscillator.type = preset.subWaveform
    subOscillator.frequency.setValueAtTime(
      note.frequency / 2,
      startTime,
    )

    if (preset.vibratoDepth > 0 && preset.vibratoRate > 0) {
      const vibrato = context.createOscillator()
      const vibratoGain = context.createGain()

      vibrato.type = 'sine'
      vibrato.frequency.setValueAtTime(preset.vibratoRate, startTime)
      vibratoGain.gain.setValueAtTime(0, startTime)
      vibratoGain.gain.linearRampToValueAtTime(
        preset.vibratoDepth * (0.45 + macroMotion * 1.3),
        startTime + Math.min(0.08, duration * 0.35),
      )

      vibrato.connect(vibratoGain)
      vibratoGain.connect(mainOscillator.detune)
      vibratoGain.connect(detunedOscillator.detune)
      vibratoGain.connect(harmonicOscillator.detune)

      vibrato.start(startTime)
      vibrato.stop(startTime + duration)
      cleanupNodes.push(vibrato, vibratoGain)
    }

    const detuneGain = context.createGain()
    detuneGain.gain.value = preset.detuneLevel * (0.75 + macroMotion * 0.7)

    const harmonicGain = context.createGain()
    harmonicGain.gain.value = preset.harmonicLevel

    const subGain = context.createGain()
    subGain.gain.value = preset.subLevel

    mainOscillator.connect(filter)
    detunedOscillator.connect(detuneGain).connect(filter)
    harmonicOscillator.connect(harmonicGain).connect(filter)
    subOscillator.connect(subGain).connect(filter)

    if (preset.noiseLevel > 0 && noiseBufferRef.current) {
      const noise = context.createBufferSource()
      const noiseFilter = context.createBiquadFilter()
      const noiseGain = context.createGain()

      noise.buffer = noiseBufferRef.current
      noise.loop = true
      noiseFilter.type = preset.noiseFilterType
      noiseFilter.frequency.setValueAtTime(preset.noiseCutoff, startTime)
      noiseGain.gain.setValueAtTime(preset.noiseLevel, startTime)

      noise.connect(noiseFilter).connect(noiseGain).connect(filter)
      noise.start(startTime)
      noise.stop(startTime + duration)
      cleanupNodes.push(noise, noiseFilter, noiseGain)
    }

    filter.connect(shaper).connect(envelope)

    if (panner) {
      envelope.connect(panner).connect(masterGain)
    } else {
      envelope.connect(masterGain)
    }

    if (preset.delayLevel > 0 || macroSpace > 0.04) {
      const delay = context.createDelay(1)
      const feedback = context.createGain()
      const delayWet = context.createGain()

      delay.delayTime.setValueAtTime(preset.delayTime, startTime)
      feedback.gain.setValueAtTime(
        Math.min(0.72, preset.delayFeedback + macroSpace * 0.18),
        startTime,
      )
      delayWet.gain.setValueAtTime(
        Math.min(0.42, preset.delayLevel + macroSpace * (isBassVoice ? 0.045 : 0.16)),
        startTime,
      )

      envelope.connect(delay)
      delay.connect(feedback).connect(delay)
      delay.connect(delayWet).connect(masterGain)
      cleanupNodes.push(delay, feedback, delayWet)
    }

    mainOscillator.start(startTime)
    detunedOscillator.start(startTime)
    harmonicOscillator.start(startTime)
    subOscillator.start(startTime)

    mainOscillator.stop(startTime + duration)
    detunedOscillator.stop(startTime + duration)
    harmonicOscillator.stop(startTime + duration)
    subOscillator.stop(startTime + duration)

    cleanupNodes.push(
      mainOscillator,
      detunedOscillator,
      harmonicOscillator,
      subOscillator,
      detuneGain,
      harmonicGain,
      subGain,
      filter,
      shaper,
      envelope,
      panner,
    )

    subOscillator.onended = () => {
      window.setTimeout(() => {
        cleanupNodes.forEach((node) => {
          if (node && typeof node.disconnect === 'function') {
            node.disconnect()
          }
        })
      }, preset.delayLevel > 0 ? Math.ceil((preset.delayTime * 4 + 0.2) * 1000) : 0)
    }
  }

  const playChordStep = (
    chordId,
    scheduledTime,
    presetId = chordPresetIdRef.current,
    laneVolume = chordVolumeRef.current,
  ) => {
    chordNoteIdsForChordId(chordId, selectedRootSemitone, selectedScaleId).forEach(
      (noteId) => {
        playSynthVoice(noteId, presetId, scheduledTime, laneVolume)
      },
    )
  }

  const playKick = (scheduledTime, laneVolume = DEFAULT_LANE_VOLUME) => {
    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    const outputLevel = Math.max(0, laneVolume)

    if (!context || !masterGain || outputLevel <= 0) {
      return
    }

    const startTime = scheduledTime ?? context.currentTime + 0.01
    const oscillator = context.createOscillator()
    const clickOscillator = context.createOscillator()
    const envelope = context.createGain()
    const clickEnvelope = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(152, startTime)
    oscillator.frequency.exponentialRampToValueAtTime(43, startTime + 0.22)

    envelope.gain.setValueAtTime(0.0001, startTime)
    envelope.gain.linearRampToValueAtTime(0.95 * outputLevel, startTime + 0.005)
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.24)

    clickOscillator.type = 'triangle'
    clickOscillator.frequency.setValueAtTime(680, startTime)
    clickEnvelope.gain.setValueAtTime(0.0001, startTime)
    clickEnvelope.gain.linearRampToValueAtTime(0.28 * outputLevel, startTime + 0.001)
    clickEnvelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.03)

    oscillator.connect(envelope).connect(masterGain)
    clickOscillator.connect(clickEnvelope).connect(masterGain)

    oscillator.start(startTime)
    clickOscillator.start(startTime)
    oscillator.stop(startTime + 0.28)
    clickOscillator.stop(startTime + 0.04)
  }

  const playClap = (scheduledTime, laneVolume = DEFAULT_LANE_VOLUME) => {
    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    const noiseBuffer = noiseBufferRef.current
    const outputLevel = Math.max(0, laneVolume)

    if (!context || !masterGain || !noiseBuffer || outputLevel <= 0) {
      return
    }

    const startTime = scheduledTime ?? context.currentTime + 0.01
    const noise = context.createBufferSource()
    const highpass = context.createBiquadFilter()
    const bandpass = context.createBiquadFilter()
    const envelope = context.createGain()

    noise.buffer = noiseBuffer
    highpass.type = 'highpass'
    highpass.frequency.value = 900
    bandpass.type = 'bandpass'
    bandpass.frequency.value = 1700
    bandpass.Q.value = 0.8

    envelope.gain.setValueAtTime(0.0001, startTime)
    envelope.gain.linearRampToValueAtTime(0.75 * outputLevel, startTime + 0.001)
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.02)
    envelope.gain.setValueAtTime(0.42 * outputLevel, startTime + 0.024)
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.055)
    envelope.gain.setValueAtTime(0.27 * outputLevel, startTime + 0.06)
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12)

    noise.connect(highpass).connect(bandpass).connect(envelope).connect(masterGain)

    noise.start(startTime)
    noise.stop(startTime + 0.14)
  }

  const playHat = (scheduledTime, laneVolume = DEFAULT_LANE_VOLUME) => {
    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    const noiseBuffer = noiseBufferRef.current
    const outputLevel = Math.max(0, laneVolume)

    if (!context || !masterGain || !noiseBuffer || outputLevel <= 0) {
      return
    }

    const startTime = scheduledTime ?? context.currentTime + 0.01
    const noise = context.createBufferSource()
    const highpass = context.createBiquadFilter()
    const envelope = context.createGain()

    noise.buffer = noiseBuffer
    highpass.type = 'highpass'
    highpass.frequency.value = 7200

    envelope.gain.setValueAtTime(0.0001, startTime)
    envelope.gain.linearRampToValueAtTime(0.22 * outputLevel, startTime + 0.001)
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.06)

    noise.connect(highpass).connect(envelope).connect(masterGain)

    noise.start(startTime)
    noise.stop(startTime + 0.08)
  }

  const playOpenHat = (scheduledTime, laneVolume = DEFAULT_LANE_VOLUME) => {
    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    const noiseBuffer = noiseBufferRef.current
    const outputLevel = Math.max(0, laneVolume)

    if (!context || !masterGain || !noiseBuffer || outputLevel <= 0) {
      return
    }

    const startTime = scheduledTime ?? context.currentTime + 0.01
    const noise = context.createBufferSource()
    const highpass = context.createBiquadFilter()
    const shimmer = context.createBiquadFilter()
    const envelope = context.createGain()

    noise.buffer = noiseBuffer
    highpass.type = 'highpass'
    highpass.frequency.value = 5200
    shimmer.type = 'bandpass'
    shimmer.frequency.value = 7600
    shimmer.Q.value = 1.3

    envelope.gain.setValueAtTime(0.0001, startTime)
    envelope.gain.linearRampToValueAtTime(0.24 * outputLevel, startTime + 0.002)
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22)

    noise.connect(highpass).connect(shimmer).connect(envelope).connect(masterGain)

    noise.start(startTime)
    noise.stop(startTime + 0.24)
  }

  const playShaker = (scheduledTime, laneVolume = DEFAULT_LANE_VOLUME) => {
    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    const noiseBuffer = noiseBufferRef.current
    const outputLevel = Math.max(0, laneVolume)

    if (!context || !masterGain || !noiseBuffer || outputLevel <= 0) {
      return
    }

    const startTime = scheduledTime ?? context.currentTime + 0.01
    const noise = context.createBufferSource()
    const bandpass = context.createBiquadFilter()
    const envelope = context.createGain()

    noise.buffer = noiseBuffer
    bandpass.type = 'bandpass'
    bandpass.frequency.value = 3400
    bandpass.Q.value = 1.4

    envelope.gain.setValueAtTime(0.0001, startTime)
    envelope.gain.linearRampToValueAtTime(0.2 * outputLevel, startTime + 0.001)
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.045)

    noise.connect(bandpass).connect(envelope).connect(masterGain)

    noise.start(startTime)
    noise.stop(startTime + 0.06)
  }

  const playRim = (scheduledTime, laneVolume = DEFAULT_LANE_VOLUME) => {
    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    const outputLevel = Math.max(0, laneVolume)

    if (!context || !masterGain || outputLevel <= 0) {
      return
    }

    const startTime = scheduledTime ?? context.currentTime + 0.01
    const oscillator = context.createOscillator()
    const bandpass = context.createBiquadFilter()
    const envelope = context.createGain()

    oscillator.type = 'square'
    oscillator.frequency.setValueAtTime(1260, startTime)
    bandpass.type = 'bandpass'
    bandpass.frequency.value = 1600
    bandpass.Q.value = 4

    envelope.gain.setValueAtTime(0.0001, startTime)
    envelope.gain.linearRampToValueAtTime(0.28 * outputLevel, startTime + 0.001)
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.05)

    oscillator.connect(bandpass).connect(envelope).connect(masterGain)

    oscillator.start(startTime)
    oscillator.stop(startTime + 0.06)
  }

  const playTom = (scheduledTime, laneVolume = DEFAULT_LANE_VOLUME) => {
    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    const outputLevel = Math.max(0, laneVolume)

    if (!context || !masterGain || outputLevel <= 0) {
      return
    }

    const startTime = scheduledTime ?? context.currentTime + 0.01
    const oscillator = context.createOscillator()
    const overtone = context.createOscillator()
    const envelope = context.createGain()
    const overtoneGain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(170, startTime)
    oscillator.frequency.exponentialRampToValueAtTime(88, startTime + 0.18)

    overtone.type = 'triangle'
    overtone.frequency.setValueAtTime(260, startTime)
    overtone.frequency.exponentialRampToValueAtTime(140, startTime + 0.12)

    overtoneGain.gain.value = 0.14
    envelope.gain.setValueAtTime(0.0001, startTime)
    envelope.gain.linearRampToValueAtTime(0.46 * outputLevel, startTime + 0.002)
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.2)

    oscillator.connect(envelope)
    overtone.connect(overtoneGain).connect(envelope)
    envelope.connect(masterGain)

    oscillator.start(startTime)
    overtone.start(startTime)
    oscillator.stop(startTime + 0.22)
    overtone.stop(startTime + 0.16)
  }

  const playCrash = (scheduledTime, laneVolume = DEFAULT_LANE_VOLUME) => {
    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    const noiseBuffer = noiseBufferRef.current
    const outputLevel = Math.max(0, laneVolume)

    if (!context || !masterGain || !noiseBuffer || outputLevel <= 0) {
      return
    }

    const startTime = scheduledTime ?? context.currentTime + 0.01
    const noise = context.createBufferSource()
    const highpass = context.createBiquadFilter()
    const envelope = context.createGain()

    noise.buffer = noiseBuffer
    highpass.type = 'highpass'
    highpass.frequency.value = 4200

    envelope.gain.setValueAtTime(0.0001, startTime)
    envelope.gain.linearRampToValueAtTime(0.22 * outputLevel, startTime + 0.002)
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.42)

    noise.connect(highpass).connect(envelope).connect(masterGain)

    noise.start(startTime)
    noise.stop(startTime + 0.46)
  }

  const playDrumSound = (trackId, scheduledTime, laneVolume = DEFAULT_LANE_VOLUME) => {
    if (trackId === 'kick') {
      playKick(scheduledTime, laneVolume)
      return
    }

    if (trackId === 'clap') {
      playClap(scheduledTime, laneVolume)
      return
    }

    if (trackId === 'hat') {
      playHat(scheduledTime, laneVolume)
      return
    }

    if (trackId === 'openHat') {
      playOpenHat(scheduledTime, laneVolume)
      return
    }

    if (trackId === 'shaker') {
      playShaker(scheduledTime, laneVolume)
      return
    }

    if (trackId === 'tom') {
      playTom(scheduledTime, laneVolume)
      return
    }

    if (trackId === 'crash') {
      playCrash(scheduledTime, laneVolume)
      return
    }

    playRim(scheduledTime, laneVolume)
  }

  useEffect(() => {
    scheduleStepPlaybackRef.current = (stepIndex, scheduledTime) => {
      if (chordStepsRef.current.length && !chordMutedRef.current) {
        playChordStep(
          chordStepsRef.current[stepIndex % chordStepsRef.current.length],
          scheduledTime,
          chordPresetIdRef.current,
          chordVolumeRef.current,
        )
      }

      bassTracksRef.current.forEach((track) => {
        if (track.steps.length && !track.muted) {
          playSynthVoice(
            track.steps[stepIndex % track.steps.length],
            track.presetId,
            scheduledTime,
            track.volume,
          )
        }
      })

      melodyTracksRef.current.forEach((track) => {
        if (track.steps.length && !track.muted) {
          playSynthVoice(
            track.steps[stepIndex % track.steps.length],
            track.presetId,
            scheduledTime,
            track.volume,
          )
        }
      })

      DRUM_TRACKS.forEach((track) => {
        const drumSteps = drumsRef.current[track.id] ?? []
        const mixer = drumMixerRef.current[track.id] ?? {
          muted: false,
          volume: DEFAULT_LANE_VOLUME,
        }

        if (drumSteps.length && drumSteps[stepIndex % drumSteps.length] && !mixer.muted) {
          playDrumSound(track.id, scheduledTime, mixer.volume)
        }
      })
    }
  })

  useEffect(() => {
    if (!isPlaying) {
      return undefined
    }

    const context = audioContextRef.current

    if (!context) {
      return undefined
    }

    const { scheduleAheadTime, lookAheadMs } = audioProfileRef.current
    const stepDuration = 60 / bpm / STEP_INTERVAL_DIVISOR

    playbackStepRef.current = 0
    nextStepTimeRef.current = context.currentTime + 0.05

    const scheduler = () => {
      while (nextStepTimeRef.current < context.currentTime + scheduleAheadTime) {
        const stepIndex = playbackStepRef.current

        setCurrentStep(stepIndex)
        scheduleStepPlaybackRef.current(stepIndex, nextStepTimeRef.current)

        playbackStepRef.current = (playbackStepRef.current + 1) % patternStepCount
        nextStepTimeRef.current += stepDuration
      }

      schedulerTimeoutRef.current = window.setTimeout(scheduler, lookAheadMs)
    }

    scheduler()

    return () => {
      if (schedulerTimeoutRef.current) {
        window.clearTimeout(schedulerTimeoutRef.current)
        schedulerTimeoutRef.current = null
      }
    }
  }, [bpm, isPlaying, patternStepCount])

  const focusStepSelection = (selection, shouldUpdateAnchor = true) => {
    setSelectedTrackRef({ kind: selection.kind, id: selection.trackId })
    setSelectedStep(selection.stepIndex)

    if (shouldUpdateAnchor) {
      selectionAnchorRef.current = selection
    }
  }

  const selectSingleStep = (kind, trackId, stepIndex) => {
    const selection = createStepSelection(kind, trackId, stepIndex)

    setSelectedSteps([selection])
    focusStepSelection(selection)
  }

  const selectStepRange = (kind, trackId, stepIndex) => {
    const anchor =
      selectionAnchorRef.current.kind === kind &&
      selectionAnchorRef.current.trackId === trackId
        ? selectionAnchorRef.current
        : createStepSelection(kind, trackId, stepIndex)
    const range = createStepSelectionRange(kind, trackId, anchor.stepIndex, stepIndex)

    setSelectedSteps(range)
    focusStepSelection(createStepSelection(kind, trackId, stepIndex), false)
  }

  const toggleStepSelection = (kind, trackId, stepIndex) => {
    const selection = createStepSelection(kind, trackId, stepIndex)
    const selectionKey = stepSelectionKey(selection)
    const isAlreadySelected = selectedStepKeys.has(selectionKey)
    const nextSelectedSteps = isAlreadySelected
      ? selectedSteps.filter((item) => stepSelectionKey(item) !== selectionKey)
      : [...selectedSteps, selection]
    const effectiveSelectedSteps = nextSelectedSteps.length ? nextSelectedSteps : [selection]
    const focusSelection = isAlreadySelected
      ? effectiveSelectedSteps[effectiveSelectedSteps.length - 1]
      : selection

    setSelectedSteps(effectiveSelectedSteps)
    focusStepSelection(focusSelection)
  }

  const getActiveStepSelections = () =>
    selectedSteps.length
      ? selectedSteps
      : [createStepSelection(selectedTrackRef.kind, selectedTrack.id, selectedStep)]

  const applyNoteToSelections = (selections, noteId) => {
    const bassSelections = selections.filter((selection) => selection.kind === 'bass')
    const melodySelections = selections.filter((selection) => selection.kind === 'melody')

    if (bassSelections.length) {
      setBassTracks((currentTracks) =>
        updateTrackStepsForSelections(currentTracks, bassSelections, noteId),
      )
    }

    if (melodySelections.length) {
      setMelodyTracks((currentTracks) =>
        updateTrackStepsForSelections(currentTracks, melodySelections, noteId),
      )
    }
  }

  const applyTrackStepNote = (kind, trackId, stepIndex, noteId) => {
    const setter = kind === 'bass' ? setBassTracks : setMelodyTracks

    setter((currentTracks) => updateTrackSteps(currentTracks, trackId, stepIndex, noteId))
  }

  useEffect(() => {
    const handleKeyDown = (event) => {
      const targetTagName = event.target?.tagName

      if (
        event.target?.isContentEditable ||
        targetTagName === 'INPUT' ||
        targetTagName === 'SELECT' ||
        targetTagName === 'TEXTAREA'
      ) {
        return
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return
      }

      const targetSelections = selectedSteps.length
        ? selectedSteps
        : selectedTrack
          ? [createStepSelection(selectedTrackRef.kind, selectedTrack.id, selectedStep)]
          : []

      if (!targetSelections.length) {
        return
      }

      event.preventDefault()
      const bassSelections = targetSelections.filter(
        (selection) => selection.kind === 'bass',
      )
      const melodySelections = targetSelections.filter(
        (selection) => selection.kind === 'melody',
      )

      if (bassSelections.length) {
        setBassTracks((currentTracks) =>
          updateTrackStepsForSelections(currentTracks, bassSelections, 'rest'),
        )
      }

      if (melodySelections.length) {
        setMelodyTracks((currentTracks) =>
          updateTrackStepsForSelections(currentTracks, melodySelections, 'rest'),
        )
      }

      setNoteMenu(null)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedStep, selectedSteps, selectedTrack, selectedTrackRef.kind])

  const handleTrackStepPointerDown = (event, kind, trackId, stepIndex, noteId) => {
    if (event.button !== 0) {
      return
    }

    if (isNotePaintMode) {
      synthDragRef.current = {
        type: 'paint',
        kind,
        trackId,
        stepIndex,
        noteId,
        moved: false,
      }
      selectSingleStep(kind, trackId, stepIndex)
      setSelectedNoteCategoryId(noteMenuCategoryFor(noteId, kind))
      setNoteMenu(null)
      return
    }

    const rangeAnchor =
      event.shiftKey &&
      selectionAnchorRef.current.kind === kind &&
      selectionAnchorRef.current.trackId === trackId
        ? selectionAnchorRef.current
        : createStepSelection(kind, trackId, stepIndex)

    synthDragRef.current = {
      type: 'select',
      kind,
      trackId,
      anchorStep: rangeAnchor.stepIndex,
      stepIndex,
      moved: false,
    }

    if (event.shiftKey) {
      selectStepRange(kind, trackId, stepIndex)
    } else if (event.metaKey || event.ctrlKey) {
      toggleStepSelection(kind, trackId, stepIndex)
    } else {
      selectSingleStep(kind, trackId, stepIndex)
    }

    setSelectedNoteCategoryId(noteMenuCategoryFor(noteId, kind))
  }

  const handleTrackStepPointerEnter = (kind, trackId, stepIndex) => {
    const synthDrag = synthDragRef.current

    if (!synthDrag || synthDrag.kind !== kind || synthDrag.trackId !== trackId) {
      return
    }

    if (
      synthDrag.stepIndex === stepIndex &&
      synthDrag.trackId === trackId &&
      synthDrag.kind === kind
    ) {
      return
    }

    synthDrag.moved = true
    synthDrag.stepIndex = stepIndex
    suppressStepClickRef.current = true

    setNoteMenu(null)

    if (synthDrag.type === 'paint') {
      const selection = createStepSelection(kind, trackId, stepIndex)

      setSelectedSteps([selection])
      focusStepSelection(selection)
      setSelectedNoteCategoryId(noteMenuCategoryFor(synthDrag.noteId, kind))
      applyTrackStepNote(kind, trackId, stepIndex, synthDrag.noteId)
      return
    }

    setSelectedSteps(
      createStepSelectionRange(kind, trackId, synthDrag.anchorStep, stepIndex),
    )
    focusStepSelection(createStepSelection(kind, trackId, stepIndex), false)
  }

  const handleTrackStepClick = async (event, kind, trackId, stepIndex) => {
    if (suppressStepClickRef.current || isNotePaintMode) {
      return
    }

    const tracks = kind === 'bass' ? bassTracks : melodyTracks
    const track = tracks.find((item) => item.id === trackId)

    if (!track) {
      return
    }

    if (event.detail === 0) {
      selectSingleStep(kind, trackId, stepIndex)
    }

    setSelectedNoteCategoryId(noteMenuCategoryFor(track.steps[stepIndex], kind))
    const rect = event.currentTarget.getBoundingClientRect()
    setActiveNoteShortcutRow(null)
    setNoteMenu(getNoteMenuPosition(rect.bottom + 10, rect.left))
    await ensureAudio()
    if (!track.muted) {
      playSynthVoice(track.steps[stepIndex], track.presetId, undefined, track.volume)
    }
  }

  const handleTrackStepClear = (event, kind, trackId, stepIndex) => {
    event.preventDefault()
    const targetSelection = createStepSelection(kind, trackId, stepIndex)

    if (selectedStepKeys.has(stepSelectionKey(targetSelection)) && selectedSteps.length > 1) {
      applyNoteToSelections(getActiveStepSelections(), 'rest')
      setNoteMenu(null)
      return
    }

    applyTrackStepNote(kind, trackId, stepIndex, 'rest')
  }

  const handleNoteAssign = async (noteId) => {
    const targetSelections = getActiveStepSelections()

    applyNoteToSelections(targetSelections, noteId)

    setNoteMenu(null)
    await ensureAudio()
    if (!selectedTrack.muted) {
      playSynthVoice(noteId, selectedTrack.presetId, undefined, selectedTrack.volume)
    }
  }

  useEffect(() => {
    handleNoteAssignRef.current = handleNoteAssign
    visibleNoteRowsRef.current = visibleNoteRows
  })

  useEffect(() => {
    if (!noteMenu) {
      return undefined
    }

    keyboardNoteShortcutRef.current = {
      letter: null,
      octave: null,
      lastNoteId: null,
    }

    const assignKeyboardChordNote = (event) => {
      const shortcut = keyboardNoteShortcutRef.current
      const noteId = noteIdForKeyboardChord(
        shortcut.letter,
        shortcut.octave,
        event.shiftKey,
      )

      if (!noteId || noteId === shortcut.lastNoteId) {
        return false
      }

      shortcut.lastNoteId = noteId
      event.preventDefault()
      handleNoteAssignRef.current(noteId)
      return true
    }

    const handleKeyDown = (event) => {
      const noteLetter = noteLetterForEvent(event)
      const octave = octaveForEvent(event)

      if (noteLetter) {
        keyboardNoteShortcutRef.current.letter = noteLetter
      }

      if (octave !== null) {
        keyboardNoteShortcutRef.current.octave = octave
      }

      if ((noteLetter || octave !== null) && assignKeyboardChordNote(event)) {
        return
      }

      const digit = shortcutDigitForEvent(event)

      setActiveNoteShortcutRow(shortcutRowForEvent(event))

      if (!digit) {
        return
      }

      const rowIndex = shortcutRowForEvent(event)
      const note = visibleNoteRowsRef.current[rowIndex]?.[digit - 1]

      if (!note) {
        return
      }

      event.preventDefault()
      handleNoteAssignRef.current(note.id)
    }

    const handleKeyUp = (event) => {
      const noteLetter = noteLetterForEvent(event)
      const octave = octaveForEvent(event)

      if (noteLetter && keyboardNoteShortcutRef.current.letter === noteLetter) {
        keyboardNoteShortcutRef.current.letter = null
        keyboardNoteShortcutRef.current.lastNoteId = null
      }

      if (octave !== null && keyboardNoteShortcutRef.current.octave === octave) {
        keyboardNoteShortcutRef.current.octave = null
        keyboardNoteShortcutRef.current.lastNoteId = null
      }

      if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
        setActiveNoteShortcutRow(shortcutRowForEvent(event))
        return
      }

      setActiveNoteShortcutRow(null)
    }

    const handleBlur = () => {
      keyboardNoteShortcutRef.current = {
        letter: null,
        octave: null,
        lastNoteId: null,
      }
      setActiveNoteShortcutRow(null)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, [noteMenu])

  const handleChordStepClick = async (event, stepIndex) => {
    if (event.detail === 0) {
      setSelectedChordStep(stepIndex)
    }

    setSelectedChordStep(stepIndex)
    setNoteMenu(null)
    const rect = event.currentTarget.getBoundingClientRect()
    setChordMenu(getNoteMenuPosition(rect.bottom + 10, rect.left))
    await ensureAudio()
    if (!chordMuted) {
      playChordStep(chordSteps[stepIndex], undefined, chordPresetId, chordVolume)
    }
  }

  const handleChordAssign = async (chordId) => {
    setChordSteps((currentSteps) =>
      currentSteps.map((currentChordId, index) =>
        index === selectedChordStep ? chordId : currentChordId,
      ),
    )
    setChordMenu(null)
    await ensureAudio()
    if (!chordMuted) {
      playChordStep(chordId, undefined, chordPresetId, chordVolume)
    }
  }

  const handleChordClear = (event, stepIndex) => {
    event.preventDefault()
    setSelectedChordStep(stepIndex)
    setChordSteps((currentSteps) =>
      currentSteps.map((currentChordId, index) =>
        index === stepIndex ? 'rest' : currentChordId,
      ),
    )
    setChordMenu(null)
  }

  const handleChordPresetChange = async (presetId) => {
    setChordPresetId(presetId)
    await ensureAudio()
    if (!chordMuted) {
      playChordStep(chordSteps[selectedChordStep], undefined, presetId, chordVolume)
    }
  }

  const handlePresetChange = async (kind, trackId, presetId) => {
    const tracks = kind === 'bass' ? bassTracks : melodyTracks
    const setter = kind === 'bass' ? setBassTracks : setMelodyTracks
    const track = tracks.find((item) => item.id === trackId)

    setter((currentTracks) =>
      currentTracks.map((item) =>
        item.id === trackId
          ? {
              ...item,
              presetId,
            }
          : item,
      ),
    )

    if (!track) {
      return
    }

    await ensureAudio()
    if (!track.muted) {
      playSynthVoice(
        track.steps[selectedStep % track.steps.length],
        presetId,
        undefined,
        track.volume,
      )
    }
  }

  const updateTrackMixer = (kind, trackId, updates) => {
    const setter = kind === 'bass' ? setBassTracks : setMelodyTracks

    setter((currentTracks) =>
      currentTracks.map((track) =>
        track.id === trackId
          ? {
              ...track,
              ...updates,
            }
          : track,
      ),
    )
  }

  const handleTrackVolumeChange = (kind, trackId, volumeValue) => {
    updateTrackMixer(kind, trackId, {
      volume: Number(volumeValue),
    })
  }

  const handleTrackMuteToggle = (kind, trackId) => {
    updateTrackMixer(kind, trackId, {
      muted: !(kind === 'bass' ? bassTracks : melodyTracks).find(
        (track) => track.id === trackId,
      )?.muted,
    })
  }

  const updateDrumMixer = (trackId, updates) => {
    setDrumMixer((currentMixer) => ({
      ...currentMixer,
      [trackId]: {
        ...(currentMixer[trackId] ?? {
          muted: false,
          volume: DEFAULT_LANE_VOLUME,
        }),
        ...updates,
      },
    }))
  }

  const handleAddTrack = (kind) => {
    if (kind === 'bass') {
      if (bassTracks.length >= MAX_BASS_VOICES) {
        return
      }

      const labelNumber = bassCounterRef.current
      const newTrack = createTrack(
        'bass',
        labelNumber,
        'synthtalk',
        createEmptySteps(patternStepCount),
      )
      bassCounterRef.current += 1
      setBassTracks((currentTracks) => [...currentTracks, newTrack])
      setSelectedSteps([createStepSelection('bass', newTrack.id, 0)])
      focusStepSelection(createStepSelection('bass', newTrack.id, 0))
      return
    }

    if (melodyTracks.length >= MAX_MELODY_VOICES) {
      return
    }

    const labelNumber = melodyCounterRef.current
    const newTrack = createTrack(
      'melody',
      labelNumber,
      'toy',
      createEmptySteps(patternStepCount),
    )
    melodyCounterRef.current += 1
    setMelodyTracks((currentTracks) => [...currentTracks, newTrack])
    setSelectedSteps([createStepSelection('melody', newTrack.id, 0)])
    focusStepSelection(createStepSelection('melody', newTrack.id, 0))
  }

  const handleRemoveTrack = (kind, trackId) => {
    const tracks = kind === 'bass' ? bassTracks : melodyTracks

    if (tracks.length === 1) {
      return
    }

    const nextTracks = tracks.filter((track) => track.id !== trackId)

    if (kind === 'bass') {
      setBassTracks(nextTracks)
    } else {
      setMelodyTracks(nextTracks)
    }

    if (selectedTrackRef.kind === kind && selectedTrackRef.id === trackId) {
      setSelectedSteps([createStepSelection(kind, nextTracks[0].id, 0)])
      focusStepSelection(createStepSelection(kind, nextTracks[0].id, 0))
    } else {
      setSelectedSteps((currentSelections) =>
        currentSelections.filter(
          (selection) => selection.kind !== kind || selection.trackId !== trackId,
        ),
      )
    }
  }

  const handlePadChange = async (nextPadId) => {
    if (nextPadId === selectedPadId) {
      return
    }

    const currentPad =
      PAD_OPTIONS.find((option) => option.id === selectedPadId) ?? PAD_OPTIONS[0]
    const nextPad =
      PAD_OPTIONS.find((option) => option.id === nextPadId) ?? PAD_OPTIONS[0]
    const semitoneOffset = nextPad.semitone - currentPad.semitone

    const nextBassTracks = transposeTrackList(bassTracks, semitoneOffset)
    const nextMelodyTracks = transposeTrackList(melodyTracks, semitoneOffset)
    const nextSelectedTracks =
      selectedTrackRef.kind === 'bass' ? nextBassTracks : nextMelodyTracks
    const nextSelectedTrack =
      nextSelectedTracks.find((track) => track.id === selectedTrackRef.id) ??
      nextSelectedTracks[0]
    const previewNoteId = nextSelectedTrack?.steps.length
      ? nextSelectedTrack.steps[selectedStep % nextSelectedTrack.steps.length]
      : 'rest'

    setBassTracks(nextBassTracks)
    setMelodyTracks(nextMelodyTracks)
    setSelectedPadId(nextPadId)
    setSelectedNoteCategoryId(
      noteMenuCategoryFor(previewNoteId, selectedTrackRef.kind),
    )

    await ensureAudio()

    if (previewNoteId !== 'rest' && nextSelectedTrack && !nextSelectedTrack.muted) {
      playSynthVoice(
        previewNoteId,
        nextSelectedTrack.presetId,
        undefined,
        nextSelectedTrack.volume,
      )
    }
  }

  const handleSaveUserPreset = () => {
    const label = presetName.trim() || `Preset ${userPresets.length + 1}`
    const nextPreset = createUserPresetSnapshot(label, {
      bpm,
      patternLength,
      drive,
      volume,
      tone,
      punch,
      space,
      motion,
      width,
      effectSceneId,
      selectedScaleId,
      selectedPadId,
      chordPresetId,
      chordMuted,
      chordVolume,
      chordSteps,
      bassTracks,
      melodyTracks,
      drums,
      drumMixer,
    })
    const nextPresets = [nextPreset, ...userPresets]

    setUserPresets(nextPresets)
    writeUserPresets(nextPresets)
    setSelectedUserPresetId(nextPreset.id)
    setPresetName('')
  }

  const handleLoadUserPreset = async () => {
    const preset = userPresets.find((item) => item.id === selectedUserPresetId)

    if (!preset) {
      return
    }

    const loaded = instantiateUserPreset(preset)
    const nextBassTracks = loaded.bassTracks
    const nextMelodyTracks = loaded.melodyTracks
    const previewTrack =
      nextMelodyTracks.find((track) => track.steps.some((noteId) => noteId !== 'rest')) ??
      nextBassTracks.find((track) => track.steps.some((noteId) => noteId !== 'rest')) ??
      nextMelodyTracks[0] ??
      nextBassTracks[0]
    const previewStepIndex = Math.max(
      0,
      previewTrack.steps.findIndex((noteId) => noteId !== 'rest'),
    )
    const previewNoteId = previewTrack.steps[previewStepIndex]

    setBpm(loaded.bpm ?? bpm)
    setPatternLength(loaded.patternLength ?? STEP_COUNT)
    setDrive(loaded.drive ?? drive)
    setVolume(loaded.volume ?? volume)
    setTone(loaded.tone ?? DEFAULT_SOUND_MACROS.tone)
    setPunch(loaded.punch ?? DEFAULT_SOUND_MACROS.punch)
    setSpace(loaded.space ?? DEFAULT_SOUND_MACROS.space)
    setMotion(loaded.motion ?? DEFAULT_SOUND_MACROS.motion)
    setWidth(loaded.width ?? DEFAULT_SOUND_MACROS.width)
    setEffectSceneId(loaded.effectSceneId ?? DEFAULT_EFFECT_SCENE_ID)
    setSelectedScaleId(loaded.selectedScaleId ?? SCALE_OPTIONS[0].id)
    setSelectedPadId(loaded.selectedPadId ?? 'c')
    setChordPresetId(loaded.chordPresetId ?? 'cloud')
    setChordMuted(Boolean(loaded.chordMuted))
    setChordVolume(loaded.chordVolume ?? DEFAULT_LANE_VOLUME)
    setChordSteps(loaded.chordSteps)
    setSelectedChordStep(0)
    setBassTracks(nextBassTracks)
    setMelodyTracks(nextMelodyTracks)
    setDrums(loaded.drums)
    setDrumMixer(loaded.drumMixer)
    setSelectedSteps([
      createStepSelection(previewTrack.kind, previewTrack.id, previewStepIndex),
    ])
    focusStepSelection(
      createStepSelection(previewTrack.kind, previewTrack.id, previewStepIndex),
    )
    setNoteMenu(null)
    setSelectedNoteCategoryId(noteMenuCategoryFor(previewNoteId, previewTrack.kind))
    bassCounterRef.current = nextBassTracks.length + 1
    melodyCounterRef.current = nextMelodyTracks.length + 1

    await ensureAudio()

    if (previewNoteId !== 'rest' && !previewTrack.muted) {
      playSynthVoice(previewNoteId, previewTrack.presetId, undefined, previewTrack.volume)
    }
  }

  const handleDeleteUserPreset = () => {
    if (!selectedUserPresetId) {
      return
    }

    const nextPresets = userPresets.filter((preset) => preset.id !== selectedUserPresetId)

    setUserPresets(nextPresets)
    writeUserPresets(nextPresets)
    setSelectedUserPresetId(nextPresets[0]?.id ?? '')
  }

  const handleResetAll = () => {
    setBassTracks((currentTracks) =>
      currentTracks.map((track) => ({
        ...track,
        steps: createEmptySteps(track.steps.length || patternStepCount),
      })),
    )
    setMelodyTracks((currentTracks) =>
      currentTracks.map((track) => ({
        ...track,
        steps: createEmptySteps(track.steps.length || patternStepCount),
      })),
    )
    setDrums(createDrumState({}, patternStepCount))
    setChordSteps(createEmptyChordSteps(patternStepCount))
    setSelectedChordStep(0)
    selectSingleStep(selectedTrackRef.kind, selectedTrack.id, 0)
    setCurrentStep(-1)
    setNoteMenu(null)
    setChordMenu(null)
    setSelectedNoteCategoryId(NOTE_MENU_CATEGORIES[1].id)
  }

  const setDrumStep = (trackId, stepIndex, nextIsActive) => {
    setDrums((currentDrums) => ({
      ...currentDrums,
      [trackId]: currentDrums[trackId].map((isActive, index) =>
        index === stepIndex ? nextIsActive : isActive,
      ),
    }))
  }

  const handleDrumToggle = async (trackId, stepIndex) => {
    const mixer = drumMixer[trackId] ?? {
      muted: false,
      volume: DEFAULT_LANE_VOLUME,
    }

    await ensureAudio()
    setDrums((currentDrums) => ({
      ...currentDrums,
      [trackId]: currentDrums[trackId].map((isActive, index) =>
        index === stepIndex ? !isActive : isActive,
      ),
    }))
    if (!mixer.muted) {
      playDrumSound(trackId, undefined, mixer.volume)
    }
  }

  const handleDrumPointerDown = async (event, trackId, stepIndex, isActive) => {
    if (event.button !== 0) {
      return
    }

    const nextIsActive = !isActive

    drumPaintRef.current = {
      trackId,
      stepIndex,
      isActive: nextIsActive,
    }

    setDrumStep(trackId, stepIndex, nextIsActive)
    await ensureAudio()

    if (nextIsActive) {
      const mixer = drumMixer[trackId] ?? {
        muted: false,
        volume: DEFAULT_LANE_VOLUME,
      }

      if (!mixer.muted) {
        playDrumSound(trackId, undefined, mixer.volume)
      }
    }
  }

  const handleDrumPointerEnter = (trackId, stepIndex) => {
    const drumPaint = drumPaintRef.current

    if (!drumPaint || drumPaint.trackId !== trackId || drumPaint.stepIndex === stepIndex) {
      return
    }

    drumPaint.stepIndex = stepIndex
    setDrumStep(trackId, stepIndex, drumPaint.isActive)
  }

  const handlePlaybackToggle = async () => {
    if (isPlaying) {
      setIsPlaying(false)
      playbackStepRef.current = -1
      setCurrentStep(-1)
      return
    }

    await ensureAudio()
    playbackStepRef.current = -1
    setIsPlaying(true)
  }

  const handleBpmChange = (event) => {
    const nextBpm = Number(event.target.value)
    setBpm(Math.min(220, Math.max(60, nextBpm || 60)))
  }

  const handlePatternLengthChange = (event) => {
    const nextLength = clampPatternLength(event.target.value)

    setPatternLength(nextLength)
    setChordSteps((currentSteps) => resizeList(currentSteps, nextLength, 'rest'))
    setBassTracks((currentTracks) => resizeTrackSteps(currentTracks, nextLength))
    setMelodyTracks((currentTracks) => resizeTrackSteps(currentTracks, nextLength))
    setDrums((currentDrums) => resizeDrumState(currentDrums, nextLength))
    setCurrentStep(-1)
    setSelectedStep((currentStepIndex) => Math.min(currentStepIndex, nextLength - 1))
    setSelectedChordStep((currentStepIndex) => Math.min(currentStepIndex, nextLength - 1))
    setSelectedSteps((currentSelections) => {
      const nextSelections = currentSelections.filter(
        (selection) => selection.stepIndex < nextLength,
      )

      return nextSelections.length
        ? nextSelections
        : [createStepSelection(selectedTrackRef.kind, selectedTrack.id, 0)]
    })
  }

  const handleScaleChange = (event) => {
    const nextScaleId = event.target.value
    const nextSelectedNoteId = snapNoteIdToScale(
      selectedNoteId,
      selectedRootSemitone,
      nextScaleId,
    )

    setSelectedScaleId(nextScaleId)
    setSelectedNoteCategoryId(
      noteMenuCategoryFor(nextSelectedNoteId, selectedTrackRef.kind),
    )
  }

  const handleMakeNice = async () => {
    const variation = makeNiceCounterRef.current
    const nextChordSteps = createFriendlyChordSteps(variation, patternStepCount)
    const friendlySteps =
      selectedTrackRef.kind === 'bass'
        ? createChordAwareBassSteps(selectedRootSemitone, selectedScaleId, nextChordSteps)
        : createChordAwareMelodySteps(
            selectedRootSemitone,
            selectedScaleId,
            nextChordSteps,
            variation,
          )
    const previewStepIndex = Math.max(
      0,
      friendlySteps.findIndex((noteId) => noteId !== 'rest'),
    )
    const previewNoteId = friendlySteps[previewStepIndex]
    const nextSelection = createStepSelection(
      selectedTrackRef.kind,
      selectedTrack.id,
      previewStepIndex,
    )

    makeNiceCounterRef.current += 1
    setChordSteps(nextChordSteps)
    setSelectedChordStep(
      Math.max(
        0,
        nextChordSteps.findIndex((chordId) => chordId !== 'rest'),
      ),
    )

    if (selectedTrackRef.kind === 'bass') {
      setBassTracks((currentTracks) =>
        currentTracks.map((track) =>
          track.id === selectedTrack.id
            ? {
                ...track,
                steps: friendlySteps,
              }
            : {
                ...track,
                steps: track.steps.map((noteId) =>
                  snapNoteIdToScale(noteId, selectedRootSemitone, selectedScaleId),
                ),
              },
        ),
      )
      setMelodyTracks((currentTracks) =>
        snapTrackListToScale(currentTracks, selectedRootSemitone, selectedScaleId),
      )
    } else {
      setBassTracks((currentTracks) =>
        snapTrackListToScale(currentTracks, selectedRootSemitone, selectedScaleId),
      )
      setMelodyTracks((currentTracks) =>
        currentTracks.map((track) =>
          track.id === selectedTrack.id
            ? {
                ...track,
                steps: friendlySteps,
              }
            : {
                ...track,
                steps: track.steps.map((noteId) =>
                  snapNoteIdToScale(noteId, selectedRootSemitone, selectedScaleId),
                ),
              },
        ),
      )
    }

    setSelectedSteps([nextSelection])
    focusStepSelection(nextSelection)
    setSelectedNoteCategoryId(
      noteMenuCategoryFor(previewNoteId, selectedTrackRef.kind),
    )

    await ensureAudio()

    if (previewNoteId !== 'rest' && !selectedTrack.muted) {
      playSynthVoice(previewNoteId, selectedTrack.presetId, undefined, selectedTrack.volume)
    }
  }

  const renderChordSection = () => {
    const preset = findPreset(chordPresetId)
    const options = presetOptionsFor('melody')

    return (
      <div className="track-section chord-section">
        <div className="section-heading compact">
          <h2>Chords</h2>
          <div className="section-actions">
            <span className="selection-count">
              Step {selectedChordStep + 1}: {chordLabelForId(chordSteps[selectedChordStep])}
            </span>
          </div>
        </div>

        <div className="synth-lanes">
          <div className="synth-lane chord-lane">
            <div className="synth-meta" style={{ '--lane-color': preset.color }}>
              <div className="synth-meta-top">
                <button
                  type="button"
                  className="synth-label selected"
                  onClick={() => setSelectedChordStep(0)}
                >
                  Chords
                </button>
              </div>

              <div className="lane-mixer">
                <button
                  type="button"
                  className={`mute-button ${chordMuted ? 'active' : ''}`}
                  onClick={() => setChordMuted((isMuted) => !isMuted)}
                  aria-pressed={chordMuted}
                >
                  Mute
                </button>

                <label className="lane-volume">
                  <span>Vol</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={chordVolume}
                    onChange={(event) => setChordVolume(Number(event.target.value))}
                  />
                  <strong>{Math.round(chordVolume * 100)}</strong>
                </label>
              </div>

              <label className="voice-preset">
                <span>Instrument</span>
                <select
                  value={chordPresetId}
                  onChange={(event) => handleChordPresetChange(event.target.value)}
                >
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              className="synth-row chord-row"
              role="grid"
              aria-label="Chord progression"
              style={{ '--step-count': chordSteps.length }}
            >
              {chordSteps.map((chordId, stepIndex) => {
                const rootNoteId = chordRootNoteId(
                  chordId,
                  selectedRootSemitone,
                  selectedScaleId,
                )
                const rootNote = findNote(rootNoteId)
                const isCurrent =
                  chordSteps.length > 0 && currentStep % chordSteps.length === stepIndex
                const isSelected = selectedChordStep === stepIndex
                const notesLabel = chordNotesLabel(
                  chordId,
                  selectedRootSemitone,
                  selectedScaleId,
                )

                return (
                  <button
                    key={`chord-${stepIndex + 1}`}
                    type="button"
                    className={[
                      'synth-hit',
                      'chord-hit',
                      chordId === 'rest' ? 'rest' : '',
                      isCurrent ? 'current' : '',
                      isSelected ? 'selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ '--lane-color': preset.color, '--note-color': rootNote.color }}
                    onClick={(event) => handleChordStepClick(event, stepIndex)}
                    onContextMenu={(event) => handleChordClear(event, stepIndex)}
                    aria-pressed={isSelected}
                    aria-label={`Chord step ${stepIndex + 1} ${chordLabelForId(chordId)}`}
                  >
                    <span className="hit-step">
                      {String(stepIndex + 1).padStart(2, '0')}
                    </span>
                    <strong>{chordLabelForId(chordId)}</strong>
                    {notesLabel ? <span className="chord-notes">{notesLabel}</span> : null}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderTrackSection = (kind, tracks, title) => (
    <div className="track-section">
      <div className="section-heading compact">
        <h2>{title}</h2>
        <div className="section-actions">
          {selectedSteps.filter((selection) => selection.kind === kind).length > 1 ? (
            <span className="selection-count">
              {selectedSteps.filter((selection) => selection.kind === kind).length} selected
            </span>
          ) : null}
          <button
            type="button"
            className={`mode-toggle ${isNotePaintMode ? 'active' : ''}`}
            onClick={() => setIsNotePaintMode((currentMode) => !currentMode)}
            aria-pressed={isNotePaintMode}
          >
            {isNotePaintMode ? 'Mode: Paint' : 'Mode: Select'}
          </button>
          <button
            type="button"
            className="add-track-button"
            onClick={() => handleAddTrack(kind)}
            disabled={
              kind === 'bass'
                ? bassTracks.length >= MAX_BASS_VOICES
                : melodyTracks.length >= MAX_MELODY_VOICES
            }
          >
            Add {kind === 'bass' ? 'Bass' : 'Melody'}
          </button>
        </div>
      </div>

      <div className="synth-lanes">
        {tracks.map((track) => {
          const preset = findPreset(track.presetId)
          const options = presetOptionsFor(kind)

          return (
            <div className="synth-lane" key={track.id}>
              <div className="synth-meta" style={{ '--lane-color': preset.color }}>
                <div className="synth-meta-top">
                  <button
                    type="button"
                    className={`synth-label ${
                      selectedTrackRef.kind === kind && selectedTrack.id === track.id
                        ? 'selected'
                        : ''
                    }`}
                    onClick={() => {
                      selectSingleStep(kind, track.id, 0)
                    }}
                  >
                    {track.label}
                  </button>

                  <button
                    type="button"
                    className="remove-voice"
                    onClick={() => handleRemoveTrack(kind, track.id)}
                    disabled={tracks.length === 1}
                    aria-label={`Remove ${track.label}`}
                  >
                    x
                  </button>
                </div>

                <div className="lane-mixer">
                  <button
                    type="button"
                    className={`mute-button ${track.muted ? 'active' : ''}`}
                    onClick={() => handleTrackMuteToggle(kind, track.id)}
                    aria-pressed={track.muted}
                  >
                    Mute
                  </button>

                  <label className="lane-volume">
                    <span>Vol</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={track.volume}
                      onChange={(event) =>
                        handleTrackVolumeChange(kind, track.id, event.target.value)
                      }
                    />
                    <strong>{Math.round(track.volume * 100)}</strong>
                  </label>
                </div>

                <label className="voice-preset">
                  <span>Instrument</span>
                  <select
                    value={track.presetId}
                    onChange={(event) =>
                      handlePresetChange(kind, track.id, event.target.value)
                    }
                  >
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div
                className="synth-row"
                role="grid"
                aria-label={`${track.label} pattern`}
                style={{ '--step-count': track.steps.length }}
              >
                {track.steps.map((noteId, stepIndex) => {
                  const note = findNote(noteId)
                  const isCurrent =
                    track.steps.length > 0 && currentStep % track.steps.length === stepIndex
                  const isSelected = selectedStepKeys.has(
                    stepSelectionKey(createStepSelection(kind, track.id, stepIndex)),
                  )

                  return (
                    <button
                      key={`${track.id}-${stepIndex + 1}`}
                      type="button"
                      className={[
                        'synth-hit',
                        noteId === 'rest' ? 'rest' : '',
                        isCurrent ? 'current' : '',
                        isSelected ? 'selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ '--lane-color': preset.color, '--note-color': note.color }}
                      onPointerDown={(event) =>
                        handleTrackStepPointerDown(
                          event,
                          kind,
                          track.id,
                          stepIndex,
                          noteId,
                        )
                      }
                      onPointerEnter={() =>
                        handleTrackStepPointerEnter(kind, track.id, stepIndex)
                      }
                      onClick={(event) =>
                        handleTrackStepClick(event, kind, track.id, stepIndex)
                      }
                      onContextMenu={(event) =>
                        handleTrackStepClear(event, kind, track.id, stepIndex)
                      }
                      aria-pressed={isSelected}
                      aria-label={`${track.label} step ${stepIndex + 1} ${note.label}`}
                    >
                      <span className="hit-step">
                        {String(stepIndex + 1).padStart(2, '0')}
                      </span>
                      <strong>{note.label}</strong>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="app-title-row">
          <h1>Groovebox</h1>
          <nav className="app-switch-group" aria-label="Open app">
            <a href="#note-game" className="app-switch-button" onClick={onOpenNoteGame}>
              Game
            </a>
            <a href="#pad" className="app-switch-button" onClick={onOpenChordPad}>
              Chord Pad
            </a>
            <a href="#sampler" className="app-switch-button" onClick={onOpenSampler}>
              Sampler
            </a>
          </nav>
        </div>

        <div className="transport">
          <button
            type="button"
            className={`transport-button ${isPlaying ? 'stop' : 'play'}`}
            onClick={handlePlaybackToggle}
          >
            {isPlaying ? 'Stop Groove' : 'Play Groove'}
          </button>

          <label className="control-card">
            <span>BPM</span>
            <div className="control-stack">
              <input
                type="range"
                min="60"
                max="220"
                value={bpm}
                onChange={handleBpmChange}
              />
              <input
                type="number"
                min="60"
                max="220"
                value={bpm}
                onChange={handleBpmChange}
              />
            </div>
          </label>

          <label className="control-card">
            <span>Steps</span>
            <div className="control-stack">
              <input
                type="range"
                min={MIN_PATTERN_LENGTH}
                max={MAX_PATTERN_LENGTH}
                value={patternLength}
                onChange={handlePatternLengthChange}
              />
              <input
                type="number"
                min={MIN_PATTERN_LENGTH}
                max={MAX_PATTERN_LENGTH}
                value={patternLength}
                onChange={handlePatternLengthChange}
              />
            </div>
          </label>

          <label className="control-card">
            <span>Dirt</span>
            <div className="control-stack">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={drive}
                onChange={(event) => setDrive(Number(event.target.value))}
              />
              <strong>{Math.round(drive * 100)}%</strong>
            </div>
          </label>

          <label className="control-card">
            <span>Tone</span>
            <div className="control-stack">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={tone}
                onChange={(event) => setTone(Number(event.target.value))}
              />
              <strong>{Math.round(tone * 100)}%</strong>
            </div>
          </label>

          <label className="control-card">
            <span>Punch</span>
            <div className="control-stack">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={punch}
                onChange={(event) => setPunch(Number(event.target.value))}
              />
              <strong>{Math.round(punch * 100)}%</strong>
            </div>
          </label>

          <label className="control-card">
            <span>Space</span>
            <div className="control-stack">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={space}
                onChange={(event) => setSpace(Number(event.target.value))}
              />
              <strong>{Math.round(space * 100)}%</strong>
            </div>
          </label>

          <label className="control-card">
            <span>Motion</span>
            <div className="control-stack">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={motion}
                onChange={(event) => setMotion(Number(event.target.value))}
              />
              <strong>{Math.round(motion * 100)}%</strong>
            </div>
          </label>

          <label className="control-card">
            <span>Width</span>
            <div className="control-stack">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
              />
              <strong>{Math.round(width * 100)}%</strong>
            </div>
          </label>

          <div className="control-card fx-scene-card">
            <span>FX Scene</span>
            <div className="fx-scene-buttons">
              {EFFECT_SCENES.map((scene) => (
                <button
                  key={scene.id}
                  type="button"
                  className={effectSceneId === scene.id ? 'active' : ''}
                  onClick={() => setEffectSceneId(scene.id)}
                  aria-pressed={effectSceneId === scene.id}
                >
                  {scene.label}
                </button>
              ))}
            </div>
          </div>

          <label className="control-card">
            <span>Volume</span>
            <div className="control-stack">
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.01"
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
              />
              <strong>{Math.round(volume * 100)}%</strong>
            </div>
          </label>

          <div className="control-card scale-card">
            <span>Scale</span>
            <div className="control-stack stacked">
              <select
                value={selectedScaleId}
                onChange={handleScaleChange}
                aria-label="Scale"
              >
                {SCALE_OPTIONS.map((scale) => (
                  <option key={scale.id} value={scale.id}>
                    {scale.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="make-nice-button"
                onClick={() => {
                  void handleMakeNice()
                }}
              >
                Make Nice
              </button>
            </div>
          </div>

          <div className="control-card song-card">
            <span>Presets</span>
            <div className="control-stack stacked">
              <input
                type="text"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="Preset name"
                aria-label="Preset name"
              />
              <button
                type="button"
                className="load-song-button"
                onClick={handleSaveUserPreset}
              >
                Save Preset
              </button>
              <select
                value={selectedUserPresetId}
                onChange={(event) => setSelectedUserPresetId(event.target.value)}
                aria-label="Saved preset"
              >
                <option value="">Saved presets</option>
                {userPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="load-song-button"
                onClick={handleLoadUserPreset}
                disabled={!selectedUserPresetId}
              >
                Load Preset
              </button>
              <button
                type="button"
                className="reset-song-button"
                onClick={handleDeleteUserPreset}
                disabled={!selectedUserPresetId}
              >
                Delete Preset
              </button>
              <button
                type="button"
                className="reset-song-button"
                onClick={handleResetAll}
              >
                Reset All
              </button>
            </div>
          </div>
        </div>

        <div className="pad-strip" role="group" aria-label="Pad selection">
          {PAD_OPTIONS.map((pad) => (
            <button
              key={pad.id}
              type="button"
              className={`pad-button ${selectedPadId === pad.id ? 'active' : ''}`}
              style={{ '--pad-color': pad.color }}
              onClick={() => {
                void handlePadChange(pad.id)
              }}
              aria-label={`Pad ${pad.label}`}
            >
              {pad.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid-panel">
        {renderChordSection()}

        {renderTrackSection('bass', bassTracks, 'Bass')}

        {renderTrackSection('melody', melodyTracks, 'Melody')}

        <div className="drum-panel">
          <div className="section-heading compact">
            <h2>Drums</h2>
          </div>

          <div className="drum-grid">
            {DRUM_TRACKS.map((track) => {
              const mixer = drumMixer[track.id] ?? {
                muted: false,
                volume: DEFAULT_LANE_VOLUME,
              }

              return (
                <div className="drum-lane" key={track.id}>
                  <div className="drum-meta" style={{ '--lane-color': track.color }}>
                    <button
                      type="button"
                      className="drum-label"
                      onClick={async () => {
                        await ensureAudio()
                        if (!mixer.muted) {
                          playDrumSound(track.id, undefined, mixer.volume)
                        }
                      }}
                    >
                      {track.label}
                    </button>

                    <div className="lane-mixer compact">
                      <button
                        type="button"
                        className={`mute-button ${mixer.muted ? 'active' : ''}`}
                        onClick={() =>
                          updateDrumMixer(track.id, {
                            muted: !mixer.muted,
                          })
                        }
                        aria-pressed={mixer.muted}
                      >
                        Mute
                      </button>

                      <label className="lane-volume">
                        <span>Vol</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={mixer.volume}
                          onChange={(event) =>
                            updateDrumMixer(track.id, {
                              volume: Number(event.target.value),
                            })
                          }
                        />
                        <strong>{Math.round(mixer.volume * 100)}</strong>
                      </label>
                    </div>
                  </div>

                  <div
                    className="drum-row"
                    role="grid"
                    aria-label={`${track.label} pattern`}
                    style={{ '--step-count': drums[track.id].length }}
                  >
                    {drums[track.id].map((isActive, stepIndex) => (
                      <button
                        key={`${track.id}-${stepIndex + 1}`}
                        type="button"
                        className={[
                          'drum-hit',
                          isActive ? 'active' : '',
                          drums[track.id].length > 0 &&
                          currentStep % drums[track.id].length === stepIndex
                            ? 'current'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{ '--lane-color': track.color }}
                        onPointerDown={(event) =>
                          void handleDrumPointerDown(
                            event,
                            track.id,
                            stepIndex,
                            isActive,
                          )
                        }
                        onPointerEnter={() => handleDrumPointerEnter(track.id, stepIndex)}
                        onClick={(event) => {
                          if (event.detail === 0) {
                            void handleDrumToggle(track.id, stepIndex)
                          }
                        }}
                        aria-pressed={isActive}
                        aria-label={`${track.label} step ${stepIndex + 1}`}
                      >
                        <span>{stepIndex + 1}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {noteMenu ? (
        <div
          ref={noteMenuRef}
          className="note-menu note-picker"
        >
          {selectedStepCount > 1 ? (
            <div className="note-menu-summary">{selectedStepCount} steps selected</div>
          ) : null}

          <div className="note-menu-categories">
            <button
              type="button"
              className={`note-filter ${selectedNoteId === 'rest' ? 'active rest' : 'rest'}`}
              onClick={() => handleNoteAssign('rest')}
            >
              Rest
            </button>

            {NOTE_MENU_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`note-filter ${
                  selectedNoteCategoryId === category.id ? 'active' : ''
                }`}
                onClick={() => setSelectedNoteCategoryId(category.id)}
              >
                {category.label}
              </button>
            ))}
          </div>

          <div className="note-menu-grid">
            {visibleNoteRows.map((rowNotes, rowIndex) => {
              const shortcutRow = NOTE_SHORTCUT_ROWS[rowIndex]

              return (
                <div
                  key={shortcutRow.id}
                  className={`note-menu-row ${
                    activeNoteShortcutRow === rowIndex ? 'shortcut-active' : ''
                  }`}
                >
                  <div className="note-menu-row-label">
                    <span>{shortcutRow.label}</span>
                    <strong>{shortcutRow.keyLabel}</strong>
                  </div>

                  <div className="note-menu-row-notes">
                    {rowNotes.map((note, noteIndex) => {
                      const isHomeNote = isNoteRoot(note.id, selectedRootSemitone)
                      const isScaleNote = isNoteInScale(
                        note.id,
                        selectedRootSemitone,
                        selectedScaleId,
                      )

                      return (
                        <button
                          key={note.id}
                          type="button"
                          className={[
                            'note-chip',
                            selectedNoteId === note.id ? 'active' : '',
                            isHomeNote ? 'home' : '',
                            isScaleNote ? '' : 'outside-scale',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{ '--chip-color': note.color }}
                          onClick={() => handleNoteAssign(note.id)}
                        >
                          <span className="note-shortcut-number">{noteIndex + 1}</span>
                          <span>{note.label}</span>
                          {isHomeNote ? <span className="note-chip-role">Home</span> : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {chordMenu ? (
        <div
          ref={chordMenuRef}
          className="note-menu chord-menu"
          style={{ top: `${chordMenu.top}px`, left: `${chordMenu.left}px` }}
        >
          <div className="note-menu-summary">
            Chord step {selectedChordStep + 1}
          </div>

          <div className="note-menu-categories">
            <button
              type="button"
              className={`note-filter ${selectedChordId === 'rest' ? 'active rest' : 'rest'}`}
              onClick={() => handleChordAssign('rest')}
            >
              Rest
            </button>
          </div>

          <div className="note-menu-grid chord-menu-grid">
            {CHORD_OPTIONS.map((chord) => {
              const rootNote = findNote(
                chordRootNoteId(chord.id, selectedRootSemitone, selectedScaleId),
              )

              return (
                <button
                  key={chord.id}
                  type="button"
                  className={[
                    'note-chip',
                    'chord-chip',
                    selectedChordId === chord.id ? 'active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ '--chip-color': rootNote.color }}
                  onClick={() => handleChordAssign(chord.id)}
                >
                  <span>{chord.label}</span>
                  <span className="note-chip-role">
                    {chordNotesLabel(chord.id, selectedRootSemitone, selectedScaleId)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </main>
  )
}

function NoteGameApp({ onOpenChordPad, onOpenGroovebox, onOpenSampler }) {
  const [snippetIndex, setSnippetIndex] = useState(0)
  const [playhead, setPlayhead] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isWaitingForNote, setIsWaitingForNote] = useState(false)
  const [lastGuess, setLastGuess] = useState(null)
  const [lastGuessNote, setLastGuessNote] = useState(null)
  const [score, setScore] = useState(0)
  const audioContextRef = useRef(null)
  const timerRef = useRef(null)
  const feedbackTimerRef = useRef(null)

  const snippet = NOTE_GAME_SNIPPETS[snippetIndex]
  const missingIndices = snippet.missingIndices
  const solvedMissingCount = missingIndices.filter((index) => index < playhead).length
  const missingNote = isWaitingForNote ? snippet.notes[playhead] : null
  const choices = NOTE_GAME_KEYS
  const isFinished = playhead >= snippet.notes.length

  const ensureAudio = async () => {
    if (!audioContextRef.current) {
      const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext

      if (!AudioContextConstructor) {
        throw new Error('Web Audio is not available in this browser.')
      }

      audioContextRef.current = new AudioContextConstructor({ latencyHint: 'interactive' })
    }

    if (audioContextRef.current.state !== 'running') {
      await audioContextRef.current.resume()
    }

    return audioContextRef.current
  }

  const playTone = useCallback(async (noteNumber, duration = 0.44, accent = false, mood = 'note') => {
    const context = await ensureAudio()
    const now = context.currentTime
    const output = context.createGain()
    const pan = context.createStereoPanner()
    const filter = context.createBiquadFilter()
    const compressor = context.createDynamicsCompressor()
    const baseFrequency = noteGameFrequency(noteNumber)
    const isWrong = mood === 'wrong'
    const isHarmony = mood === 'harmony'
    const partials = isWrong
      ? [
          { ratio: 1, type: 'triangle', gain: 0.11, detune: -8 },
          { ratio: 1.5, type: 'sine', gain: 0.035, detune: 0 },
        ]
      : isHarmony
        ? [
            { ratio: 1, type: 'sine', gain: 0.055, detune: 0 },
            { ratio: 2, type: 'triangle', gain: 0.014, detune: -5 },
          ]
      : [
          { ratio: 1, type: 'triangle', gain: accent ? 0.16 : 0.12, detune: 0 },
          { ratio: 2, type: 'sine', gain: accent ? 0.035 : 0.024, detune: 3 },
          { ratio: 3, type: 'sine', gain: 0.014, detune: -4 },
        ]

    output.gain.setValueAtTime(0.0001, now)
    output.gain.exponentialRampToValueAtTime(1, now + (isWrong ? 0.006 : 0.018))
    output.gain.exponentialRampToValueAtTime(0.22, now + (isWrong ? 0.09 : 0.16))
    output.gain.setTargetAtTime(0.0001, now + duration * (isWrong ? 0.34 : 0.72), 0.055)

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(
      isWrong ? 920 : isHarmony ? 1250 : accent ? 2100 : 1800,
      now,
    )
    filter.frequency.exponentialRampToValueAtTime(isWrong ? 420 : isHarmony ? 620 : 980, now + duration)
    filter.Q.value = isWrong ? 2.1 : isHarmony ? 0.95 : 0.7
    compressor.threshold.value = -24
    compressor.knee.value = 18
    compressor.ratio.value = 4
    compressor.attack.value = 0.006
    compressor.release.value = 0.12
    pan.pan.value = isHarmony ? -0.22 : ((noteNumber % 12) - 5.5) / 16

    partials.forEach((partial) => {
      const oscillator = context.createOscillator()
      const partialGain = context.createGain()

      oscillator.type = partial.type
      oscillator.frequency.value = baseFrequency * partial.ratio
      oscillator.detune.value = partial.detune
      partialGain.gain.value = partial.gain
      oscillator.connect(partialGain)
      partialGain.connect(filter)
      oscillator.start(now)
      oscillator.stop(now + duration + 0.18)
    })

    filter.connect(output)
    output.connect(pan)
    pan.connect(compressor)
    compressor.connect(context.destination)
  }, [])

  const playHarmony = useCallback((notes, duration = 0.58) => {
    if (!notes?.length) {
      return
    }

    notes.forEach((noteNumber) => {
      void playTone(noteNumber, duration, false, 'harmony')
    })
  }, [playTone])

  const clearGameTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = null
    }
  }, [])

  const resetSnippet = useCallback((nextIndex = snippetIndex) => {
    clearGameTimer()
    setSnippetIndex(nextIndex)
    setPlayhead(0)
    setIsPlaying(false)
    setIsWaitingForNote(false)
    setLastGuess(null)
    setLastGuessNote(null)
  }, [clearGameTimer, snippetIndex])

  const startSnippet = async () => {
    await ensureAudio()
    clearGameTimer()
    setPlayhead(0)
    setIsWaitingForNote(false)
    setLastGuess(null)
    setLastGuessNote(null)
    setIsPlaying(true)
  }

  useEffect(() => {
    if (!isPlaying || isWaitingForNote || isFinished) {
      return
    }

    if (missingIndices.includes(playhead)) {
      timerRef.current = window.setTimeout(() => {
        setIsWaitingForNote(true)
      }, 0)
      return clearGameTimer
    }

    playHarmony(snippet.harmony?.[playhead])
    void playTone(snippet.notes[playhead])
    timerRef.current = window.setTimeout(() => {
      setPlayhead((currentPlayhead) => {
        const nextPlayhead = currentPlayhead + 1

        if (nextPlayhead >= snippet.notes.length) {
          setIsPlaying(false)
        }

        return nextPlayhead
      })
    }, NOTE_GAME_STEP_MS)

    return clearGameTimer
  }, [
    clearGameTimer,
    isFinished,
    isPlaying,
    isWaitingForNote,
    playHarmony,
    playTone,
    playhead,
    missingIndices,
    snippet,
  ])

  useEffect(() => () => clearGameTimer(), [clearGameTimer])

  const handleGuess = async (noteNumber) => {
    if (!isWaitingForNote) {
      await playTone(noteNumber, 0.28, true)
      return
    }

    const isCorrect = noteNumber === missingNote
    await playTone(noteNumber, isCorrect ? 0.5 : 0.18, true, isCorrect ? 'correct' : 'wrong')
    setLastGuess(isCorrect ? 'correct' : 'wrong')
    setLastGuessNote(noteNumber)

    if (!isCorrect) {
      clearGameTimer()
      feedbackTimerRef.current = window.setTimeout(() => {
        setLastGuess(null)
        setLastGuessNote(null)
      }, 680)
      return
    }

    setScore((currentScore) => currentScore + 1)
    clearGameTimer()
    feedbackTimerRef.current = window.setTimeout(() => {
      setIsWaitingForNote(false)
      setLastGuess(null)
      setLastGuessNote(null)
      setPlayhead((currentPlayhead) => currentPlayhead + 1)
      setIsPlaying(true)
    }, 360)
  }

  useEffect(() => {
    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase()
      const note = NOTE_GAME_KEYS.find((item) => item.key === key)

      if (!note) {
        return
      }

      event.preventDefault()
      void handleGuess(note.note)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  const handleNextSnippet = () => {
    resetSnippet((snippetIndex + 1) % NOTE_GAME_SNIPPETS.length)
  }

  return (
    <main className="note-game-shell">
      <header className="note-game-hero">
        <div>
          <p className="eyebrow">Listen and complete the melody</p>
          <h1>Missing Note</h1>
        </div>

        <nav className="app-switch-group" aria-label="Open app">
          <a href="#pad" className="app-switch-button" onClick={onOpenChordPad}>
            Chord Pad
          </a>
          <a href="#sampler" className="app-switch-button" onClick={onOpenSampler}>
            Sampler
          </a>
          <a href="#groovebox" className="app-switch-button" onClick={onOpenGroovebox}>
            Groovebox
          </a>
        </nav>
      </header>

      <section className="note-game-workspace">
        <div
          className={['note-game-stage', lastGuess ? `guess-${lastGuess}` : '']
            .filter(Boolean)
            .join(' ')}
          aria-label="Scrolling melody"
        >
          <div className="note-game-scorebar">
            <div>
              <span>{snippet.composer}</span>
              <strong>{snippet.title}</strong>
            </div>
            <div>
              <span>Missing notes</span>
              <strong>
                {solvedMissingCount}/{missingIndices.length}
              </strong>
            </div>
            <div>
              <span>Score</span>
              <strong>{score}</strong>
            </div>
          </div>

          <div className={['note-game-board', lastGuess ? `guess-${lastGuess}` : '']
            .filter(Boolean)
            .join(' ')}
          >
            <div className="note-game-gate" />
            {choices.map((choice) => (
              <div
                key={choice.note}
                className="note-game-lane"
                style={{ top: `${noteGameLanePercent(choice.note)}%` }}
              >
                <span>{choice.label}</span>
              </div>
            ))}

            {snippet.notes.map((noteNumber, index) => {
              const isMissing = missingIndices.includes(index)
              const isCurrentMissing = isMissing && index === playhead
              const isUnsolvedMissing = isMissing && index >= playhead
              const isActiveMissing = isCurrentMissing && isWaitingForNote
              const offset = index - playhead
              const left = isCurrentMissing
                ? NOTE_GAME_GATE_X
                : NOTE_GAME_GATE_X + offset * NOTE_GAME_NOTE_SPACING
              const top = isUnsolvedMissing ? 50 : noteGameLanePercent(noteNumber)

              if (left < -18 || left > 118) {
                return null
              }

              return (
                <div
                  key={`${snippet.id}-${index}`}
                  className={[
                    'note-game-dash',
                    index < playhead ? 'passed' : '',
                    index === playhead ? 'current' : '',
                    isMissing ? 'missing' : '',
                    isCurrentMissing ? 'waiting' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    '--note-color': noteColorForNumber(noteNumber),
                    left: `${left}%`,
                    top: `${top}%`,
                  }}
                  aria-label={isMissing ? 'Missing note' : noteGameLabel(noteNumber)}
                >
                  {isActiveMissing ? '?' : ''}
                </div>
              )
            })}

            {snippet.harmony?.flatMap((notes, index) => {
              const offset = index - playhead
              const left = NOTE_GAME_GATE_X + offset * NOTE_GAME_NOTE_SPACING

              if (left < -18 || left > 118) {
                return []
              }

              return notes.map((noteNumber, noteIndex) => (
                <div
                  key={`${snippet.id}-harmony-${index}-${noteIndex}`}
                  className={[
                    'note-game-dash',
                    'harmony',
                    index < playhead ? 'passed' : '',
                    index === playhead ? 'current' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    left: `${left}%`,
                    top: `${noteGameHarmonyLanePercent(noteNumber)}%`,
                  }}
                  aria-hidden="true"
                />
              ))
            })}
          </div>

          <div className="note-game-controls">
            <button
              type="button"
              className="note-game-primary"
              onClick={isPlaying ? () => resetSnippet() : startSnippet}
            >
              {isPlaying ? 'Restart' : isFinished ? 'Play again' : 'Play'}
            </button>
            <button type="button" onClick={handleNextSnippet}>
              Next piece
            </button>
            <p className={`note-game-feedback ${lastGuess ?? ''}`}>
              {isWaitingForNote
                ? lastGuess === 'correct'
                  ? 'Correct - keep listening'
                  : lastGuess === 'wrong'
                    ? 'Not that one - try again'
                    : 'Choose the note that keeps the tune going'
                : isFinished
                  ? 'Nice. Choose another piece or play again'
                  : 'The melody will pause at each mystery dash'}
            </p>
          </div>
        </div>

        <aside className="note-game-piano" aria-label="Piano note buttons">
          {choices
            .slice()
            .reverse()
            .map((choice) => (
              <button
                key={choice.note}
                type="button"
                className={choice.note === lastGuessNote && lastGuess ? lastGuess : ''}
                style={{ '--key-color': noteColorForNumber(choice.note) }}
                onClick={() => void handleGuess(choice.note)}
              >
                <span>{choice.label}</span>
                <small>{choice.key.toUpperCase()}</small>
              </button>
            ))}
        </aside>
      </section>
    </main>
  )
}

function getActiveAppFromHash() {
  if (typeof window === 'undefined') {
    return 'pad'
  }

  if (window.location.hash === '#groovebox') {
    return 'groovebox'
  }

  if (window.location.hash === '#sampler') {
    return 'sampler'
  }

  if (window.location.hash === '#note-game') {
    return 'note-game'
  }

  return 'pad'
}

function App() {
  const [activeApp, setActiveApp] = useState(getActiveAppFromHash)

  useEffect(() => {
    const handleHashChange = () => setActiveApp(getActiveAppFromHash())

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)

    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (activeApp === 'sampler') {
    return (
      <SamplerApp
        onOpenChordPad={() => setActiveApp('pad')}
        onOpenGroovebox={() => setActiveApp('groovebox')}
        onOpenNoteGame={() => setActiveApp('note-game')}
      />
    )
  }

  if (activeApp === 'note-game') {
    return (
      <NoteGameApp
        onOpenChordPad={() => setActiveApp('pad')}
        onOpenGroovebox={() => setActiveApp('groovebox')}
        onOpenSampler={() => setActiveApp('sampler')}
      />
    )
  }

  return activeApp === 'pad' ? (
    <ChordPadApp
      onOpenGroovebox={() => setActiveApp('groovebox')}
      onOpenSampler={() => setActiveApp('sampler')}
      onOpenNoteGame={() => setActiveApp('note-game')}
    />
  ) : (
    <GrooveboxApp
      onOpenChordPad={() => setActiveApp('pad')}
      onOpenSampler={() => setActiveApp('sampler')}
      onOpenNoteGame={() => setActiveApp('note-game')}
    />
  )
}

export default App
