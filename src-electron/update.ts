import { app, net } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** What the renderer needs to draw the indicator, or null for "say nothing". */
export type UpdateNotice = { version: string; url: string }

/* Tags, not releases. Inkwell ships as an Arch package built from a `v<x.y.z>`
   tag and publishes no GitHub Release objects, so `/releases/latest` answers
   404 and an indicator built on it would never appear. The tag page renders for
   a plain tag, which is what the indicator links to. */
const TAGS_URL = 'https://api.github.com/repos/mrelph/inkwell/tags?per_page=30'
const TAG_PAGE = 'https://github.com/mrelph/inkwell/releases/tag/'

const CHECK_EVERY = 24 * 60 * 60 * 1000
const TIMEOUT = 8000

type Cache = {
  /** Only ever set by a check that actually reached GitHub. */
  checkedAt: number
  /** Normalised `x.y.z` of the newest tag seen. */
  version?: string
  /** The tag verbatim, because the URL has to match what GitHub has. */
  tag?: string
  /** The version the user waved away; anything newer speaks up again. */
  dismissed?: string
}

type Version = [number, number, number]

/* Deliberately strict: a tag with a prerelease or build suffix is not something
   to nag anyone about, and an unparseable tag is not a version at all. */
const parseVersion = (raw: unknown): Version | null => {
  if (typeof raw !== 'string') return null
  const match = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(raw.trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

const compare = (a: Version, b: Version) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/* An env var rather than a preferences pane: Inkwell has no settings UI, and on
   Linux the way to say "never do that" is a line in a shell profile or the
   .desktop entry. Documented in the README. */
const disabled = () => {
  const value = process.env.INKWELL_NO_UPDATE_CHECK
  return value === '1' || value === 'true'
}

const cacheFile = () => path.join(app.getPath('userData'), 'update.json')

let cache: Cache | null = null

/* Same posture as state.ts: this is a file the user can open and mangle, and
   nothing in it is worth failing over. Every field is re-validated. */
async function readCache(): Promise<Cache> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await readFile(cacheFile(), 'utf8')) as Record<string, unknown>
    cache = {
      checkedAt: typeof parsed?.checkedAt === 'number' ? parsed.checkedAt : 0,
      version: parseVersion(parsed?.version) ? String(parsed.version) : undefined,
      tag: typeof parsed?.tag === 'string' ? parsed.tag : undefined,
      dismissed: parseVersion(parsed?.dismissed) ? String(parsed.dismissed) : undefined
    }
  } catch {
    cache = { checkedAt: 0 }
  }
  return cache
}

async function writeCache(next: Cache): Promise<void> {
  cache = next
  const target = cacheFile()
  try {
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(`${target}.tmp`, JSON.stringify(next, null, 2), 'utf8')
    await rename(`${target}.tmp`, target)
  } catch {
    /* Remembering the answer is a convenience; re-asking tomorrow is fine. */
  }
}

const toNotice = (state: Cache): UpdateNotice | null => {
  const latest = parseVersion(state.version)
  const running = parseVersion(app.getVersion())
  if (!latest || !running || !state.version) return null
  if (compare(latest, running) <= 0) return null
  const dismissed = parseVersion(state.dismissed)
  if (dismissed && compare(latest, dismissed) <= 0) return null
  return { version: state.version, url: `${TAG_PAGE}${state.tag ?? `v${state.version}`}` }
}

/* Electron's net rather than node:https: it goes through Chromium's stack, so a
   system or PAC proxy is honoured without Inkwell reimplementing any of it. */
async function fetchLatestTag(): Promise<{ version: string; tag: string } | null> {
  try {
    const response = await net.fetch(TAGS_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Inkwell/${app.getVersion()}`
      },
      signal: AbortSignal.timeout(TIMEOUT)
    })
    if (!response.ok) return null
    const payload: unknown = await response.json()
    if (!Array.isArray(payload)) return null

    let best: { version: string; tag: string; parsed: Version } | null = null
    for (const entry of payload) {
      const tag = typeof (entry as Record<string, unknown>)?.name === 'string'
        ? String((entry as Record<string, unknown>).name)
        : null
      const parsed = parseVersion(tag)
      if (!tag || !parsed) continue
      /* GitHub does not promise semver order, so take the maximum rather than
         the first entry. */
      if (!best || compare(parsed, best.parsed) > 0) best = { version: parsed.join('.'), tag, parsed }
    }
    return best ? { version: best.version, tag: best.tag } : null
  } catch {
    /* No network, no DNS, a captive portal, a rate limit, GitHub having a bad
       day: all one answer. Being offline is the normal case for a local-first
       app, not a fault, and it is never surfaced. */
    return null
  }
}

/** The last known answer, from cache only. Never touches the network. */
export async function knownUpdate(): Promise<UpdateNotice | null> {
  if (disabled()) return null
  return toNotice(await readCache())
}

/**
 * Asks GitHub at most once a day. Resolves to null far more often than not —
 * up to date, opted out, dismissed, or unreachable — and never rejects.
 */
export async function checkForUpdate(): Promise<UpdateNotice | null> {
  if (disabled()) return null
  const state = await readCache()
  if (Date.now() - state.checkedAt < CHECK_EVERY) return toNotice(state)

  const latest = await fetchLatestTag()
  /* A failed check does not stamp `checkedAt`. Launching on a train would
     otherwise buy a day of silence on a machine that came back online a minute
     later; the cost of not stamping it is one more request next launch. */
  if (!latest) return toNotice(state)

  const next: Cache = { ...state, checkedAt: Date.now(), version: latest.version, tag: latest.tag }
  await writeCache(next)
  return toNotice(next)
}

/** Waves away this version. Anything newer than it speaks up again. */
export async function dismissUpdate(version: unknown): Promise<void> {
  if (!parseVersion(version)) return
  await writeCache({ ...(await readCache()), dismissed: String(version) })
}
