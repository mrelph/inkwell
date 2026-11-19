import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron'

type DocumentFile = { name: string; path: string; content: string }

/* Each subscription returns its own disposer so the renderer can detach without
   removing another listener's handler. */
const subscribe = <T,>(channel: string, listener: (payload: T) => void) => {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('inkwell', {
  agent: {
    enable: (value: boolean) => ipcRenderer.invoke('agent:enable', value),
    providers: () => ipcRenderer.invoke('agent:providers'),
    stop: () => ipcRenderer.invoke('agent:stop'),
    prompt: (input: unknown) => ipcRenderer.invoke('agent:prompt', input),
    onText: (listener: (text: string) => void) => subscribe('agent:text', listener),
    onBuffer: (listener: (request: unknown) => void) => subscribe('agent:buffer', listener),
    reply: (id: number, text?: string) => ipcRenderer.invoke('agent:reply', id, text)
  },
  openDocuments: () => ipcRenderer.invoke('document:open'),
  openFolder: () => ipcRenderer.invoke('document:open-folder'),
  readFolder: (folder: string) => ipcRenderer.invoke('document:read-folder', folder),
  readDocuments: (paths: string[]) => ipcRenderer.invoke('document:read', paths),
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state: unknown) => ipcRenderer.send('state:save', state),
  setZoomLevel: (percent: number) => {
    if (!Number.isFinite(percent)) return
    webFrame.setZoomFactor(Math.min(1.4, Math.max(0.8, percent / 100)))
  },
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
