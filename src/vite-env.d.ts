/// <reference types="vite/client" />

declare global {
  type DocumentFile = { name: string; path: string; content: string; savedAt: number }

  type RecentEntry = { path: string; name: string; openedAt: number }

  /** The remembered library: folder sources, recent files, and where you were. */
  type InkwellState = {
    folders: string[]
    recent: RecentEntry[]
    activePath?: string
    introDone: boolean
  }

  /** A newer tag exists on GitHub. Null everywhere else — see src-electron/update.ts. */
  type UpdateNotice = { version: string; url: string }

  type RenameResult =
    | { ok: true; path: string; name: string; savedAt?: number }
    | { ok: false; reason: string }

  type ThemePayload = {
    name: string
    mode: 'light' | 'dark'
    colors: Record<string, string>
  }

  interface Window {
    inkwell?: {
      openDocuments: () => Promise<DocumentFile[]>
      openFolder: () => Promise<{ folder: string; documents: DocumentFile[] }>
      /** Re-reads a folder Inkwell already knows about — no dialog. */
      readFolder: (folder: string) => Promise<{ folder: string; documents: DocumentFile[] }>
      /** Reads recent files back in, which the library holds only as paths. */
      readDocuments: (paths: string[]) => Promise<DocumentFile[]>
      loadState: () => Promise<InkwellState>
      saveState: (state: InkwellState) => void
      renameDocument: (payload: { path: string; name: string }) => Promise<RenameResult>
      duplicateDocument: (filePath: string) => Promise<DocumentFile | null>
      /** Moves the file to the desktop trash. Never an unlink. */
      trashDocument: (filePath: string) => Promise<boolean>
      confirmTrash: (name: string) => Promise<boolean>
      revealDocument: (filePath: string) => void
      copyText: (text: string) => void
      /** The last known update, from cache. Null when there is nothing to say. */
      getUpdate: () => Promise<UpdateNotice | null>
      /** Silences this version; anything newer speaks up again. */
      dismissUpdate: (version: string) => void
      /** Opens the tag page for the known update in the desktop browser. */
      openUpdate: () => void
      onUpdateAvailable: (listener: (notice: UpdateNotice) => void) => () => void
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
