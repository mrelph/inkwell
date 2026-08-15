import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

type DocumentFile = {
  name: string
  path: string
  content: string
}

const isMarkdown = (filePath: string) => /\.(md|mdx|markdown)$/i.test(filePath)

async function readMarkdownFile(filePath: string): Promise<DocumentFile> {
  return {
    name: path.basename(filePath),
    path: filePath,
    content: await readFile(filePath, 'utf8')
  }
}

async function walkMarkdownFiles(directory: string, depth = 0): Promise<DocumentFile[]> {
  if (depth > 4) return []
  const entries = await readdir(directory, { withFileTypes: true })
  const records = await Promise.all(
    entries.map(async (entry) => {
      const itemPath = path.join(directory, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.')) return walkMarkdownFiles(itemPath, depth + 1)
      if (entry.isFile() && isMarkdown(entry.name)) return [await readMarkdownFile(itemPath)]
      return []
    })
  )
  return records.flat()
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    titleBarStyle: 'hidden',
    backgroundColor: '#f3efe6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const developmentServer = process.env.VITE_DEV_SERVER_URL
  let allowClose = false
  let hasUnsavedChanges = false

  ipcMain.on('document:set-dirty', (_event, isDirty: boolean) => {
    hasUnsavedChanges = isDirty
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

  if (developmentServer) window.loadURL(developmentServer)
  else window.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(() => {
  ipcMain.handle('document:open', async () => {
    const selection = await dialog.showOpenDialog({
      title: 'Open Markdown files',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md', 'mdx', 'markdown'] }]
    })
    if (selection.canceled) return []
    return Promise.all(selection.filePaths.map(readMarkdownFile))
  })

  ipcMain.handle('document:open-folder', async () => {
    const selection = await dialog.showOpenDialog({
      title: 'Open a folder',
      properties: ['openDirectory']
    })
    if (selection.canceled || !selection.filePaths[0]) return { folder: '', documents: [] }
    const folder = selection.filePaths[0]
    return { folder, documents: await walkMarkdownFiles(folder) }
  })

  ipcMain.handle('document:save', async (_event, payload: { content: string; path?: string; forceSaveAs?: boolean }) => {
    let targetPath = payload.path
    if (!targetPath || payload.forceSaveAs) {
      const selection = await dialog.showSaveDialog({
        title: 'Save Markdown document',
        defaultPath: targetPath ?? 'Untitled note.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (selection.canceled || !selection.filePath) return { canceled: true }
      targetPath = selection.filePath
    }
    await writeFile(targetPath, payload.content, 'utf8')
    const details = await stat(targetPath)
    return { canceled: false, path: targetPath, savedAt: details.mtimeMs }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
