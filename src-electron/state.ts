import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type RecentEntry = { path: string; name: string; openedAt: number }

export type InkwellState = {
  /** Folder sources, in the order the user added them. */
  folders: string[]
  recent: RecentEntry[]
  activePath?: string
  /** Once the user has opened anything of their own, the samples stop appearing. */
  introDone: boolean
}

const EMPTY: InkwellState = { folders: [], recent: [], introDone: false }

const MAX_FOLDERS = 8
const MAX_RECENT = 12

const stateFile = () => path.join(app.getPath('userData'), 'library.json')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/* The state file is plain JSON in a directory the user can open and edit, and a
   half-written or hand-mangled one must never take the app down with it. Every
   field is validated rather than trusted, and anything unrecognised is dropped
   in favour of the default. */
const sanitize = (value: unknown): InkwellState => {
  if (!isRecord(value)) return EMPTY

  const folders = Array.isArray(value.folders)
    ? value.folders.filter((entry): entry is string => typeof entry === 'string' && path.isAbsolute(entry)).slice(0, MAX_FOLDERS)
    : []

  const recent = Array.isArray(value.recent)
    ? value.recent
        .filter(isRecord)
        .filter((entry) => typeof entry.path === 'string' && path.isAbsolute(entry.path as string))
        .map((entry) => ({
          path: entry.path as string,
          name: typeof entry.name === 'string' ? entry.name : path.basename(entry.path as string),
          openedAt: typeof entry.openedAt === 'number' ? entry.openedAt : 0
        }))
        .slice(0, MAX_RECENT)
    : []

  return {
    folders,
    recent,
    activePath: typeof value.activePath === 'string' ? value.activePath : undefined,
    introDone: value.introDone === true
  }
}

export async function loadState(): Promise<InkwellState> {
  try {
    return sanitize(JSON.parse(await readFile(stateFile(), 'utf8')))
  } catch {
    /* No file yet, or an unreadable one: start clean rather than fail to open. */
    return EMPTY
  }
}

/* Written through a temporary file and renamed into place: the renderer saves on
   every library change, so a crash mid-write would otherwise be able to leave a
   truncated file that loses the whole library rather than one edit. */
export async function saveState(next: unknown): Promise<void> {
  const target = stateFile()
  const temporary = `${target}.tmp`
  try {
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(temporary, JSON.stringify(sanitize(next), null, 2), 'utf8')
    await rename(temporary, target)
  } catch {
    /* Persistence is a convenience; never surface it as a failure to the user. */
  }
}
