import { useEffect, useMemo, useRef, useState } from 'react'
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
  Menu,
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

type Document = {
  id: string
  name: string
  content: string
  path?: string
  source?: string
  isSample?: boolean
  isDirty?: boolean
}

const seedDocuments: Document[] = [
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
- Use the outline to move through longer documents

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

const getHeadings = (markdown: string) => {
  let headingIndex = 0
  return markdown
    .split('\n')
    .map((line) => {
      const match = /^(#{1,3})\s+(.+)$/.exec(line)
      return match ? { level: match[1].length, text: match[2].replace(/[*_`]/g, ''), id: `section-${headingIndex++}` } : null
    })
    .filter((item): item is { level: number; text: string; id: string } => Boolean(item))
}

function Reader({ content }: { content: string }) {
  const headingIndex = useRef(0)
  headingIndex.current = 0

  return (
    <article className="markdown-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => {
            const id = `section-${headingIndex.current++}`
            return <h1 id={id}>{children}</h1>
          },
          h2: ({ children }) => {
            const id = `section-${headingIndex.current++}`
            return <h2 id={id}>{children}</h2>
          },
          h3: ({ children }) => {
            const id = `section-${headingIndex.current++}`
            return <h3 id={id}>{children}</h3>
          },
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
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [notice, setNotice] = useState('Sample document · unsaved')
  const [folderName, setFolderName] = useState('Sample documents')
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const activeDocument = documents.find((document) => document.id === activeId) ?? documents[0]
  const headings = useMemo(() => getHeadings(activeDocument.content), [activeDocument.content])
  const wordCount = useMemo(
    () => activeDocument.content.trim().split(/\s+/).filter(Boolean).length,
    [activeDocument.content]
  )
  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return documents
    return documents.filter((document) => `${document.name} ${document.content}`.toLowerCase().includes(normalized))
  }, [documents, query])

  const replaceDocuments = (incoming: Array<{ name: string; content: string; path: string }>, source: string) => {
    if (!incoming.length) {
      setNotice('No Markdown files found in that folder')
      return
    }
    const mapped: Document[] = incoming.map((file) => ({
      id: `${file.path}-${Date.now()}`,
      name: file.name,
      path: file.path,
      content: file.content,
      source
    }))
    setDocuments(mapped)
    setActiveId(mapped[0].id)
    setFolderName(source)
    setNotice(`${mapped.length} local ${mapped.length === 1 ? 'file' : 'files'} opened`)
  }

  const openFiles = async () => {
    const incoming = await window.inkwell?.openDocuments()
    if (incoming?.length) replaceDocuments(incoming, 'Opened files')
  }

  const openFolder = async () => {
    const result = await window.inkwell?.openFolder()
    if (!result?.folder) return
    replaceDocuments(result.documents, result.folder.split('/').filter(Boolean).pop() ?? 'Folder')
  }

  const updateContent = (content: string) => {
    setDocuments((current) => current.map((document) => document.id === activeId ? { ...document, content, isDirty: true } : document))
    setNotice('Edited · not saved')
  }

  const createDocument = () => {
    const serial = documents.filter((document) => document.name.startsWith('Untitled')).length + 1
    const newDocument: Document = {
      id: `draft-${Date.now()}`,
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
  }

  const saveDocument = async (forceSaveAs = false) => {
    if (!window.inkwell) return
    try {
      const saved = await window.inkwell.saveDocument({
        content: activeDocument.content,
        path: activeDocument.path,
        forceSaveAs
      })
      if (saved.canceled || !saved.path) return
      const fileName = saved.path.split('/').pop() ?? activeDocument.name
      setDocuments((current) => current.map((document) => document.id === activeId ? {
        ...document,
        path: saved.path,
        name: fileName,
        isSample: false,
        isDirty: false
      } : document))
      setNotice(`Saved ${fileName}`)
    } catch {
      setNotice('Could not save this document — try Save As again')
    }
  }

  const switchToHeading = (id: string) => {
    if (view === 'write') setView('read')
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveDocument(event.shiftKey)
      }
      if (event.key.toLowerCase() === 'o' && event.shiftKey) {
        event.preventDefault()
        void openFolder()
      } else if (event.key.toLowerCase() === 'o') {
        event.preventDefault()
        void openFiles()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    window.inkwell?.setDirty(documents.some((document) => document.isDirty))
  }, [documents])

  return (
    <main className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'} ${outlineOpen ? '' : 'outline-collapsed'}`}>
      <header className="titlebar">
        <button className="icon-button title-control" aria-label={sidebarOpen ? 'Hide document list' : 'Show document list'} onClick={() => setSidebarOpen((open) => !open)}>
          <Menu size={18} strokeWidth={1.7} />
        </button>
        <div className="wordmark" aria-label="Inkwell">
          <span className="wordmark-mark">i</span>
          <span>inkwell</span>
        </div>
        <div className="titlebar-spacer" />
        <div className="title-status"><span className="status-dot" /> Local-first workspace</div>
      </header>

      <aside className="sidebar" aria-label="Documents">
        <div className="sidebar-actions">
          <button className="new-note" onClick={createDocument}><FilePlus2 size={16} strokeWidth={1.8} /> New note</button>
          <button className="icon-button" aria-label="Open Markdown file" onClick={() => void openFiles()}><FileText size={18} strokeWidth={1.7} /></button>
          <button className="icon-button" aria-label="Open folder" onClick={() => void openFolder()}><FolderOpen size={18} strokeWidth={1.7} /></button>
        </div>

        <label className="search-box">
          <Search size={16} strokeWidth={1.7} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find in documents" aria-label="Find in documents" />
          {query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
        </label>

        <div className="library-label">
          <span className="folder-line"><ChevronDown size={14} /> {folderName}</span>
          <span>{filteredDocuments.length}</span>
        </div>

        <nav className="document-list" aria-label="Markdown documents">
          {filteredDocuments.map((document) => (
            <button
              className={`document-item ${document.id === activeId ? 'active' : ''}`}
              key={document.id}
              onClick={() => setActiveId(document.id)}
            >
              <FileText size={16} strokeWidth={1.6} />
              <span>
                <strong>{clampTitle(document.name)}</strong>
                <small>{document.isSample ? 'Sample' : document.path ? 'Local file' : 'Draft'}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <Sparkles size={15} strokeWidth={1.6} />
          <p>Nothing leaves this machine unless you choose to share it.</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="document-header">
          <div className="document-identity">
            <span className="file-tab"><FileText size={15} strokeWidth={1.8} /></span>
            <div>
              <h1>{clampTitle(activeDocument.name)}</h1>
              <p>{notice}</p>
            </div>
          </div>
          <div className="document-tools">
            <div className="view-switcher" aria-label="Document view">
              <button className={view === 'read' ? 'selected' : ''} onClick={() => setView('read')} aria-label="Reading view"><BookOpen size={16} /> <span>Read</span></button>
              <button className={view === 'split' ? 'selected' : ''} onClick={() => setView('split')} aria-label="Split view"><SplitSquareHorizontal size={16} /> <span>Split</span></button>
              <button className={view === 'write' ? 'selected' : ''} onClick={() => setView('write')} aria-label="Writing view"><PencilLine size={16} /> <span>Write</span></button>
            </div>
            <button className="save-as-button" onClick={() => void saveDocument(true)}>Save as</button>
            <button className="save-button" onClick={() => void saveDocument()}><Check size={16} strokeWidth={2} /> Save <kbd>⌃S</kbd></button>
            <button className="icon-button outline-toggle" aria-label={outlineOpen ? 'Hide outline' : 'Show outline'} onClick={() => setOutlineOpen((open) => !open)}>
              {outlineOpen ? <PanelRightClose size={18} strokeWidth={1.7} /> : <PanelRightOpen size={18} strokeWidth={1.7} />}
            </button>
          </div>
        </header>

        <div className={`document-canvas view-${view}`}>
          {view !== 'write' && <div className="reader-panel"><Reader content={activeDocument.content} /></div>}
          {view !== 'read' && <div className="editor-panel">
            <div className="editor-bar"><span><LayoutPanelLeft size={15} /> Markdown source</span><span>{activeDocument.content.length.toLocaleString()} characters</span></div>
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
          <span>{headings.length} sections</span>
          <span className="statusbar-end">Markdown · UTF-8</span>
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
