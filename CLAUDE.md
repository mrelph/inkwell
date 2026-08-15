# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is pnpm.

```bash
pnpm install               # install dependencies
pnpm dev                   # Vite dev server + Electron, with tsc watch on the main process
pnpm build                 # tsc-compile src-electron/ and vite-build src/ into dist-electron/ and dist/
pnpm typecheck             # both tsconfigs, no emit
pnpm preview               # build, then launch the built app
pnpm package:linux         # AppImage via electron-builder (secondary; see Packaging)
```

There is no test suite and no linter. `pnpm typecheck` is the only automated gate.

Inkwell runs on the **system Electron**, not a bundled one. `scripts/electron.sh`
resolves `electron`, then `electron43`…`electron39`, then the local
`node_modules` copy. On Arch, `pacman -S electron43`. Note that Arch ships
Electron 39–43 and has **no `electron34`** — the devDependency is pinned to `^43`
to match the system runtime.

pnpm does not run Electron's postinstall (build scripts are not auto-approved),
so `node_modules` holds no Electron binary. That is intended here; `pnpm
approve-builds` would fetch it if a non-Arch contributor needs the fallback.

The PKGBUILD pins `_electron=electron43` as a single source of truth driving both
`depends=()` and the installed `/usr/bin/inkwell` launcher, matching Arch
convention (obsidian and element-desktop pin electron43, code pins electron42).
The floating `electron` meta-package `Provides` nothing, so depending on it only
adds indirection.

To run the built app directly for verification: `electron43 .` from the repo root.

## Critical invariants

**`vite.config.ts` must keep `base: './'`.** Electron loads the built
`index.html` over `file://`, where absolute `/assets/...` URLs resolve to the
filesystem root and the app renders as a blank window. Dev works either way, so
removing this breaks only production and packaged builds — silently.

**`styles.css` contains no raw color literals below the `:root` block.** Every
color resolves to a CSS custom property so an Omarchy theme change repaints the
app. The `:root` block holds the DESIGN.md default palette, used off Omarchy and
as the pre-injection paint. Adding a hex literal elsewhere creates a spot that
ignores the user's theme.

**No new npm dependencies without checking network access.** This environment has
none; `pnpm add` fails silently or no-ops. The theme resolver hand-rolls its TOML
reading for this reason.

## Architecture

Local-first Markdown reader/editor: an Electron shell around a single-page React
app. No backend and no network calls; all persistence is filesystem I/O via IPC.

- `src-electron/main.ts` — owns all filesystem access (`document:open`,
  `document:open-folder`, `document:save`, `document:confirm-discard`,
  `theme:get`), native dialogs, the unsaved-changes close guard, the
  single-instance lock, argv file opening, and the external-link policy
  (`setWindowOpenHandler` + `will-navigate` hand safe schemes to
  `shell.openExternal` and deny everything else).
- `src-electron/theme.ts` — resolves the active Omarchy theme into design tokens
  and watches for theme switches.
- `src-electron/preload.ts` — contextBridge exposing `window.inkwell`. Typed in
  `src/vite-env.d.ts`. Subscription-style methods return an unsubscribe function.
  `contextIsolation: true`, `nodeIntegration: false`.
- `src/main.tsx` — the entire renderer UI in one file. When `window.inkwell` is
  undefined (running outside Electron) file operations no-op.

**Renderer data model:** all open documents live in one `documents: MarkdownDoc[]`
array; `activeId` selects the current one. Opening files/a folder *replaces* the
array and so is gated behind `confirmDiscard`. Files arriving from argv or a
second instance are *appended* instead, so they can never discard unsaved work.

**View modes** (`read`/`split`/`write`) are driven by CSS grid classes on
`.document-canvas`, not separate components.

## The window belongs to the compositor

Inkwell targets Hyprland, a tiling Wayland compositor. `frame: false`, no
titlebar, and no `-webkit-app-region: drag` anywhere — the compositor draws the
border and shows the title, and there is nothing to drag in a tiled layout. One
`.document-header` carries document identity and actions; adding a second chrome
strip takes space from the document in a window that may only be ~400px tall.

`minWidth`/`minHeight` are deliberately low (480×360). Hyprland tiles a window to
whatever the layout dictates regardless of these hints, so every breakpoint —
including the `max-height` one — must stay fully operable. Never leave a control
visible but inert; collapsed panels use `display: none` rather than `opacity: 0`
so they cannot hold keyboard focus while invisible.

The runtime Wayland `app_id` is `inkwell`, derived from package.json `name`.
`StartupWMClass` in the desktop entry must match it exactly or window/icon
association breaks. Electron 43 selects Wayland on its own; no ozone flags are
needed (they *were* required on 34).

## Theming

`THEMING.md` is the authority — read it before touching color. `DESIGN.md`
governs everything that is not color.

Palette comes from `~/.local/state/omarchy/current/theme/colors.toml` (XDG
*state*, not config). `omarchy-theme-set` replaces the `theme` directory
wholesale via `rm -rf` + `mv`, so watch the containing directory, never
`colors.toml`'s inode.

The one trap worth restating: the four background steps are **not** ordered
consistently between modes — in light themes `lighter_background` is *darker*
than `background`. Surfaces are therefore assigned by measured WCAG contrast
against the resolved foreground, never by name. Mapping by name inverts every
light theme.

Contrast floors are enforced at derivation time rather than trusted, because
arbitrary theme pairings routinely fail AA.

## Heading anchors are content-based, on purpose

The outline scanner (`getHeadings`) and the reader's heading renderers are two
independent parsers, and they *will* disagree — a `#` inside a fenced block, a
setext heading. IDs are slugs of heading text, not ordinals, so a disagreement
costs one broken anchor instead of shifting every subsequent one. If you change
slugging on one side, change it on the other; both go through `slugify` +
`inlineToText`.

## Packaging

Primary target is an Arch package depending on the system Electron (the Obsidian
model): `packaging/PKGBUILD`, `packaging/inkwell.desktop`,
`packaging/README.md`. The `source=` URL is a placeholder — there is no git
remote yet. `pnpm-lock.yaml` still needs regenerating after the Electron `^43`
bump before `--frozen-lockfile` will succeed.

Installing does not steal the `text/markdown` default handler (Omarchy ships
`omawrite`); that is an opt-in `xdg-mime default` command, documented in the
README.
