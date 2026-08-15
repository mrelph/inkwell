import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('inkwell', {
  openDocuments: () => ipcRenderer.invoke('document:open'),
  openFolder: () => ipcRenderer.invoke('document:open-folder'),
  saveDocument: (payload: { content: string; path?: string; forceSaveAs?: boolean }) => ipcRenderer.invoke('document:save', payload),
  setDirty: (isDirty: boolean) => ipcRenderer.send('document:set-dirty', isDirty)
})
