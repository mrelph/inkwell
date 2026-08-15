import { isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FilePlus2,
  FileText,
  FolderOpen,
  LayoutPanelLeft,
  Maximize2,
  Menu,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  PencilLine,
  Search,
  Sparkles,
  SplitSquareHorizontal,
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
  source?: string
  isSample?: boolean
  isDirty?: boolean
  /** mtime Inkwell last saw on disk, used to detect an external edit. */
  savedAt?: number
}

type Heading = { level: number; text: string; id: string }

const seedDocuments: MarkdownDoc[] = [
  {
    id: 'welcome',
    name: 'Welcome to Inkwell.md',
    source: 'Sample documents',
    isSample: true,
    content: `# Welcome to Inkwell

Inkwell is a quiet place to read and shape Markdown. It keeps the source close and the finished page even closer.

## A reader and an editor, in one place

Switch between a focused reading view, a clean writing view, or place them side by side. The document stays local to your machine; there is no account and no hidden workspace.

> This is a sample document. Open a folder or a Markdown file to begin working with your own notes.

## A few useful details

- **Open files** with \`Ctrl+O\`
- **Open folders** with \`Ctrl+Shift+O\`
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
    source: 'Sample documents',
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
    source: 'Sample documents',
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
    source: 'Sample documents',
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

function App() {
  const [documents, setDocuments] = useState(seedDocuments)
  const [activeId, setActiveId] = useState(seedDocuments[0].id)
  const [view, setView] = useState<ViewMode>('split')
  const [query, setQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  /* Only open by default where the outline gets a real column. Below that it
     overlays the canvas, and a tiled window should start on the document. */
  const [outlineOpen, setOutlineOpen] = useState(
    () => !window.matchMedia('(max-width: 1120px)').matches
  )
  const [focusMode, setFocusMode] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [notice, setNotice] = useState('Sample document · unsaved')
  const [folderName, setFolderName] = useState('Sample documents')
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const draftSerial = useRef(0)

  const activeDocument = documents.find((doc) => doc.id === activeId) ?? documents[0]
  const headings = useMemo(() => getHeadings(activeDocument.content), [activeDocument.content])
  const wordCount = useMemo(
    () => activeDocument.content.trim().split(/\s+/).filter(Boolean).length,
    [activeDocument.content]
  )
  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return documents
    return documents.filter((doc) => `${doc.name} ${doc.content}`.toLowerCase().includes(normalized))
  }, [documents, query])

  /* A tiling compositor resizes the window immediately after it is created, so
     the width at mount is not the width the user gets. Re-evaluate whenever the
     outline loses its own column and fold it away rather than leaving it
     overlaying the document. */
  useEffect(() => {
    const compact = window.matchMedia('(max-width: 1120px)')
    const sync = () => {
      if (compact.matches) setOutlineOpen(false)
    }
    sync()
    compact.addEventListener('change', sync)
    return () => compact.removeEventListener('change', sync)
  }, [])

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

  /* Adding is the default for opening files, whether they arrive from the file
     dialog, argv, or a second launch: nothing already open is discarded, and a
     file already in the library is activated rather than duplicated. Ids are
     keyed on path so re-opening resolves to the same entry. */
  const addDocuments = useCallback((incoming: DocumentFile[], source: string) => {
    if (!incoming.length) return
    const mapped: MarkdownDoc[] = incoming.map((file) => ({
      id: `file:${file.path}`,
      name: file.name,
      path: file.path,
      content: file.content,
      savedAt: file.savedAt,
      source
    }))
    setDocuments((current) => {
      const fresh = mapped.filter((doc) => !current.some((existing) => existing.path === doc.path))
      return fresh.length ? [...fresh, ...current] : current
    })
    setActiveId(mapped[0].id)
    setNotice(mapped.length === 1
      ? `Opened ${mapped[0].name}`
      : `Opened ${mapped.length} files`)
  }, [])

  useEffect(() => {
    return window.inkwell?.onOpenExternal?.((incoming) => addDocuments(incoming, 'Opened files'))
  }, [addDocuments])

  const replaceDocuments = useCallback((incoming: DocumentFile[], source: string) => {
    if (!incoming.length) {
      setNotice('No Markdown files found in that folder')
      return
    }
    const mapped: MarkdownDoc[] = incoming.map((file, index) => ({
      id: `file:${file.path}:${index}`,
      name: file.name,
      path: file.path,
      content: file.content,
      savedAt: file.savedAt,
      source
    }))
    setDocuments(mapped)
    setActiveId(mapped[0].id)
    setFolderName(source)
    setNotice(`${mapped.length} local ${mapped.length === 1 ? 'file' : 'files'} opened`)
  }, [])

  /* Opening replaces the whole library, so unsaved work must be confirmed
     first — the window-close path already guards this. */
  const confirmDiscard = useCallback(async () => {
    const dirty = documents.filter((doc) => doc.isDirty)
    if (!dirty.length) return true
    const names = dirty.map((doc) => clampTitle(doc.name)).join(', ')
    const discard = await window.inkwell?.confirmDiscard?.(names)
    return discard !== false
  }, [documents])

  /* Opening files adds to the library, so there is nothing to discard and no
     prompt to answer. Only opening a folder replaces the workspace. */
  const openFiles = useCallback(async () => {
    try {
      const incoming = await window.inkwell?.openDocuments()
      if (incoming?.length) addDocuments(incoming, 'Opened files')
    } catch {
      setNotice('Could not open those files — check permissions and try again')
    }
  }, [addDocuments])

  const openFolder = useCallback(async () => {
    if (!(await confirmDiscard())) return
    try {
      const result = await window.inkwell?.openFolder()
      if (!result?.folder) return
      replaceDocuments(result.documents, result.folder.split('/').filter(Boolean).pop() ?? 'Folder')
    } catch {
      setNotice('Could not read that folder — check permissions and try again')
    }
  }, [confirmDiscard, replaceDocuments])

  const updateContent = (content: string) => {
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
      source: 'Scratch',
      isDirty: true
    }
    setDocuments((current) => [newDocument, ...current])
    setActiveId(newDocument.id)
    setView('write')
    setNotice('New local draft · choose Save to place it')
    window.setTimeout(() => editorRef.current?.focus(), 40)
  }, [])

  const saveDocument = useCallback(async (forceSaveAs = false) => {
    if (!window.inkwell) return
    const target = documents.find((doc) => doc.id === activeId) ?? documents[0]
    try {
      const saved = await window.inkwell.saveDocument({
        content: target.content,
        path: target.path,
        forceSaveAs,
        knownMtime: target.savedAt
      })
      if (saved.canceled || !saved.path) return
      const fileName = saved.path.split('/').pop() ?? target.name
      setDocuments((current) => current.map((doc) => doc.id === target.id ? {
        ...doc,
        path: saved.path,
        name: fileName,
        savedAt: saved.savedAt,
        isSample: false,
        isDirty: false
      } : doc))
      setNotice(`Saved ${fileName}`)
    } catch {
      setNotice('Could not save this document — try Save As again')
    }
  }, [activeId, documents])

  const closeDocument = useCallback(async (id: string) => {
    const index = documents.findIndex((doc) => doc.id === id)
    if (index === -1) return
    if (documents.length === 1) {
      setNotice('That is the only open document')
      return
    }
    const target = documents[index]
    if (target.isDirty) {
      const discard = await window.inkwell?.confirmDiscard?.(clampTitle(target.name))
      if (discard === false) return
    }
    const remaining = documents.filter((doc) => doc.id !== id)
    setDocuments(remaining)
    if (id === activeId) setActiveId(remaining[Math.min(index, remaining.length - 1)].id)
    setNotice(`Closed ${clampTitle(target.name)}`)
  }, [activeId, documents])

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
  const actions = useRef({ saveDocument, openFiles, openFolder, createDocument, setView, setSidebarOpen, setOutlineOpen, toggleFocus, toggleSplit, focusMode })
  actions.current = { saveDocument, openFiles, openFolder, createDocument, setView, setSidebarOpen, setOutlineOpen, toggleFocus, toggleSplit, focusMode }

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
        if (event.shiftKey) void current.openFolder()
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
      <aside className="sidebar" aria-label="Documents">
        <div className="sidebar-actions">
          <button className="new-note" title="New note (Ctrl+N)" onClick={createDocument}><FilePlus2 size={16} strokeWidth={1.8} /> New note</button>
          <button className="icon-button" aria-label="Open Markdown file" title="Open file — adds to the library (Ctrl+O)" onClick={() => void openFiles()}><FileText size={18} strokeWidth={1.7} /></button>
          <button className="icon-button" aria-label="Open folder" title="Open folder — replaces the library (Ctrl+Shift+O)" onClick={() => void openFolder()}><FolderOpen size={18} strokeWidth={1.7} /></button>
        </div>

        <label className="search-box">
          <Search size={16} strokeWidth={1.7} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find in documents" aria-label="Find in documents" />
          {query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
        </label>

        <div className="library-label">
          <button
            className="folder-line"
            aria-expanded={libraryOpen}
            aria-controls="document-list"
            title={folderName}
            onClick={() => setLibraryOpen((open) => !open)}
          >
            <ChevronDown size={14} /> <span>{folderName}</span>
          </button>
          <span>{filteredDocuments.length}</span>
        </div>

        {libraryOpen && (
          <nav className="document-list" id="document-list" aria-label="Markdown documents">
            {filteredDocuments.length ? filteredDocuments.map((doc) => (
              <div className="document-row" key={doc.id}>
                <button
                  className={`document-item ${doc.id === activeId ? 'active' : ''}`}
                  aria-current={doc.id === activeId}
                  title={doc.path ?? 'Unsaved draft — not yet on disk'}
                  onClick={() => setActiveId(doc.id)}
                >
                  <FileText size={16} strokeWidth={1.6} />
                  <span>
                    <strong>{clampTitle(doc.name)}</strong>
                    <small>
                      {doc.isDirty && <span className="dirty-mark" aria-label="Unsaved changes">• </span>}
                      {doc.isSample ? 'Sample' : doc.path ? 'Local file' : 'Draft'}
                    </small>
                  </span>
                </button>
                {documents.length > 1 && (
                  <button
                    className="close-document"
                    aria-label={`Close ${clampTitle(doc.name)}`}
                    title="Close"
                    onClick={() => void closeDocument(doc.id)}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )) : (
              <p className="empty-library">
                {query ? `Nothing matches “${query}”.` : 'No documents open. Press Ctrl+O to open a file.'}
              </p>
            )}
          </nav>
        )}

        <div className="sidebar-foot">
          <Sparkles size={15} strokeWidth={1.6} />
          <p>Nothing leaves this machine unless you choose to share it.</p>
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
              <button className="icon-button" aria-label={sidebarOpen ? 'Hide document list' : 'Show document list'} aria-expanded={sidebarOpen} title="Document list (Ctrl+B)" onClick={() => setSidebarOpen((open) => !open)}>
                <Menu size={18} strokeWidth={1.7} />
              </button>
            )}
            {!focusMode && <span className="file-tab"><FileText size={15} strokeWidth={1.8} /></span>}
            <div className="identity-text">
              <h1>{clampTitle(activeDocument.name)}</h1>
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
            <button className="save-as-button" title="Save as (Ctrl+Shift+S)" onClick={() => void saveDocument(true)}>Save as</button>
            <button className="save-button" title="Save (Ctrl+S)" onClick={() => void saveDocument()}>
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

        <footer className="statusbar">
          <span><Clock3 size={14} /> {wordCount} words</span>
          <span className="statusbar-optional">{headings.length} sections</span>
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
    </main>
  )
}

export default App
