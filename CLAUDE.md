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
array; `activeId` selects the current one. Ids are keyed on path (`file:<path>`)
so reopening a file resolves to the existing entry instead of duplicating it.

Open semantics are deliberately split, and the distinction matters:

- `addDocuments` — **appends**, deduped by path. Used by open-file, argv, and
  second-instance. Discards nothing, so it needs no confirmation prompt.
- `replaceDocuments` — **replaces** the library, treating a folder as a
  workspace. Used only by open-folder, and gated behind `confirmDiscard`.

Don't route open-file back through `replaceDocuments`; that was the original
behaviour and it silently discarded every other open document.

**View modes** (`read`/`split`/`write`) are driven by CSS grid classes on
`.document-canvas`, not separate components.

**Focus writing** is an orthogonal `focusMode` flag, not a fourth view mode —
focus + split is a legitimate combination. It hides the sidebar, outline and
status bar via `.focus-mode`, and `Escape` exits it *before* falling through to
closing the outline. One inversion to be aware of: below 820px a split normally
collapses to the reader, but in focus mode it must collapse to the **editor**,
since the whole point is the writing surface.

## Layout invariants

`grid-template-columns` is declared exactly once, on `.app-shell`, and driven by
`--col-sidebar` / `--col-outline`. The collapse-state rules live in a block at
the very end of `styles.css`, carry two classes, and must stay last: a
single-class rule placed before a breakpoint's `.app-shell` rule loses at equal
specificity and leaves a dead column where the panel used to be. That was a real
bug (a 230px gutter between 821–1120px), so don't re-introduce per-breakpoint
column declarations.

Never hide the only control that can restore a panel. Hiding `.outline-toggle`
above 1120px while leaving the in-panel close button visible made closing the
outline a one-way door with a pointer. The toggle is now always visible; the
in-panel close appears only when the outline is an overlay.

Each region is pinned to its track (`.sidebar` → 1, `.workspace` → 2,
`.outline` → 3). This is load-bearing, not tidiness: a `display: none` panel
stops occupying a grid cell, so under auto-placement the workspace slides into
the collapsed panel's zero-width track while the real track sits empty.

`.workspace` needs an explicit `grid-template-columns: minmax(0, 1fr)`. With
only an implicit `auto` column the track is sized by its widest child's
min-content — the header's button row — so the workspace grows past its own grid
track and the canvas overflows with it.

**Verify layout by measuring element widths, not track sizes.** Correct
`gridTemplateColumns` does not imply correct layout: both bugs above produced
perfect track values while the canvas was visibly wrong, and a harness checking
only tracks reported a false pass. Assert `canvas <= workspace` and
`workspace == viewport - sidebar - outline`.

Two ways to check, in increasing fidelity:

- Offscreen: load `dist/index.html` in a hidden `BrowserWindow`, drive it with
  synthetic `KeyboardEvent`s, and measure `getBoundingClientRect()`. Such a
  harness needs `app.on('window-all-closed', () => {})` or Electron quits as
  soon as the first probe window is destroyed.
- Live: launch with `--remote-debugging-port=9222` and drive the real window via
  `Runtime.evaluate` over the DevTools protocol (Node's global `WebSocket` is
  enough). This is the one that catches real-DPR and real-theme issues.

Screenshots are a poor fit here: `grim` captures whatever is composited at the
given coordinates, so it silently grabs unrelated windows when the stack shifts.

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

Installing *can* take over the `text/markdown` default even though nothing sets
it deliberately: with no explicit user preference, the handler is resolved from
`mimeinfo.cache` ordering, and `inkwell.desktop` sorts ahead of Omarchy's
`omawrite.desktop`. Verified on a real install. Don't claim the association is
purely opt-in — direct users to set it explicitly with `xdg-mime default`, as the
README now does.
