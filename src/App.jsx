import { useEffect, useRef, useState } from 'react'
import './App.css'

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

function App() {
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
      const compressor = context.createDynamicsCompressor()

      compressor.threshold.value = -18
      compressor.knee.value = 18
      compressor.ratio.value = 4
      compressor.attack.value = 0.003
      compressor.release.value = 0.22

      masterGain.gain.value = volume
      masterGain.connect(compressor)
      compressor.connect(context.destination)

      audioContextRef.current = context
      masterGainRef.current = masterGain
      noiseBufferRef.current = createNoiseBuffer(context)
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
    if (masterGainRef.current && audioContextRef.current) {
      masterGainRef.current.gain.setTargetAtTime(
        volume,
        audioContextRef.current.currentTime,
        0.02,
      )
    }
  }, [volume])

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

  const playSynthVoice = (noteId, presetId, scheduledTime, laneVolume = DEFAULT_LANE_VOLUME) => {
    const note = findNote(noteId)
    const preset = findPreset(presetId)
    const context = audioContextRef.current
    const masterGain = masterGainRef.current
    const outputLevel = Math.max(0, laneVolume)

    if (!context || !masterGain || !note.frequency || outputLevel <= 0) {
      return
    }

    const startTime = scheduledTime ?? context.currentTime + 0.01
    const duration = Math.max(getStepDuration() * 0.95, preset.decay)
    const envelope = context.createGain()
    const filter = context.createBiquadFilter()
    const shaper = context.createWaveShaper()
    const panner =
      typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null
    const cleanupNodes = []

    filter.type = preset.filterType
    filter.frequency.setValueAtTime(preset.cutoff, startTime)
    filter.frequency.linearRampToValueAtTime(
      preset.cutoff + preset.envAmount,
      startTime + 0.025,
    )
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(180, preset.cutoff * preset.filterFloorRatio),
      startTime + duration,
    )
    filter.Q.setValueAtTime(preset.resonance, startTime)

    envelope.gain.setValueAtTime(0.0001, startTime)
    envelope.gain.linearRampToValueAtTime(
      preset.gain * outputLevel,
      startTime + preset.attack,
    )
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, preset.gain * preset.sustainLevel * outputLevel),
      startTime + duration * 0.5,
    )
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

    shaper.curve = distortionCurveCacheRef.current.get(drive * preset.driveAmount)
    shaper.oversample = audioProfileRef.current.distortionOversample

    if (panner) {
      panner.pan.setValueAtTime(preset.pan, startTime)
    }

    const mainOscillator = context.createOscillator()
    mainOscillator.type = preset.waveform
    mainOscillator.frequency.setValueAtTime(note.frequency, startTime)

    const detunedOscillator = context.createOscillator()
    detunedOscillator.type = preset.waveform
    detunedOscillator.frequency.setValueAtTime(note.frequency, startTime)
    detunedOscillator.detune.setValueAtTime(preset.detune, startTime)

    const harmonicOscillator = context.createOscillator()
    harmonicOscillator.type = preset.harmonicWaveform
    harmonicOscillator.frequency.setValueAtTime(
      note.frequency * preset.harmonicRatio,
      startTime,
    )
    harmonicOscillator.detune.setValueAtTime(preset.harmonicDetune, startTime)

    const subOscillator = context.createOscillator()
    subOscillator.type = preset.subWaveform
    subOscillator.frequency.setValueAtTime(note.frequency / 2, startTime)

    if (preset.vibratoDepth > 0 && preset.vibratoRate > 0) {
      const vibrato = context.createOscillator()
      const vibratoGain = context.createGain()

      vibrato.type = 'sine'
      vibrato.frequency.setValueAtTime(preset.vibratoRate, startTime)
      vibratoGain.gain.setValueAtTime(0, startTime)
      vibratoGain.gain.linearRampToValueAtTime(
        preset.vibratoDepth,
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
    detuneGain.gain.value = preset.detuneLevel

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

    if (preset.delayLevel > 0) {
      const delay = context.createDelay(1)
      const feedback = context.createGain()
      const delayWet = context.createGain()

      delay.delayTime.setValueAtTime(preset.delayTime, startTime)
      feedback.gain.setValueAtTime(preset.delayFeedback, startTime)
      delayWet.gain.setValueAtTime(preset.delayLevel, startTime)

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
        <h1>Groovebox</h1>

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
            <span>Drive</span>
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

export default App
