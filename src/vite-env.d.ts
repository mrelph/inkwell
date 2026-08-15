/// <reference types="vite/client" />

declare global {
  type DocumentFile = { name: string; path: string; content: string; savedAt: number }

  type ThemePayload = {
    name: string
    mode: 'light' | 'dark'
    colors: Record<string, string>
  }

  interface Window {
    inkwell?: {
      openDocuments: () => Promise<DocumentFile[]>
      openFolder: () => Promise<{ folder: string; documents: DocumentFile[] }>
      saveDocument: (payload: { content: string; path?: string; forceSaveAs?: boolean; knownMtime?: number }) => Promise<{ canceled: boolean; path?: string; savedAt?: number }>
      setDirty: (isDirty: boolean) => void
      /** Resolves the active Omarchy theme, or the default palette off Omarchy. */
      getTheme: () => Promise<ThemePayload>
      /** Subscribes to theme switches; returns an unsubscribe function. */
      onThemeChange: (listener: (theme: ThemePayload) => void) => () => void
      /** Native confirm before discarding unsaved work. True means discard. */
      confirmDiscard: (names: string) => Promise<boolean>
      /** Files passed on argv or opened while the app was already running. */
      onOpenExternal: (listener: (documents: DocumentFile[]) => void) => () => void
    }
  }
}

export {}
