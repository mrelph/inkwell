import { isValidElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowUpCircle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Clock3,
  Copy,
  Ellipsis,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  History,
  LayoutPanelLeft,
  Maximize2,
  Menu,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  PencilLine,
  RefreshCw,
  Search,
  SplitSquareHorizontal,
  Trash2,
  X
} from 'lucide-react'
import '@fontsource-variable/manrope'
import '@fontsource/source-serif-4/400.css'
import '@fontsource/source-serif-4/600.css'
import '@fontsource/source-serif-4/700.css'
import './styles.css'

type ViewMode = 'read' | 'split' | 'write'

type MarkdownDoc = {
  id: string
  name: string
  content: string
  path?: string
  /** Which group in the library this belongs to — see SAMPLES/DRAFTS/RECENT. */
  sourceId: string
  isSample?: boolean
  isDirty?: boolean
  /** mtime Inkwell last saw on disk, used to detect an external edit. */
  savedAt?: number
}

/** A folder the user added to the library. Folders are sources, not workspaces:
    adding one never displaces another. */
type FolderSource = { id: string; name: string; path: string }

type Heading = { level: number; text: string; id: string }

/* The three groups that are not folders. Samples are first-run scaffolding,
   drafts are notes with no file yet, recent is everything opened from outside
   an added folder. */
const SAMPLES = 'samples'
const DRAFTS = 'drafts'
const RECENT = 'recent'

const MAX_FOLDERS = 8
const MAX_RECENT = 12

const folderIdFor = (folder: string) => `folder:${folder}`
const folderLabel = (folder: string) => folder.split('/').filter(Boolean).pop() ?? folder

/* Nested sources would list the same file twice under two headings, and the
   dedupe by path would silently drop one of them. Overlap is refused instead. */
const isInside = (child: string, parent: string) =>
  child === parent || child.startsWith(parent.endsWith('/') ? parent : `${parent}/`)

const toDoc = (file: DocumentFile, sourceId: string): MarkdownDoc => ({
  id: `file:${file.path}`,
  name: file.name,
  path: file.path,
  content: file.content,
  savedAt: file.savedAt,
  sourceId
})

const seedDocuments: MarkdownDoc[] = [
  {
    id: 'welcome',
    name: 'Welcome to Inkwell.md',
    sourceId: SAMPLES,
    isSample: true,
    content: `# Welcome to Inkwell

Inkwell is a quiet place to read and shape Markdown. It keeps the source close and the finished page even closer.

## A reader and an editor, in one place

Switch between a focused reading view, a clean writing view, or place them side by side. The document stays local to your machine; there is no account and no hidden workspace.

> This is a sample document. Add a folder or open a Markdown file to begin working with your own notes — these samples step aside as soon as you do.

## A few useful details

- **Open files** with \`Ctrl+O\`
- **Add a folder** to the library with \`Ctrl+Shift+O\`
- **Rename, duplicate, reveal or trash** a file from the ⋯ menu on its row
- **Save** with \`Ctrl+S\`
- **New note** with \`Ctrl+N\`
- Switch views with \`Ctrl+1\`, \`Ctrl+2\`, \`Ctrl+3\`
- Toggle the library with \`Ctrl+B\` and the outline with \`Ctrl+\\\`

### Markdown that reads well

Tables, task lists, links, code, and blockquotes all render in the reading view.

| Keeps | Feels like |
| --- | --- |
| Source | Yours |
| Reading | Calm |
| Saving | Immediate |

Happy writing.`
  },
  {
    id: 'studio-notes',
    name: 'Studio notes.md',
    sourceId: SAMPLES,
    isSample: true,
    content: `# Studio notes

## Before the page fills up

The first pass only needs enough structure to make the next thought easy.

- [x] Name the question
- [x] Gather fragments
- [ ] Decide what belongs on the page
- [ ] Let the rest wait

## A small rule

Keep one generous margin around the thing you are trying to understand.`
  },
  {
    id: 'reading-list',
    name: 'Reading list.md',
    sourceId: SAMPLES,
    isSample: true,
    content: `# Reading list

## This month

1. A book with a strong point of view
2. One long essay worth annotating
3. A technical manual that makes something difficult feel plain

## To revisit

The notes that are worth returning to usually have one unfinished edge.`
  },
  {
    id: 'field-guide',
    name: 'Field guide.md',
    sourceId: SAMPLES,
    isSample: true,
    content: `# A field guide to useful notes

## Start with the smallest true sentence

Instead of collecting a topic, make a claim you can test. A document with a clear first sentence tells you what evidence belongs nearby.

## Leave a trail of decisions

When a note changes direction, write down why. Future you needs the reasoning more than the final wording.

## Finish with a door

End a working note with the next possible move: a question, a source to check, or a person to ask.`
  }
]

const clampTitle = (value: string) => value.replace(/\.(md|mdx|markdown)$/i, '')

/* Heading anchors are derived from heading *text*, not from an ordinal. The
   outline scanner and the renderer are two independent parsers, so an ordinal
   scheme silently shifts every later anchor whenever they disagree (a `#` inside
   a fenced block, a setext heading). A content slug keeps every other heading
   correct even when one entry is missed. */
const inlineToText = (value: string) =>
  value
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()

const slugify = (value: string) => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'section'
}

const uniqueId = (counts: Map<string, number>, base: string) => {
  const seen = counts.get(base) ?? 0
  counts.set(base, seen + 1)
  return seen === 0 ? base : `${base}-${seen}`
}

/* Fence- and setext-aware so the outline matches what the reader actually
   renders. Levels 1-3 only, matching the outline's three indent levels. */
const getHeadings = (markdown: string): Heading[] => {
  const headings: Heading[] = []
  const counts = new Map<string, number>()
  const lines = markdown.split('\n')
  let fence: string | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceEdge = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fenceEdge) {
      const marker = fenceEdge[1][0]
      if (!fence) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (fence) continue

    let level = 0
    let raw = ''
    const atx = /^\s{0,3}(#{1,3})\s+(.*)$/.exec(line)
    if (atx) {
      level = atx[1].length
      raw = atx[2].replace(/\s+#+\s*$/, '')
    } else {
      const underline = lines[index + 1]
      const isSetext = underline !== undefined && /^\s{0,3}(=+|-+)\s*$/.test(underline)
      if (isSetext && line.trim() && !/^\s{0,3}#/.test(line)) {
        level = underline.trim().startsWith('=') ? 1 : 2
        raw = line
      }
    }

    const text = inlineToText(raw)
    if (!level || !text) continue
    headings.push({ level, text, id: uniqueId(counts, slugify(text)) })
  }

  return headings
}

const childrenToText = (node: ReactNode): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(childrenToText).join('')
  if (isValidElement(node)) return childrenToText((node.props as { children?: ReactNode }).children)
  return ''
}

function Reader({ content }: { content: string }) {
  /* Reset per render so ids stay stable and StrictMode's double invocation
     converges on the same result. */
  const counts = new Map<string, number>()
  const anchor = (level: 1 | 2 | 3 | 4 | 5 | 6) => ({ children }: { children?: ReactNode }) => {
    const id = uniqueId(counts, slugify(inlineToText(childrenToText(children))))
    const Tag = `h${level}` as const
    return <Tag id={id}>{children}</Tag>
  }

  return (
    <article className="markdown-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: anchor(1),
          h2: anchor(2),
          h3: anchor(3),
          h4: anchor(4),
          h5: anchor(5),
          h6: anchor(6),
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
}
type LibraryKind = 'folder' | 'drafts' | 'recent' | 'samples'

/* A row is what the pane shows, which is not the same as a document: a recent
   file that is not open has a path and a name but no content behind it yet. */
type LibraryRow = {
  key: string
  name: string
  path?: string
  doc?: MarkdownDoc
  kind: LibraryKind
  meta: string
}

type LibraryGroup = {
  id: string
  name: string
  kind: LibraryKind
  path?: string
  rows: LibraryRow[]
}

type MenuItem = {
  key: string
  label: string
  icon: ReactNode
  run: () => void
  danger?: boolean
  separated?: boolean
}

/* The row actions. Opened by the row's ⋯ button or a right-click, positioned at
   the pointer and clamped into the window — Inkwell can be tiled into a very
   small rectangle, where an unclamped menu would open off-screen. */
function RowMenu({ items, origin, onClose }: {
  items: MenuItem[]
  origin: { x: number; y: number }
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const ranItem = useRef(false)
  const [placed, setPlaced] = useState({ x: origin.x, y: origin.y, ready: false })

  useLayoutEffect(() => {
    const element = panel.current
    if (!element) return
    const { width, height } = element.getBoundingClientRect()
    setPlaced({
      x: Math.max(6, Math.min(origin.x, window.innerWidth - width - 6)),
      y: Math.max(6, Math.min(origin.y, window.innerHeight - height - 6)),
      ready: true
    })
  }, [origin.x, origin.y])

  /* Focus only once the menu is placed: it is hidden until then, and a hidden
     element cannot take focus — which left arrow keys doing nothing. */
  useEffect(() => {
    if (!placed.ready) return
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [placed.ready])

  /* Dismissing without choosing anything hands focus back to the control that
     opened the menu. Running an item does not: the item may well have moved
     focus itself, as Rename does. */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    return () => { if (!ranItem.current) opener?.focus?.() }
  }, [])

  useEffect(() => {
    const dismiss = () => onClose()
    const onPointerDown = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('resize', dismiss)
    window.addEventListener('blur', dismiss)
    /* Capture phase: the library scrolls inside its own container, so a bubbling
       listener on window would never see it and the menu would drift. */
    document.addEventListener('scroll', dismiss, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('blur', dismiss)
      document.removeEventListener('scroll', dismiss, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [onClose])

  /* Escape must not fall through to the window handler, which would also leave
     focus writing or close the outline. */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    if (!buttons.length) return
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1
    buttons[(next + buttons.length) % buttons.length].focus()
  }

  return (
    <div
      ref={panel}
      className="row-menu"
      role="menu"
      aria-label="Document actions"
      onKeyDown={onKeyDown}
      style={{ left: placed.x, top: placed.y, visibility: placed.ready ? 'visible' : 'hidden' }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          role="menuitem"
          className={`${item.danger ? 'danger' : ''} ${item.separated ? 'separated' : ''}`.trim()}
          onClick={() => { ranItem.current = true; onClose(); item.run() }}
        >
          {item.icon} <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}

/* A tiling compositor hands Inkwell whatever geometry the layout dictates,
   often a quarter of the screen, and the width at mount is not the width the
   user ends up with. Both side panels fold away once the window stops having
   room for them and unfold when the room comes back — but only if Inkwell was
   the one that folded them. Closing a panel by hand is a decision at any
   width, and a resize must never overrule it. */
function useAutoCollapse(query: string, open: boolean, setOpen: (next: boolean) => void) {
  const openRef = useRef(open)
  const autoClosed = useRef(false)

  useEffect(() => { openRef.current = open }, [open])

  useEffect(() => {
    const tight = window.matchMedia(query)
    const sync = () => {
      if (tight.matches) {
        if (openRef.current) autoClosed.current = true
        setOpen(false)
      } else if (autoClosed.current) {
        autoClosed.current = false
        setOpen(true)
      }
    }
    sync()
    tight.addEventListener('change', sync)
    return () => tight.removeEventListener('change', sync)
  }, [query, setOpen])
}

function App() {
  const [documents, setDocuments] = useState<MarkdownDoc[]>([])
  const [folders, setFolders] = useState<FolderSource[]>([])
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<string[]>([])
  /* Nothing is persisted until the stored library has been read back, or the
     first render would save an empty library over a real one. */
  const [restored, setRestored] = useState(false)
  const [introDone, setIntroDone] = useState(false)
  const [view, setView] = useState<ViewMode>('split')
  const [query, setQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  /* Only open by default where the outline gets a real column. Below that it
     overlays the canvas, and a tiled window should start on the document. */
  const [outlineOpen, setOutlineOpen] = useState(
    () => !window.matchMedia('(max-width: 1120px)').matches
  )
  const [focusMode, setFocusMode] = useState(false)
  const [notice, setNotice] = useState('Reading your library')
  const [update, setUpdate] = useState<UpdateNotice | null>(null)
  const [menu, setMenu] = useState<{ row: LibraryRow; x: number; y: number } | null>(null)
  const [renamingKey, setRenamingKey] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const draftSerial = useRef(0)
  /* Escape unmounts the rename input, which fires its blur handler on the way
     out. Without this the cancel would be committed as a rename. */
  const renameCanceled = useRef(false)

  const activeDocument = documents.find((doc) => doc.id === activeId)
  const headings = useMemo(() => getHeadings(activeDocument?.content ?? ''), [activeDocument?.content])
  const wordCount = useMemo(
    () => (activeDocument?.content ?? '').trim().split(/\s+/).filter(Boolean).length,
    [activeDocument?.content]
  )

  /* A file opened from a folder already in the library belongs to that folder's
     group, wherever it was opened from. Everything else is recent. */
  const sourceForPath = useCallback(
    (filePath: string) => folders.find((folder) => isInside(filePath, folder.path))?.id ?? RECENT,
    [folders]
  )

  const rememberRecent = useCallback((files: { path: string; name: string }[]) => {
    if (!files.length) return
    const openedAt = Date.now()
    setRecent((current) => {
      const fresh = files.map((file) => ({ path: file.path, name: file.name, openedAt }))
      const rest = current.filter((entry) => !fresh.some((item) => item.path === entry.path))
      return [...fresh, ...rest].slice(0, MAX_RECENT)
    })
  }, [])

  /* The samples are scaffolding for an empty first run. The moment real work
     arrives they step aside — an edited one stays, because discarding a
     document someone has typed into is never scaffolding behaviour. */
  const withoutSamples = (docs: MarkdownDoc[]) => docs.filter((doc) => !doc.isSample || doc.isDirty)

  const forgetPath = useCallback((filePath: string) => {
    setDocuments((current) => current.filter((doc) => doc.path !== filePath))
    setRecent((current) => current.filter((entry) => entry.path !== filePath))
    setActiveId((current) => (current === `file:${filePath}` ? null : current))
  }, [])

  /* Restore the library: the folders that were open, the recent list, and the
     document that was in front. A folder that has since been deleted or
     unmounted is dropped rather than reported — it is not an error that the
     user needs to answer for. */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const bridge = window.inkwell
      if (!bridge?.loadState) {
        setDocuments(seedDocuments)
        setActiveId(seedDocuments[0].id)
        setNotice('Sample document · unsaved')
        setRestored(true)
        return
      }

      let state: InkwellState
      try {
        state = await bridge.loadState()
      } catch {
        state = { folders: [], recent: [], introDone: false }
      }

      const results = await Promise.all(state.folders.map(async (folder) => {
        try {
          return await bridge.readFolder(folder)
        } catch {
          return { folder: '', documents: [] as DocumentFile[] }
        }
      }))
      if (cancelled) return

      const liveFolders: FolderSource[] = []
      const restoredDocs: MarkdownDoc[] = []
      results.forEach((result) => {
        if (!result.folder) return
        const id = folderIdFor(result.folder)
        liveFolders.push({ id, name: folderLabel(result.folder), path: result.folder })
        result.documents.forEach((file) => {
          if (!restoredDocs.some((doc) => doc.path === file.path)) restoredDocs.push(toDoc(file, id))
        })
      })

      /* The document you were last in, when it is not inside one of the folders
         that just came back. */
      if (state.activePath && !restoredDocs.some((doc) => doc.path === state.activePath)) {
        const reopened = await bridge.readDocuments([state.activePath]).catch(() => [] as DocumentFile[])
        reopened.forEach((file) => restoredDocs.unshift(toDoc(file, RECENT)))
      }
      if (cancelled) return

      const hasLibrary = restoredDocs.length > 0 || state.recent.length > 0
      setFolders(liveFolders)
      setRecent(state.recent)
      setIntroDone(state.introDone || hasLibrary)
      setDocuments(hasLibrary ? restoredDocs : seedDocuments)
      const active = restoredDocs.find((doc) => doc.path === state.activePath) ?? restoredDocs[0]
      setActiveId(hasLibrary ? active?.id ?? null : seedDocuments[0].id)
      setNotice(
        hasLibrary
          ? `${restoredDocs.length} ${restoredDocs.length === 1 ? 'document' : 'documents'} in your library`
          : 'Sample document · unsaved'
      )
      setRestored(true)
    })()
    return () => { cancelled = true }
  }, [])

  /* Persist on a short delay: typing in the editor does not touch any of this,
     but adding and closing documents can arrive in bursts. */
  useEffect(() => {
    if (!restored) return
    const handle = window.setTimeout(() => {
      window.inkwell?.saveState?.({
        folders: folders.map((folder) => folder.path),
        recent: recent.slice(0, MAX_RECENT),
        activePath: activeDocument?.path,
        introDone
      })
    }, 400)
    return () => window.clearTimeout(handle)
  }, [restored, folders, recent, activeDocument?.path, introDone])

  /* Follow the active Omarchy theme. Tokens arrive as CSS custom properties and
     are applied to :root, so a theme switch repaints without a reload. */
  useEffect(() => {
    const apply = (theme: { mode?: string; colors?: Record<string, string> } | null) => {
      if (!theme?.colors) return
      const root = document.documentElement
      for (const [key, value] of Object.entries(theme.colors)) {
        root.style.setProperty(key.startsWith('--') ? key : `--${key}`, value)
      }
      if (theme.mode) root.dataset.themeMode = theme.mode
    }
    void window.inkwell?.getTheme?.().then(apply).catch(() => undefined)
    return window.inkwell?.onThemeChange?.(apply)
  }, [])

  /* The one thing Inkwell asks the network about. It appears only when a newer
     tag exists, and never announces its own failure: offline is the normal
     state for a local-first editor, so an unreachable GitHub simply leaves the
     status bar as it was. The cached answer arrives first, the live check
     later. */
  useEffect(() => {
    void window.inkwell?.getUpdate?.().then((notice) => setUpdate(notice ?? null)).catch(() => undefined)
    return window.inkwell?.onUpdateAvailable?.((notice) => setUpdate(notice ?? null))
  }, [])

  /* The outline goes first, at the width where it loses its own column and
     would otherwise overlay the document. The library holds on longer: it is
     how you move between documents, so it only folds once a split has stopped
     fitting and its 250px is most of what is left. Both breakpoints match ones
     styles.css already uses rather than inventing new ones. */
  useAutoCollapse('(max-width: 1120px)', outlineOpen, setOutlineOpen)
  useAutoCollapse('(max-width: 820px)', sidebarOpen, setSidebarOpen)

  /* Opening files only ever adds: nothing already in the library is discarded,
     and a file that is already there is activated rather than duplicated. Ids
     are keyed on path so re-opening resolves to the same entry. */
  const addDocuments = useCallback((incoming: DocumentFile[]) => {
    if (!incoming.length) return
    setDocuments((current) => {
      const kept = withoutSamples(current)
      const fresh = incoming
        .filter((file) => !kept.some((doc) => doc.path === file.path))
        .map((file) => toDoc(file, sourceForPath(file.path)))
      return fresh.length ? [...fresh, ...kept] : kept
    })
    setActiveId(`file:${incoming[0].path}`)
    rememberRecent(incoming)
    setIntroDone(true)
    setNotice(incoming.length === 1 ? `Opened ${incoming[0].name}` : `Opened ${incoming.length} files`)
  }, [rememberRecent, sourceForPath])

  useEffect(() => {
    return window.inkwell?.onOpenExternal?.((incoming) => addDocuments(incoming))
  }, [addDocuments])

  const openFiles = useCallback(async () => {
    try {
      const incoming = await window.inkwell?.openDocuments()
      if (incoming?.length) addDocuments(incoming)
    } catch {
      setNotice('Could not open those files — check permissions and try again')
    }
  }, [addDocuments])

  /* Adding a folder is additive too. It is a *source*: a place the library
     watches, not a workspace that replaces what is already open. */
  const addFolder = useCallback(async () => {
    try {
      const result = await window.inkwell?.openFolder()
      if (!result?.folder) return
      const overlap = folders.find((folder) => isInside(result.folder, folder.path) || isInside(folder.path, result.folder))
      if (overlap) {
        setNotice(overlap.path === result.folder
          ? `${overlap.name} is already in the library`
          : `That folder overlaps ${overlap.name}, which is already here`)
        return
      }
      if (folders.length >= MAX_FOLDERS) {
        setNotice(`${MAX_FOLDERS} folders is the limit — remove one first`)
        return
      }
      const id = folderIdFor(result.folder)
      const source: FolderSource = { id, name: folderLabel(result.folder), path: result.folder }
      setFolders((current) => [...current, source])
      setDocuments((current) => {
        const kept = withoutSamples(current)
        /* A file opened ad hoc that lives in this folder now belongs to it. */
        const adopted = kept.map((doc) => (doc.path && isInside(doc.path, result.folder) ? { ...doc, sourceId: id } : doc))
        const fresh = result.documents
          .filter((file) => !adopted.some((doc) => doc.path === file.path))
          .map((file) => toDoc(file, id))
        return [...adopted, ...fresh]
      })
      setIntroDone(true)
      setActiveId((current) => current ?? (result.documents[0] ? `file:${result.documents[0].path}` : null))
      setNotice(`Added ${source.name} · ${result.documents.length} ${result.documents.length === 1 ? 'file' : 'files'}`)
    } catch {
      setNotice('Could not read that folder — check permissions and try again')
    }
  }, [folders])

  /* Re-reads a folder from disk. Documents with unsaved edits are kept as they
     are: a refresh must never be a way to lose typing. */
  const refreshFolder = useCallback(async (source: FolderSource) => {
    const result = await window.inkwell?.readFolder(source.path).catch(() => null)
    if (!result?.folder) {
      setNotice(`${source.name} is no longer on disk`)
      return
    }
    setDocuments((current) => {
      const kept = current.filter((doc) => doc.sourceId !== source.id || doc.isDirty)
      const fresh = result.documents
        .filter((file) => !kept.some((doc) => doc.path === file.path))
        .map((file) => toDoc(file, source.id))
      return [...kept, ...fresh]
    })
    setNotice(`Refreshed ${source.name} · ${result.documents.length} ${result.documents.length === 1 ? 'file' : 'files'}`)
  }, [])

  const confirmDiscardOf = useCallback(async (dirty: MarkdownDoc[]) => {
    if (!dirty.length) return true
    const names = dirty.map((doc) => clampTitle(doc.name)).join(', ')
    const discard = await window.inkwell?.confirmDiscard?.(names)
    return discard !== false
  }, [])

  const removeFolder = useCallback(async (source: FolderSource) => {
    const owned = documents.filter((doc) => doc.sourceId === source.id)
    if (!(await confirmDiscardOf(owned.filter((doc) => doc.isDirty)))) return
    setFolders((current) => current.filter((folder) => folder.id !== source.id))
    setDocuments((current) => current.filter((doc) => doc.sourceId !== source.id))
    setActiveId((current) => (owned.some((doc) => doc.id === current) ? null : current))
    setNotice(`Removed ${source.name} from the library`)
  }, [confirmDiscardOf, documents])

  const updateContent = (content: string) => {
    if (!activeDocument) return
    setDocuments((current) => current.map((doc) => doc.id === activeId ? { ...doc, content, isDirty: true } : doc))
    setNotice('Edited · not saved')
  }

  const createDocument = useCallback(() => {
    draftSerial.current += 1
    const serial = draftSerial.current
    const newDocument: MarkdownDoc = {
      id: `draft:${serial}`,
      name: serial === 1 ? 'Untitled note.md' : `Untitled note ${serial}.md`,
      content: '# Untitled note\n\nStart with the smallest true sentence.\n',
      sourceId: DRAFTS,
      isDirty: true
    }
    setDocuments((current) => [newDocument, ...withoutSamples(current)])
    setActiveId(newDocument.id)
    setIntroDone(true)
    setView('write')
    setNotice('New local draft · choose Save to place it')
    window.setTimeout(() => editorRef.current?.focus(), 40)
  }, [])

  const saveDocument = useCallback(async (forceSaveAs = false) => {
    if (!window.inkwell || !activeDocument) return
    const target = activeDocument
    try {
      const saved = await window.inkwell.saveDocument({
        content: target.content,
        path: target.path,
        forceSaveAs,
        knownMtime: target.savedAt
      })
      if (saved.canceled || !saved.path) return
      const savedPath = saved.path
      const fileName = savedPath.split('/').pop() ?? target.name
      /* A draft that has just been given a path stops being a draft: it moves
         to the folder that now holds it, or to recent. */
      const sourceId = sourceForPath(savedPath)
      setDocuments((current) => current.map((doc) => doc.id === target.id ? {
        ...doc,
        id: `file:${savedPath}`,
        path: savedPath,
        name: fileName,
        sourceId,
        savedAt: saved.savedAt,
        isSample: false,
        isDirty: false
      } : doc))
      setActiveId(`file:${savedPath}`)
      if (sourceId === RECENT) rememberRecent([{ path: savedPath, name: fileName }])
      setNotice(`Saved ${fileName}`)
    } catch {
      setNotice('Could not save this document — try Save As again')
    }
  }, [activeDocument, rememberRecent, sourceForPath])

  /* Closing takes a document out of the library. For a folder file that would
     be meaningless — the folder still holds it — so only drafts, samples and
     recent files offer it. */
  const closeRow = useCallback(async (row: LibraryRow) => {
    const doc = row.doc
    if (doc?.isDirty && !(await confirmDiscardOf([doc]))) return
    if (doc) {
      const index = documents.findIndex((item) => item.id === doc.id)
      const remaining = documents.filter((item) => item.id !== doc.id)
      setDocuments(remaining)
      /* Land on the neighbour rather than nothing, and on nothing when that was
         the last document — an empty library is a legitimate state. */
      if (activeId === doc.id) setActiveId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null)
    }
    if (row.kind === 'recent' && row.path) setRecent((current) => current.filter((entry) => entry.path !== row.path))
    setNotice(row.kind === 'recent'
      ? `Removed ${clampTitle(row.name)} from recent`
      : `Closed ${clampTitle(row.name)}`)
  }, [activeId, confirmDiscardOf, documents])

  /* Opening a row that has never been loaded — a recent file from a previous
     session. Everything else is already in memory and just becomes active. */
  const openRow = useCallback(async (row: LibraryRow) => {
    if (row.doc) {
      setActiveId(row.doc.id)
      return
    }
    if (!row.path) return
    const files = await window.inkwell?.readDocuments([row.path]).catch(() => [] as DocumentFile[])
    if (!files?.length) {
      setNotice(`${clampTitle(row.name)} is no longer at that path`)
      forgetPath(row.path)
      return
    }
    addDocuments(files)
  }, [addDocuments, forgetPath])

  const startRename = useCallback((row: LibraryRow) => {
    renameCanceled.current = false
    setRenamingKey(row.key)
    setRenameDraft(row.name)
  }, [])

  const commitRename = useCallback(async (row: LibraryRow) => {
    const nextName = renameDraft.trim()
    setRenamingKey(null)
    if (renameCanceled.current) {
      renameCanceled.current = false
      return
    }
    if (!row.path || !nextName || nextName === row.name) return
    const result = await window.inkwell?.renameDocument({ path: row.path, name: nextName })
    if (!result) return
    if (!result.ok) {
      setNotice(result.reason)
      return
    }
    const previousPath = row.path
    setDocuments((current) => current.map((doc) => doc.path === previousPath ? {
      ...doc,
      id: `file:${result.path}`,
      path: result.path,
      name: result.name,
      savedAt: result.savedAt ?? doc.savedAt
    } : doc))
    setRecent((current) => current.map((entry) => entry.path === previousPath
      ? { ...entry, path: result.path, name: result.name }
      : entry))
    setActiveId((current) => (current === `file:${previousPath}` ? `file:${result.path}` : current))
    setNotice(`Renamed to ${clampTitle(result.name)}`)
  }, [renameDraft])

  const duplicateRow = useCallback(async (row: LibraryRow) => {
    if (!row.path) return
    const file = await window.inkwell?.duplicateDocument(row.path).catch(() => null)
    if (!file) {
      setNotice(`Could not duplicate ${clampTitle(row.name)}`)
      return
    }
    setDocuments((current) => [toDoc(file, sourceForPath(file.path)), ...withoutSamples(current)])
    setActiveId(`file:${file.path}`)
    setNotice(`Duplicated as ${clampTitle(file.name)}`)
  }, [sourceForPath])

  const trashRow = useCallback(async (row: LibraryRow) => {
    if (!row.path) return
    const confirmed = await window.inkwell?.confirmTrash(row.name)
    if (confirmed !== true) return
    const trashed = await window.inkwell?.trashDocument(row.path).catch(() => false)
    if (!trashed) {
      setNotice(`Could not move ${clampTitle(row.name)} to the trash`)
      return
    }
    forgetPath(row.path)
    setNotice(`Moved ${clampTitle(row.name)} to the trash`)
  }, [forgetPath])

  const dismissUpdate = () => {
    if (update) window.inkwell?.dismissUpdate?.(update.version)
    setUpdate(null)
  }

  const menuItemsFor = useCallback((row: LibraryRow): MenuItem[] => {
    const items: MenuItem[] = [
      { key: 'open', label: row.doc ? 'Open' : 'Open file', icon: <BookOpen size={14} />, run: () => void openRow(row) }
    ]
    if (row.path) {
      items.push(
        { key: 'rename', label: 'Rename…', icon: <PencilLine size={14} />, run: () => startRename(row) },
        { key: 'duplicate', label: 'Duplicate', icon: <Copy size={14} />, run: () => void duplicateRow(row) },
        { key: 'reveal', label: 'Reveal in file manager', icon: <FolderOpen size={14} />, run: () => window.inkwell?.revealDocument(row.path!) },
        { key: 'copy', label: 'Copy path', icon: <ClipboardCopy size={14} />, run: () => { window.inkwell?.copyText(row.path!); setNotice('Path copied') } }
      )
    }
    if (row.kind !== 'folder') {
      items.push({
        key: 'close',
        separated: true,
        label: row.kind === 'recent' ? 'Remove from recent' : row.kind === 'samples' ? 'Dismiss sample' : 'Discard draft',
        icon: <X size={14} />,
        run: () => void closeRow(row)
      })
    }
    if (row.path) {
      items.push({
        key: 'trash',
        label: 'Move to trash…',
        icon: <Trash2 size={14} />,
        danger: true,
        separated: row.kind === 'folder',
        run: () => void trashRow(row)
      })
    }
    return items
  }, [closeRow, duplicateRow, openRow, startRename, trashRow])

  /* One group per source, in a fixed order: the folders you chose, then the
     drafts that have nowhere to live yet, then recent files, then the samples
     if they are still around. */
  const groups = useMemo<LibraryGroup[]>(() => {
    const normalized = query.trim().toLowerCase()
    const matchesDoc = (doc: MarkdownDoc) => !normalized || `${doc.name} ${doc.content}`.toLowerCase().includes(normalized)
    const matchesName = (name: string) => !normalized || name.toLowerCase().includes(normalized)
    const rowFor = (doc: MarkdownDoc, kind: LibraryKind): LibraryRow => ({
      key: doc.id,
      name: doc.name,
      path: doc.path,
      doc,
      kind,
      meta: doc.isSample ? 'Sample' : doc.path ? 'Local file' : 'Draft'
    })

    const list: LibraryGroup[] = folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      kind: 'folder' as const,
      path: folder.path,
      rows: documents
        .filter((doc) => doc.sourceId === folder.id && matchesDoc(doc))
        .sort((first, second) => first.name.localeCompare(second.name))
        .map((doc) => rowFor(doc, 'folder'))
    }))

    const drafts = documents.filter((doc) => doc.sourceId === DRAFTS && matchesDoc(doc)).map((doc) => rowFor(doc, 'drafts'))
    if (drafts.length) list.push({ id: DRAFTS, name: 'Drafts', kind: 'drafts', rows: drafts })

    /* Recent holds two kinds of row: files open in this session, and files
       remembered from an earlier one that have not been read back yet. A file
       inside an added folder is listed there instead of twice. */
    const openRecent = documents.filter((doc) => doc.sourceId === RECENT)
    const seen = new Set<string>()
    const recentRows: LibraryRow[] = []
    openRecent.forEach((doc) => {
      if (doc.path) seen.add(doc.path)
      if (matchesDoc(doc)) recentRows.push(rowFor(doc, 'recent'))
    })
    recent.forEach((entry) => {
      if (seen.has(entry.path)) return
      if (folders.some((folder) => isInside(entry.path, folder.path))) return
      seen.add(entry.path)
      if (matchesName(entry.name)) {
        recentRows.push({ key: `recent:${entry.path}`, name: entry.name, path: entry.path, kind: 'recent', meta: 'Not open' })
      }
    })
    if (recentRows.length) list.push({ id: RECENT, name: 'Recent', kind: 'recent', rows: recentRows })

    const samples = documents.filter((doc) => doc.sourceId === SAMPLES && matchesDoc(doc)).map((doc) => rowFor(doc, 'samples'))
    if (samples.length) list.push({ id: SAMPLES, name: 'Sample documents', kind: 'samples', rows: samples })

    return normalized ? list.filter((group) => group.rows.length) : list
  }, [documents, folders, query, recent])

  /* Close acts on whatever is active, which the sidebar already models as a
     row. Finding it there rather than rebuilding the rules means folder files
     stay excluded for exactly the reason the row menu excludes them: closing
     one would be meaningless while its folder still lists it. */
  const activeRow = useMemo(
    () => groups.flatMap((group) => group.rows).find((row) => row.doc?.id === activeId) ?? null,
    [groups, activeId]
  )
  const closableRow = activeRow && activeRow.kind !== 'folder' ? activeRow : null

  const rowCount = groups.reduce((total, group) => total + group.rows.length, 0)
  /* A search expands everything: a collapsed group hiding the only match reads
     as "no results". */
  const isOpenGroup = (group: LibraryGroup) => Boolean(query.trim()) || !collapsed.includes(group.id)
  const toggleGroup = (id: string) =>
    setCollapsed((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])

  /* Focus writing is orthogonal to the view mode rather than a fourth mode:
     focus + split is a legitimate combination. Reading has no writing surface,
     so entering focus from Read promotes to Write. */
  const toggleFocus = useCallback(() => {
    const next = !focusMode
    setFocusMode(next)
    if (next && view === 'read') setView('write')
  }, [focusMode, view])

  const toggleSplit = useCallback(() => {
    setView((current) => (current === 'split' ? 'write' : 'split'))
  }, [])

  const switchToHeading = (id: string) => {
    if (view === 'write') setView('read')
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
  }

  /* Keep the latest handlers in a ref so the global listener attaches once
     instead of being torn down and rebuilt on every render. */
  const actions = useRef({ saveDocument, openFiles, addFolder, createDocument, setView, setSidebarOpen, setOutlineOpen, toggleFocus, toggleSplit, focusMode })
  actions.current = { saveDocument, openFiles, addFolder, createDocument, setView, setSidebarOpen, setOutlineOpen, toggleFocus, toggleSplit, focusMode }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = actions.current
      /* Escape leaves focus writing first: it is the more enclosing state, and
         the outline is not visible while focus mode is on. */
      if (event.key === 'Escape') {
        if (current.focusMode) current.toggleFocus()
        else current.setOutlineOpen(false)
        return
      }
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      const claim = () => event.preventDefault()

      if (key === 's') {
        claim()
        void current.saveDocument(event.shiftKey)
      } else if (key === 'o') {
        claim()
        if (event.shiftKey) void current.addFolder()
        else void current.openFiles()
      } else if (key === 'n') {
        claim()
        current.createDocument()
      } else if (key === 'f' && event.shiftKey) {
        claim()
        current.toggleFocus()
      } else if (key === 'b') {
        claim()
        current.setSidebarOpen((open) => !open)
      } else if (key === '\\') {
        claim()
        current.setOutlineOpen((open) => !open)
      } else if (key === '1' || key === '2' || key === '3') {
        claim()
        current.setView(key === '1' ? 'read' : key === '2' ? 'split' : 'write')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    window.inkwell?.setDirty(documents.some((doc) => doc.isDirty))
  }, [documents])

  const shellClass = [
    'app-shell',
    sidebarOpen ? 'sidebar-open' : 'sidebar-collapsed',
    outlineOpen ? '' : 'outline-collapsed',
    focusMode ? 'focus-mode' : '',
    focusMode && view === 'split' ? 'split-focus' : ''
  ].filter(Boolean).join(' ')

  return (
    <main className={shellClass}>
      <aside className="sidebar" aria-label="Library">
        <div className="sidebar-actions">
          <button className="new-note" title="New note (Ctrl+N)" onClick={createDocument}><FilePlus2 size={16} strokeWidth={1.8} /> New note</button>
          <button className="icon-button" aria-label="Open Markdown file" title="Open a file — adds it to Recent (Ctrl+O)" onClick={() => void openFiles()}><FileText size={18} strokeWidth={1.7} /></button>
          <button className="icon-button" aria-label="Add folder to the library" title="Add a folder — keeps its Markdown in the library (Ctrl+Shift+O)" onClick={() => void addFolder()}><FolderPlus size={18} strokeWidth={1.7} /></button>
          <button
            className="icon-button"
            aria-label={closableRow ? `Close ${closableRow.name}` : 'Close the current document'}
            title={closableRow
              ? `Close ${closableRow.name}`
              : activeRow
                ? 'A file in an added folder stays in the library — remove the folder instead, or move the file to the trash'
                : 'Nothing open to close'}
            disabled={!closableRow}
            onClick={() => { if (closableRow) void closeRow(closableRow) }}
          >
            <X size={18} strokeWidth={1.7} />
          </button>
        </div>

        <label className="search-box">
          <Search size={16} strokeWidth={1.7} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find in documents" aria-label="Find in documents" />
          {query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
        </label>

        <div className="library-scroll">
          {groups.map((group) => (
            <section className="library-group" key={group.id}>
              <div className="library-label">
                <button
                  className="folder-line"
                  aria-expanded={isOpenGroup(group)}
                  aria-controls={`group-${group.id}`}
                  title={group.path ?? group.name}
                  onClick={() => toggleGroup(group.id)}
                >
                  <ChevronDown size={14} />
                  {group.kind === 'recent' && <History size={12} strokeWidth={1.9} />}
                  <span>{group.name}</span>
                </button>
                <span className="group-count">{group.rows.length}</span>
                {group.kind === 'folder' && (
                  <>
                    <button
                      className="group-action"
                      aria-label={`Refresh ${group.name}`}
                      title="Re-read this folder from disk"
                      onClick={() => void refreshFolder({ id: group.id, name: group.name, path: group.path ?? '' })}
                    >
                      <RefreshCw size={12} strokeWidth={2} />
                    </button>
                    <button
                      className="group-action"
                      aria-label={`Remove ${group.name} from the library`}
                      title="Remove this folder from the library — the files stay on disk"
                      onClick={() => void removeFolder({ id: group.id, name: group.name, path: group.path ?? '' })}
                    >
                      <X size={13} strokeWidth={2} />
                    </button>
                  </>
                )}
              </div>

              {isOpenGroup(group) && (
                <div className="document-list" id={`group-${group.id}`}>
                  {group.rows.length ? group.rows.map((row) => (
                    <div
                      className={`document-row ${row.doc ? '' : 'unopened'}`}
                      key={row.key}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setMenu({ row, x: event.clientX, y: event.clientY })
                      }}
                    >
                      {renamingKey === row.key ? (
                        <form
                          className="rename-form"
                          onSubmit={(event) => { event.preventDefault(); void commitRename(row) }}
                        >
                          <input
                            autoFocus
                            value={renameDraft}
                            aria-label={`Rename ${clampTitle(row.name)}`}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onBlur={() => void commitRename(row)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Escape') return
                              event.stopPropagation()
                              renameCanceled.current = true
                              setRenamingKey(null)
                            }}
                          />
                        </form>
                      ) : (
                        <>
                          <button
                            className={`document-item ${row.doc && row.doc.id === activeId ? 'active' : ''}`}
                            aria-current={Boolean(row.doc && row.doc.id === activeId)}
                            title={row.path ?? 'Unsaved draft — not yet on disk'}
                            onClick={() => void openRow(row)}
                          >
                            <FileText size={16} strokeWidth={1.6} />
                            <span>
                              <strong>{clampTitle(row.name)}</strong>
                              <small>
                                {row.doc?.isDirty && <span className="dirty-mark" aria-label="Unsaved changes">• </span>}
                                {row.meta}
                              </small>
                            </span>
                          </button>
                          <button
                            className="row-menu-button"
                            aria-haspopup="menu"
                            aria-label={`Actions for ${clampTitle(row.name)}`}
                            title="Actions"
                            onClick={(event) => {
                              const bounds = event.currentTarget.getBoundingClientRect()
                              setMenu({ row, x: bounds.left, y: bounds.bottom + 4 })
                            }}
                          >
                            <Ellipsis size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  )) : (
                    <p className="empty-library">No Markdown files in this folder.</p>
                  )}
                </div>
              )}
            </section>
          ))}

          {!rowCount && (
            <p className="empty-library">
              {!restored
                ? 'Reading your library…'
                : query
                  ? `Nothing matches “${query}”.`
                  : 'Nothing here yet. Add a folder with Ctrl+Shift+O, open a file with Ctrl+O, or start a note with Ctrl+N.'}
            </p>
          )}
        </div>
      </aside>

      <section className="workspace">
        <header className="document-header">
          <div className="document-identity">
            {focusMode ? (
              <button className="icon-button" aria-label="Leave focus writing" title="Leave focus writing (Escape)" onClick={toggleFocus}>
                <Minimize2 size={18} strokeWidth={1.7} />
              </button>
            ) : (
              <button className="icon-button" aria-label={sidebarOpen ? 'Hide library' : 'Show library'} aria-expanded={sidebarOpen} title="Library (Ctrl+B)" onClick={() => setSidebarOpen((open) => !open)}>
                <Menu size={18} strokeWidth={1.7} />
              </button>
            )}
            {!focusMode && <span className="file-tab"><FileText size={15} strokeWidth={1.8} /></span>}
            <div className="identity-text">
              <h1>{activeDocument ? clampTitle(activeDocument.name) : 'Inkwell'}</h1>
              {!focusMode && <p role="status" aria-live="polite">{notice}</p>}
            </div>
          </div>
          <div className="document-tools">
            {focusMode ? (
              <div className="view-switcher" role="group" aria-label="Document view">
                <button className={view === 'split' ? 'selected' : ''} aria-pressed={view === 'split'} onClick={toggleSplit} aria-label="Split with reader" title="Split with reader (Ctrl+2)">
                  <SplitSquareHorizontal size={16} /> <span>Split</span>
                </button>
              </div>
            ) : (
              <div className="view-switcher" role="group" aria-label="Document view">
                <button className={view === 'read' ? 'selected' : ''} aria-pressed={view === 'read'} onClick={() => setView('read')} aria-label="Reading view" title="Read (Ctrl+1)"><BookOpen size={16} /> <span>Read</span></button>
                <button className={view === 'split' ? 'selected' : ''} aria-pressed={view === 'split'} onClick={() => setView('split')} aria-label="Split view" title="Split (Ctrl+2)"><SplitSquareHorizontal size={16} /> <span>Split</span></button>
                <button className={view === 'write' ? 'selected' : ''} aria-pressed={view === 'write'} onClick={() => setView('write')} aria-label="Writing view" title="Write (Ctrl+3)"><PencilLine size={16} /> <span>Write</span></button>
              </div>
            )}
            <button className="save-as-button" title="Save as (Ctrl+Shift+S)" disabled={!activeDocument} onClick={() => void saveDocument(true)}>Save as</button>
            <button className="save-button" title="Save (Ctrl+S)" disabled={!activeDocument} onClick={() => void saveDocument()}>
              <Check size={16} strokeWidth={2} /> <span className="save-label">Save</span> <kbd>Ctrl+S</kbd>
            </button>
            {!focusMode && (
              <>
                <button className="icon-button outline-toggle" aria-label={outlineOpen ? 'Hide outline' : 'Show outline'} aria-expanded={outlineOpen} title="Outline (Ctrl+\)" onClick={() => setOutlineOpen((open) => !open)}>
                  {outlineOpen ? <PanelRightClose size={18} strokeWidth={1.7} /> : <PanelRightOpen size={18} strokeWidth={1.7} />}
                </button>
                <button className="icon-button" aria-label="Focus writing" title="Focus writing (Ctrl+Shift+F)" onClick={toggleFocus}>
                  <Maximize2 size={18} strokeWidth={1.7} />
                </button>
              </>
            )}
          </div>
        </header>

        {activeDocument ? (
          <div className={`document-canvas view-${view}`}>
            {view !== 'write' && <div className="reader-panel"><Reader content={activeDocument.content} /></div>}
            {view !== 'read' && <div className="editor-panel">
              <div className="editor-bar">
                <span><LayoutPanelLeft size={15} /> Markdown source</span>
                <span className="statusbar-optional">{activeDocument.content.length.toLocaleString()} characters</span>
              </div>
              <textarea
                ref={editorRef}
                value={activeDocument.content}
                onChange={(event) => updateContent(event.target.value)}
                spellCheck="true"
                aria-label="Markdown source editor"
              />
            </div>}
          </div>
        ) : (
          <div className="document-canvas view-read">
            <div className="canvas-empty">
              <BookOpen size={26} strokeWidth={1.4} />
              <h2>Nothing open</h2>
              <p>Add a folder to keep its Markdown in the library, open a single file, or start a new note. Inkwell remembers this between launches.</p>
              <div className="canvas-empty-actions">
                <button onClick={createDocument}><FilePlus2 size={15} /> New note</button>
                <button onClick={() => void openFiles()}><FileText size={15} /> Open file</button>
                <button onClick={() => void addFolder()}><FolderPlus size={15} /> Add folder</button>
              </div>
            </div>
          </div>
        )}

        <footer className="statusbar">
          <span><Clock3 size={14} /> {activeDocument ? wordCount : 0} words</span>
          <span className="statusbar-optional">{headings.length} sections</span>
          {update && (
            <span className="statusbar-update">
              <button
                type="button"
                title={`Inkwell ${update.version} is out — open its notes on GitHub`}
                onClick={() => window.inkwell?.openUpdate?.()}
              >
                <ArrowUpCircle size={12} strokeWidth={1.9} /> Inkwell {update.version} available
              </button>
              <button
                type="button"
                className="update-dismiss"
                aria-label={`Dismiss the notice about Inkwell ${update.version}`}
                title="Not now"
                onClick={dismissUpdate}
              >
                <X size={11} strokeWidth={2} />
              </button>
            </span>
          )}
          <span className="statusbar-end statusbar-optional">Markdown · UTF-8</span>
        </footer>
      </section>

      <aside className="outline" aria-label="Document outline">
        <div className="outline-heading">
          <span>On this page</span>
          <button className="icon-button" aria-label="Hide outline" onClick={() => setOutlineOpen(false)}><X size={16} /></button>
        </div>
        <div className="outline-list">
          {headings.length ? headings.map((heading) => (
            <button key={heading.id} className={`outline-item level-${heading.level}`} onClick={() => switchToHeading(heading.id)}>
              <ChevronRight size={13} strokeWidth={1.7} /> {heading.text}
            </button>
          )) : <p className="empty-outline">Add headings to make a document outline.</p>}
        </div>
        <div className="outline-tip">
          <BookOpen size={16} strokeWidth={1.6} />
          <p>Reading view gives long notes a generous, distraction-free measure.</p>
        </div>
      </aside>

      {menu && (
        <RowMenu
          items={menuItemsFor(menu.row)}
          origin={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
        />
      )}
    </main>
  )
}

export default App
