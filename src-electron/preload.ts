import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

type DocumentFile = { name: string; path: string; content: string }

/* Each subscription returns its own disposer so the renderer can detach without
   removing another listener's handler. */
const subscribe = <T,>(channel: string, listener: (payload: T) => void) => {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('inkwell', {
  openDocuments: () => ipcRenderer.invoke('document:open'),
  openFolder: () => ipcRenderer.invoke('document:open-folder'),
  readFolder: (folder: string) => ipcRenderer.invoke('document:read-folder', folder),
  readDocuments: (paths: string[]) => ipcRenderer.invoke('document:read', paths),
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state: unknown) => ipcRenderer.send('state:save', state),
  renameDocument: (payload: { path: string; name: string }) => ipcRenderer.invoke('file:rename', payload),
  duplicateDocument: (filePath: string) => ipcRenderer.invoke('file:duplicate', filePath),
  trashDocument: (filePath: string) => ipcRenderer.invoke('file:trash', filePath),
  confirmTrash: (name: string) => ipcRenderer.invoke('file:confirm-trash', name),
  revealDocument: (filePath: string) => ipcRenderer.send('file:reveal', filePath),
  copyText: (text: string) => ipcRenderer.send('clipboard:write', text),
  getUpdate: () => ipcRenderer.invoke('update:get'),
  dismissUpdate: (version: string) => ipcRenderer.send('update:dismiss', version),
  openUpdate: () => ipcRenderer.send('update:open'),
  onUpdateAvailable: (listener: (notice: unknown) => void) => subscribe('update:available', listener),
  saveDocument: (payload: { content: string; path?: string; forceSaveAs?: boolean; knownMtime?: number }) => ipcRenderer.invoke('document:save', payload),
  setDirty: (isDirty: boolean) => ipcRenderer.send('document:set-dirty', isDirty),
  confirmDiscard: (names: string) => ipcRenderer.invoke('document:confirm-discard', names),
  getTheme: () => ipcRenderer.invoke('theme:get'),
  onThemeChange: (listener: (theme: unknown) => void) => subscribe('theme:changed', listener),
  onOpenExternal: (listener: (documents: DocumentFile[]) => void) => subscribe('document:opened-externally', listener)
})
