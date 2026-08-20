# Inkwell

Inkwell is a local-first Markdown reader and editor for the Linux desktop. It pairs a deliberate reading surface with an editable source view, and saves directly to your filesystem.

It is built for [Omarchy](https://omarchy.org/) (Arch Linux + Hyprland): the compositor owns the window frame, and Inkwell follows the active system theme.

## What it does

- Add folders of Markdown to the library and keep several at once — each stays
  its own group, and adding one never closes anything else.
- Reopen where you left off: your folders, your recent files, and the document
  you were in all come back on the next launch.
- Act on files from the library: open, rename, duplicate, reveal in your file
  manager, copy the path, or move to the desktop trash.
- Create new drafts and save them as local `.md` files.
- Switch between focused reading, source editing, and split view.
- Drop into focus writing, where only the page, the save controls, and an optional split remain.
- Render GitHub-flavored Markdown including tables, task lists, blockquotes, and code.
- Use the generated outline to navigate long documents.
- Follow the active Omarchy theme, including light and dark, without a restart.
- Work entirely locally—there are no accounts or cloud services. The one
  request Inkwell makes is an optional daily check for a newer version, which
  can be turned off.

## Requirements

Inkwell runs on the **system Electron** rather than bundling its own copy, so it
tracks your distribution's security updates and stays small — the package is
about 1 MB installed instead of ~200 MB.

```bash
sudo pacman -S electron43
```

The package pins a specific Electron major, as Arch's own Electron applications
do. Installing via `makepkg -si` pulls it in for you.

## Run it in development

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs against whichever Electron binary it finds — `electron`,
`electron43`, or the local `node_modules` copy (see `scripts/electron.sh`).

```bash
pnpm typecheck     # both tsconfigs
pnpm build         # compile main process + build renderer
pnpm preview       # build, then run the built app
```

## Install as a package

The primary distribution target is an Arch package that depends on the system
Electron. See [`packaging/README.md`](packaging/README.md) for maintainer notes.

```bash
cd packaging
makepkg -si
```

### Updates

Inkwell is not in the AUR, so nothing updates it for you. Once a day it asks
GitHub whether a newer `v<x.y.z>` tag exists, and when there is one a quiet line
appears at the right of the status bar: *Inkwell 0.1.3 available*. Clicking it
opens that tag's page; the `×` beside it silences that version, and only
something newer speaks up again.

The check sends nothing but the request itself — no document, no file name, no
path — and it fails silently. Offline, behind a captive portal, and rate limited
all look the same from inside the app: the line simply does not appear, and the
next launch tries again.

To switch it off completely, set `INKWELL_NO_UPDATE_CHECK=1` in the environment
Inkwell launches in.

Updating is then the same `makepkg -si` in `packaging/`, once `pkgver` and
`sha256sums` point at the new tag.

### Markdown file association

The desktop entry registers `text/markdown`, which makes Inkwell a candidate
handler. Be aware of what that means in practice: if you have no explicit
preference set, the desktop resolves the default from `mimeinfo.cache` ordering,
and `inkwell` sorts ahead of Omarchy's `omawrite` — so installing can quietly
become your default `.md` handler.

Set it explicitly either way rather than relying on that ordering:

```bash
xdg-mime default inkwell.desktop text/markdown text/x-markdown   # choose Inkwell
xdg-mime default omawrite.desktop text/markdown text/x-markdown  # keep Omawrite
```

Check the current handler with `xdg-mime query default text/markdown`.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Open Markdown file(s) |
| `Ctrl+Shift+O` | Add a folder to the library |
| `Ctrl+S` | Save the active document |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+N` | New note |
| `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | Read / Split / Write view |
| `Ctrl+Shift+F` | Focus writing |
| `Ctrl+B` | Toggle the library |
| `Ctrl+\` | Toggle the outline |
| `Escape` | Leave focus writing, otherwise close the outline |

You can also open a file directly:

```bash
inkwell notes.md
```

## The library

The left pane is your library, grouped by where each document came from. Nothing
you do to it ever replaces what is already there.

- **Add folder** (`Ctrl+Shift+O`) adds a folder as a *source*: its Markdown is
  listed under the folder's name, up to eight folders at once. Overlapping
  folders are refused, so a file is never listed twice.
- **Open file** (`Ctrl+O`) adds a file to **Recent**, or to its folder's group if
  you have already added the folder it lives in. Files passed on the command
  line behave the same way.
- **Drafts** holds new notes that have no file yet. Saving one moves it to
  wherever it landed on disk.
- **Sample documents** appear on a first run and step aside as soon as you open
  anything of your own.

Inkwell remembers your folders, your recent files, and the document you were in,
and restores them on the next launch. A folder that has since moved or been
unmounted is quietly dropped.

Each row has an actions menu — the `⋯` button, or a right-click:

| Action | What it does |
| --- | --- |
| Open | Reads the file in, if it is not already open |
| Rename… | Renames the file on disk, in place |
| Duplicate | Copies it alongside the original as `name copy.md` |
| Reveal in file manager | Opens the containing folder |
| Copy path | Puts the full path on the clipboard |
| Remove from recent / Discard draft | Takes the row out of the library only |
| Move to trash… | Asks first, then moves the file to your desktop trash |

Folder rows are not closable — the folder still holds the file. Use **Remove
from library** on the folder's heading instead, which leaves every file on disk.
Hover a row to see its full path.

## Theming

Inkwell reads the active Omarchy theme's palette and repaints itself when you run
`omarchy theme set <name>`. Color is theme-driven; typography, spacing, and
layering are not. Off Omarchy, it falls back to its own editorial palette.

[`THEMING.md`](THEMING.md) is the authority for the token contract and the
derivation rules. [`DESIGN.md`](DESIGN.md) governs everything that is not color.

## Project structure

- `src/` — React application and editorial interface.
- `src-electron/` — Electron main process, hardened preload bridge, the Omarchy theme resolver, and the version check.
- `packaging/` — Arch PKGBUILD, desktop entry, and maintainer notes.
- `scripts/` — development helpers.
- `build/` — application icon assets.
