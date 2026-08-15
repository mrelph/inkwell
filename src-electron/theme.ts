import { readFile, stat } from 'node:fs/promises'
import { watch } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type ThemeMode = 'light' | 'dark'

export type RgbColor = { r: number; g: number; b: number }

export type ThemeTokens = {
  mode: ThemeMode
  themeName: string
  '--surface-reader': string
  '--surface-panel': string
  '--surface-canvas': string
  '--surface-chrome': string
  '--surface-raised': string
  '--surface-code': string
  '--text-primary': string
  '--text-secondary': string
  '--text-muted': string
  '--text-inverse': string
  '--line-hairline': string
  '--line-strong': string
  '--accent': string
  '--accent-hover': string
  '--accent-contrast': string
  '--accent-tint': string
  '--accent-ring': string
  '--caret': string
  '--selection-bg': string
  '--selection-text': string
}

type ColorsTable = Record<string, string>

/* ------------------------------------------------------------------ */
/* Paths                                                                */
/* ------------------------------------------------------------------ */

const HOME_DIR = os.homedir()
const OMARCHY_STATE_DIR = path.join(HOME_DIR, '.local', 'state', 'omarchy')
const CURRENT_DIR = path.join(OMARCHY_STATE_DIR, 'current')
const THEME_DIR = path.join(CURRENT_DIR, 'theme')
const COLORS_PATH = path.join(THEME_DIR, 'colors.toml')
const THEME_NAME_PATH = path.join(CURRENT_DIR, 'theme.name')
const LIGHT_MODE_MARKER_PATH = path.join(THEME_DIR, 'light.mode')

/* ------------------------------------------------------------------ */
/* Color math — pure, exported, testable in isolation                  */
/* ------------------------------------------------------------------ */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const isValidHex = (value: string | undefined): value is string => {
  if (!value) return false
  const normalized = value.trim().replace(/^#/, '')
  return /^[0-9a-fA-F]{3}$/.test(normalized) || /^[0-9a-fA-F]{6}$/.test(normalized)
}

export const hexToRgb = (hex: string): RgbColor => {
  const stripped = hex.trim().replace(/^#/, '')
  const expanded = stripped.length === 3
    ? stripped.split('').map((char) => char + char).join('')
    : stripped
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) throw new Error(`Invalid hex color: ${hex}`)
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16)
  }
}

export const rgbToHex = ({ r, g, b }: RgbColor): string => {
  const toByte = (channel: number) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0')
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`
}

export const normalizeHex = (hex: string): string => rgbToHex(hexToRgb(hex))

/* WCAG relative luminance — sRGB channels are linearized, not averaged. */
export const relativeLuminance = (hex: string): number => {
  const { r, g, b } = hexToRgb(hex)
  const linearize = (channel: number) => {
    const s = channel / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

export const contrastRatio = (hexA: string, hexB: string): number => {
  const a = relativeLuminance(hexA)
  const b = relativeLuminance(hexB)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

/* ratio 0 -> hexA, ratio 1 -> hexB */
export const mixColors = (hexA: string, hexB: string, ratio: number): string => {
  const t = clamp(ratio, 0, 1)
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  })
}

const toRgbaString = (hex: string, alpha: number): string => {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/* ------------------------------------------------------------------ */
/* colors.toml — hand-rolled flat-line reader, not a general TOML parser */
/* ------------------------------------------------------------------ */

export const parseColorsToml = (text: string): ColorsTable => {
  const table: ColorsTable = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';') || line.startsWith('[')) continue
    const separator = line.indexOf('=')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const rawValue = line.slice(separator + 1).trim()
    if (!key || !rawValue) continue
    const quote = rawValue[0]
    if (quote === '"' || quote === "'") {
      const closing = rawValue.indexOf(quote, 1)
      table[key] = closing === -1 ? rawValue.slice(1) : rawValue.slice(1, closing)
    } else {
      table[key] = rawValue
    }
  }
  return table
}

/* ------------------------------------------------------------------ */
/* Small IO helpers — never throw                                      */
/* ------------------------------------------------------------------ */

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

const readThemeName = async (): Promise<string> => {
  try {
    const raw = await readFile(THEME_NAME_PATH, 'utf8')
    const trimmed = raw.trim()
    return trimmed || 'unknown'
  } catch {
    return 'unknown'
  }
}

/* ------------------------------------------------------------------ */
/* Mode cascade                                                        */
/* ------------------------------------------------------------------ */

const normalizeModeValue = (value: string | undefined): ThemeMode | undefined =>
  value === 'light' || value === 'dark' ? value : undefined

const detectMode = async (colors: ColorsTable): Promise<ThemeMode> => {
  const fromMode = normalizeModeValue(colors.mode)
  if (fromMode) return fromMode

  const fromLegacyType = normalizeModeValue(colors.theme_type)
  if (fromLegacyType) return fromLegacyType

  if (await pathExists(LIGHT_MODE_MARKER_PATH)) return 'light'

  if (isValidHex(colors.background)) {
    return relativeLuminance(normalizeHex(colors.background)) >= 0.5 ? 'light' : 'dark'
  }

  return 'dark'
}

/* ------------------------------------------------------------------ */
/* Surface derivation — rank by measured contrast, never by field name */
/* ------------------------------------------------------------------ */

const BACKGROUND_KEYS = ['background', 'dark_background', 'darker_background', 'lighter_background'] as const
const FOREGROUND_KEYS = ['foreground', 'bright_foreground', 'light_foreground', 'dark_foreground'] as const

/* Bounded synthesis: if the theme doesn't provide four distinct background
   steps, generate the missing ones by mixing the nearest known surface
   toward the foreground in small increments. Guarded so it can never loop
   forever even on a maximally degenerate input. */
const ensureFourSurfaces = (rawSteps: readonly string[], foreground: string): string[] => {
  const unique = Array.from(new Set(rawSteps))
  if (unique.length >= 4) return unique.slice(0, 4)

  const seed = unique[unique.length - 1] ?? foreground
  const result = [...unique]
  let ratio = 0.12
  let guard = 0
  while (result.length < 4 && guard < 50) {
    guard += 1
    const candidate = mixColors(seed, foreground, Math.min(ratio, 0.92))
    if (!result.includes(candidate)) result.push(candidate)
    ratio += 0.12
  }
  /* Absolute last resort in case of pathological collisions — still bounded. */
  while (result.length < 4) {
    result.push(result.length % 2 === 0 ? '#000000' : '#ffffff')
  }
  return result
}

const rankSurfacesByContrast = (steps: readonly string[], reference: string): [string, string, string, string] => {
  const sorted = [...steps].sort((a, b) => contrastRatio(reference, b) - contrastRatio(reference, a))
  return [sorted[0], sorted[1], sorted[2], sorted[3]]
}

const deriveSurfaceCode = (reader: string, panel: string): string => {
  const candidate = mixColors(reader, panel, 0.5)
  if (candidate.toLowerCase() !== reader.toLowerCase()) return candidate
  /* Degenerate case: reader and panel coincide. Nudge in the direction that
     keeps it distinguishable from the reading surface. */
  const nudgeTarget = relativeLuminance(reader) >= 0.5 ? '#000000' : '#ffffff'
  return mixColors(reader, nudgeTarget, 0.08)
}

/* ------------------------------------------------------------------ */
/* Contrast enforcement                                                 */
/* ------------------------------------------------------------------ */

const passesAll = (color: string, minRatio: number, surfaces: readonly string[]) =>
  surfaces.every((surface) => contrastRatio(color, surface) >= minRatio)

const bestOf = (candidates: readonly string[], surfaces: readonly string[]): string =>
  candidates.reduce((best, candidate) => {
    const bestMin = Math.min(...surfaces.map((surface) => contrastRatio(best, surface)))
    const candidateMin = Math.min(...surfaces.map((surface) => contrastRatio(candidate, surface)))
    return candidateMin > bestMin ? candidate : best
  })

/* Discrete fallback chain (e.g. text-primary: foreground -> bright_foreground
   -> light_foreground -> dark_foreground -> white/black). Picks the first
   candidate that clears the floor against every listed surface; if none do,
   picks whichever comes closest rather than shipping the first candidate blindly. */
const pickFirstPassingContrast = (candidates: readonly string[], minRatio: number, surfaces: readonly string[]): string => {
  const valid = candidates.filter(isValidHex).map(normalizeHex)
  if (valid.length === 0) return '#000000'
  const passing = valid.find((candidate) => passesAll(candidate, minRatio, surfaces))
  return passing ?? bestOf(valid, surfaces)
}

/* Continuous enforcement (e.g. muted -> blend toward text-primary). Bounded
   loop — never infinite — with a final "never ship unreadable text" fallback. */
const enforceContrastFloor = (start: string, target: string, minRatio: number, surfaces: readonly string[], maxSteps = 40): string => {
  if (passesAll(start, minRatio, surfaces)) return start
  let current = start
  for (let step = 1; step <= maxSteps; step += 1) {
    current = mixColors(start, target, step / maxSteps)
    if (passesAll(current, minRatio, surfaces)) return current
  }
  return bestOf([current, target, '#ffffff', '#000000'], surfaces)
}

const pickExtremeForegrounds = (family: readonly string[]): string[] => {
  if (family.length === 0) return []
  const withLuminance = family.map((hex) => ({ hex, luminance: relativeLuminance(hex) }))
  const lightest = withLuminance.reduce((a, b) => (b.luminance > a.luminance ? b : a))
  const darkest = withLuminance.reduce((a, b) => (b.luminance < a.luminance ? b : a))
  return lightest.hex === darkest.hex ? [lightest.hex] : [lightest.hex, darkest.hex]
}

/* ------------------------------------------------------------------ */
/* Token assembly                                                       */
/* ------------------------------------------------------------------ */

/* Shared by both the theme-derived path and the static fallback, so the two
   stay mathematically consistent. `surfaces` must already be in final rank
   order: [reader, panel, canvas, chrome]. */
const finalizeTokens = (
  mode: ThemeMode,
  themeName: string,
  surfaces: readonly [string, string, string, string],
  textPrimaryCandidates: readonly string[],
  mutedRaw: string | undefined,
  accentRaw: string | undefined,
  selectionRaw: string | undefined,
  foregroundFamilyForAccent: readonly string[]
): ThemeTokens => {
  const [surfaceReader, surfacePanel, surfaceCanvas, surfaceChrome] = surfaces

  const textPrimary = pickFirstPassingContrast(textPrimaryCandidates, 4.5, [surfaceReader])

  const mutedBase = isValidHex(mutedRaw) ? normalizeHex(mutedRaw) : mixColors(textPrimary, surfaceChrome, 0.35)
  const textMuted = enforceContrastFloor(mutedBase, textPrimary, 4.5, [surfacePanel, surfaceChrome])

  const secondaryBase = mixColors(textPrimary, surfaceChrome, 0.24)
  const textSecondary = enforceContrastFloor(secondaryBase, textPrimary, 4.5, [surfacePanel, surfaceChrome])

  const surfaceRaised = mixColors(surfacePanel, surfaceReader, 0.4)
  const surfaceCode = deriveSurfaceCode(surfaceReader, surfacePanel)
  const lineHairline = mixColors(surfacePanel, textPrimary, 0.16)
  const lineStrong = mixColors(surfacePanel, textPrimary, 0.5)

  const accent = isValidHex(accentRaw) ? normalizeHex(accentRaw) : (mode === 'dark' ? '#5fb08a' : '#1b6366')
  const accentHover = mixColors(accent, mode === 'dark' ? '#ffffff' : '#000000', 0.16)
  const accentExtremes = pickExtremeForegrounds(foregroundFamilyForAccent)
  const accentContrast = pickFirstPassingContrast([...accentExtremes, '#ffffff', '#000000'], 4.5, [accent])
  const accentTint = toRgbaString(accent, 0.16)
  const accentRing = mixColors(accent, '#ffffff', 0.18)

  const caret = accent
  const selectionBg = isValidHex(selectionRaw) ? normalizeHex(selectionRaw) : mixColors(accent, surfaceReader, 0.82)
  const selectionText = pickFirstPassingContrast([textPrimary, '#ffffff', '#000000'], 4.5, [selectionBg])

  /* --text-inverse and --accent-contrast serve the identical role ("text/icon
     on an accent fill") under the two different vocabulary sections; unified
     to one computed value rather than deriving it twice. */
  const textInverse = accentContrast

  return {
    mode,
    themeName,
    '--surface-reader': surfaceReader,
    '--surface-panel': surfacePanel,
    '--surface-canvas': surfaceCanvas,
    '--surface-chrome': surfaceChrome,
    '--surface-raised': surfaceRaised,
    '--surface-code': surfaceCode,
    '--text-primary': textPrimary,
    '--text-secondary': textSecondary,
    '--text-muted': textMuted,
    '--text-inverse': textInverse,
    '--line-hairline': lineHairline,
    '--line-strong': lineStrong,
    '--accent': accent,
    '--accent-hover': accentHover,
    '--accent-contrast': accentContrast,
    '--accent-tint': accentTint,
    '--accent-ring': accentRing,
    '--caret': caret,
    '--selection-bg': selectionBg,
    '--selection-text': selectionText
  }
}

/* Static fallback (non-Omarchy systems). Base values are the ones specified
   in THEMING.md's "Default palette" table; every other token is derived
   through the same math as the theme-driven path so the fallback is
   internally consistent and contrast-enforced rather than hand-typed. */
const buildFallbackTokens = (): ThemeTokens => {
  const surfaces: [string, string, string, string] = ['#fbf8f1', '#e9e2d6', '#e8e1d5', '#f7f3ec']
  return finalizeTokens(
    'light',
    'default',
    surfaces,
    ['#1c2b31', '#ffffff', '#000000'],
    '#6b6459',
    '#1b6366',
    undefined,
    ['#1c2b31']
  )
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function resolveTheme(): Promise<ThemeTokens> {
  try {
    if (!(await pathExists(OMARCHY_STATE_DIR))) return buildFallbackTokens()

    const [colorsRaw, themeName] = await Promise.all([
      readFile(COLORS_PATH, 'utf8'),
      readThemeName()
    ])
    const colors = parseColorsToml(colorsRaw)
    const mode = await detectMode(colors)

    const foregroundFamily = FOREGROUND_KEYS.map((key) => colors[key]).filter(isValidHex).map(normalizeHex)
    const sortReference = foregroundFamily[0] ?? (mode === 'dark' ? '#ffffff' : '#000000')

    const rawBackgroundSteps = BACKGROUND_KEYS.map((key) => colors[key]).filter(isValidHex).map(normalizeHex)
    const backgroundSteps = ensureFourSurfaces(rawBackgroundSteps, sortReference)
    const rankedSurfaces = rankSurfacesByContrast(backgroundSteps, sortReference)

    const tail = mode === 'dark' ? ['#ffffff', '#000000'] : ['#000000', '#ffffff']
    const textPrimaryCandidates = FOREGROUND_KEYS
      .map((key) => colors[key])
      .filter(isValidHex)
      .map(normalizeHex)
      .concat(tail)

    return finalizeTokens(
      mode,
      themeName,
      rankedSurfaces,
      textPrimaryCandidates,
      colors.muted,
      colors.accent,
      colors.selection,
      foregroundFamily
    )
  } catch (error) {
    console.warn('[inkwell/theme] falling back to default palette:', error instanceof Error ? error.message : error)
    return buildFallbackTokens()
  }
}

export function watchTheme(onChange: (tokens: ThemeTokens) => void): () => void {
  let watcher: ReturnType<typeof watch> | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const scheduleReresolve = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      resolveTheme().then(onChange).catch(() => {})
    }, 120)
  }

  try {
    watcher = watch(CURRENT_DIR, { persistent: false }, scheduleReresolve)
    watcher.on('error', () => {})
  } catch {
    return () => {}
  }

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    watcher?.close()
  }
}
