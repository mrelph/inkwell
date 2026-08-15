import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { resolveTheme, watchTheme, type ThemeTokens } from './theme'

type DocumentFile = {
  name: string
  path: string
  content: string
  /** mtime at read time, used to detect an external edit before overwriting. */
  savedAt: number
}

const isMarkdown = (filePath: string) => /\.(md|mdx|markdown)$/i.test(filePath)

/* Normalise the resolver's tokens into the renderer's payload: metadata split
   from the colors, which are applied wholesale as CSS custom properties. */
const toThemePayload = (tokens: ThemeTokens) => {
  const record = tokens as unknown as Record<string, unknown>
  const nested = record.colors as Record<string, string> | undefined
  const colors = nested ?? Object.fromEntries(
    Object.entries(record).filter(([key]) => key.startsWith('--'))
  ) as Record<string, string>
  return {
    name: String(record.themeName ?? 'default'),
    mode: (record.mode === 'light' ? 'light' : 'dark') as 'light' | 'dark',
    colors
  }
}

async function readMarkdownFile(filePath: string): Promise<DocumentFile> {
  const [content, details] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)])
  return {
    name: path.basename(filePath),
    path: filePath,
    content,
    savedAt: details.mtimeMs
  }
}

/* An unreadable file must not fail the whole open: a folder with one
   permission-denied note should still open every other note in it. */
async function readMarkdownFileSafely(filePath: string): Promise<DocumentFile | null> {
  try {
    return await readMarkdownFile(filePath)
  } catch {
    return null
  }
}

const MAX_FOLDER_FILES = 500

async function walkMarkdownFiles(directory: string, depth = 0): Promise<DocumentFile[]> {
  if (depth > 4) return []
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
  const records = await Promise.all(
    entries.map(async (entry) => {
      const itemPath = path.join(directory, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.')) return walkMarkdownFiles(itemPath, depth + 1)
      if (entry.isFile() && isMarkdown(entry.name)) {
        const file = await readMarkdownFileSafely(itemPath)
        return file ? [file] : []
      }
      return []
    })
  )
  return records.flat().slice(0, MAX_FOLDER_FILES)
}

/* Files handed to Inkwell on the command line, e.g. `inkwell notes.md` from a
   file manager or a shell. */
async function documentsFromArgv(argv: string[]): Promise<DocumentFile[]> {
  const candidates = argv.filter((arg) => !arg.startsWith('-') && isMarkdown(arg))
  const files = await Promise.all(candidates.map(async (candidate) => {
    const resolved = path.resolve(candidate)
    try {
      const details = await stat(resolved)
      if (!details.isFile()) return null
    } catch {
      return null
    }
    return readMarkdownFileSafely(resolved)
  }))
  return files.filter((file): file is DocumentFile => file !== null)
}

let mainWindow: BrowserWindow | null = null
let stopWatchingTheme: (() => void) | null = null

async function createWindow() {
  const theme = toThemePayload(await resolveTheme())

  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    /* Tiling compositors hand a window whatever geometry the layout dictates,
       often a quarter of the screen. Keep the floor low enough that Inkwell
       tiles cleanly instead of forcing the compositor to float it. */
    minWidth: 480,
    minHeight: 360,
    /* Hyprland draws the border and shows the title, so Inkwell ships no
       titlebar and no drag region of its own. */
    frame: false,
    backgroundColor: theme.colors['--surface-chrome'] ?? '#f7f3ec',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = window

  const developmentServer = process.env.VITE_DEV_SERVER_URL
  let allowClose = false
  let hasUnsavedChanges = false

  ipcMain.on('document:set-dirty', (_event, isDirty: boolean) => {
    hasUnsavedChanges = isDirty
  })

  /* Markdown can carry arbitrary links. Never navigate the app itself; hand
     safe schemes to the desktop's browser and drop everything else. */
  const openExternally = (url: string) => {
    try {
      const { protocol } = new URL(url)
      if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') void shell.openExternal(url)
    } catch {
      /* not a usable URL */
    }
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (url === window.webContents.getURL()) return
    event.preventDefault()
    openExternally(url)
  })

  window.on('close', (event) => {
    if (!hasUnsavedChanges || allowClose) return
    event.preventDefault()
    const response = dialog.showMessageBoxSync(window, {
      type: 'warning',
      title: 'Unsaved changes',
      message: 'You have unsaved changes.',
      detail: 'Save your work before closing Inkwell, or discard the changes and close.',
      buttons: ['Keep editing', 'Discard changes'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (response === 1) {
      allowClose = true
      window.close()
    }
  })

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  stopWatchingTheme?.()
  stopWatchingTheme = watchTheme((tokens: ThemeTokens) => {
    if (window.isDestroyed()) return
    window.webContents.send('theme:changed', toThemePayload(tokens))
  })

  if (developmentServer) await window.loadURL(developmentServer)
  else await window.loadFile(path.join(__dirname, '../dist/index.html'))

  const initial = await documentsFromArgv(process.argv.slice(1))
  if (initial.length && !window.isDestroyed()) window.webContents.send('document:opened-externally', initial)
}

/* A launcher re-invoking Inkwell should raise the existing window and open the
   file in it, not start a second copy with its own unsaved state. */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', async (_event, argv) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    const documents = await documentsFromArgv(argv.slice(1))
    if (documents.length) mainWindow.webContents.send('document:opened-externally', documents)
  })

  app.whenReady().then(() => {
    ipcMain.handle('theme:get', async () => toThemePayload(await resolveTheme()))

    ipcMain.handle('document:confirm-discard', async (_event, names: string) => {
      const window = mainWindow
      const options = {
        type: 'warning' as const,
        title: 'Unsaved changes',
        message: 'Discard unsaved changes?',
        detail: `${names} has unsaved changes that will be lost when you open something else.`,
        buttons: ['Cancel', 'Discard and open'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      }
      const { response } = window
        ? await dialog.showMessageBox(window, options)
        : await dialog.showMessageBox(options)
      return response === 1
    })

    ipcMain.handle('document:open', async () => {
      try {
        const selection = await dialog.showOpenDialog({
          title: 'Open Markdown files',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Markdown', extensions: ['md', 'mdx', 'markdown'] }]
        })
        if (selection.canceled) return []
        const files = await Promise.all(selection.filePaths.map(readMarkdownFileSafely))
        return files.filter((file): file is DocumentFile => file !== null)
      } catch {
        return []
      }
    })

    ipcMain.handle('document:open-folder', async () => {
      try {
        const selection = await dialog.showOpenDialog({
          title: 'Open a folder',
          properties: ['openDirectory']
        })
        if (selection.canceled || !selection.filePaths[0]) return { folder: '', documents: [] }
        const folder = selection.filePaths[0]
        return { folder, documents: await walkMarkdownFiles(folder) }
      } catch {
        return { folder: '', documents: [] }
      }
    })

    ipcMain.handle('document:save', async (_event, payload: {
      content: string
      path?: string
      forceSaveAs?: boolean
      knownMtime?: number
    }) => {
      let targetPath = payload.path

      if (!targetPath || payload.forceSaveAs) {
        const selection = await dialog.showSaveDialog({
          title: 'Save Markdown document',
          defaultPath: targetPath ?? 'Untitled note.md',
          filters: [{ name: 'Markdown', extensions: ['md'] }]
        })
        if (selection.canceled || !selection.filePath) return { canceled: true }
        targetPath = selection.filePath
      } else if (payload.knownMtime !== undefined) {
        /* Another editor may have written this file since we read it. Overwriting
           silently would discard their work as surely as losing our own. */
        try {
          const current = await stat(targetPath)
          if (current.mtimeMs - payload.knownMtime > 1) {
            const options = {
              type: 'warning' as const,
              title: 'File changed on disk',
              message: 'This file has changed since Inkwell opened it.',
              detail: `${path.basename(targetPath)} was modified by something else. Saving now replaces those changes.`,
              buttons: ['Cancel', 'Overwrite'],
              defaultId: 0,
              cancelId: 0,
              noLink: true
            }
            const { response } = mainWindow
              ? await dialog.showMessageBox(mainWindow, options)
              : await dialog.showMessageBox(options)
            if (response !== 1) return { canceled: true }
          }
        } catch {
          /* Gone from disk: fall through and recreate it. */
        }
      }

      await writeFile(targetPath, payload.content, 'utf8')
      const details = await stat(targetPath)
      return { canceled: false, path: targetPath, savedAt: details.mtimeMs }
    })

    void createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    })
  })
}

app.on('will-quit', () => {
  stopWatchingTheme?.()
  stopWatchingTheme = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
