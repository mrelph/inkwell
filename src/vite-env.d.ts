/// <reference types="vite/client" />

declare global {
  interface Window {
    inkwell?: {
      openDocuments: () => Promise<Array<{ name: string; path: string; content: string }>>
      openFolder: () => Promise<{ folder: string; documents: Array<{ name: string; path: string; content: string }> }>
      saveDocument: (payload: { content: string; path?: string; forceSaveAs?: boolean }) => Promise<{ canceled: boolean; path?: string; savedAt?: number }>
      setDirty: (isDirty: boolean) => void
    }
  }
}

export {}
