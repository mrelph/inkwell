# Inkwell

Inkwell is a local-first Markdown reader and editor for the Linux desktop. It pairs a deliberate reading surface with an editable source view, and saves directly to your filesystem.

It is built for [Omarchy](https://omarchy.org/) (Arch Linux + Hyprland): the compositor owns the window frame, and Inkwell follows the active system theme.

## What it does

- Open one or more Markdown files, or browse a folder of Markdown documents.
- Create new drafts and save them as local `.md` files.
- Switch between focused reading, source editing, and split view.
- Render GitHub-flavored Markdown including tables, task lists, blockquotes, and code.
- Use the generated outline to navigate long documents.
- Follow the active Omarchy theme, including light and dark, without a restart.
- Work entirely locally—there are no accounts or cloud services.

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
| `Ctrl+Shift+O` | Open a folder |
| `Ctrl+S` | Save the active document |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+N` | New note |
| `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | Read / Split / Write view |
| `Ctrl+B` | Toggle the document library |
| `Ctrl+\` | Toggle the outline |
| `Escape` | Close the outline overlay |

You can also open a file directly:

```bash
inkwell notes.md
```

## Theming

Inkwell reads the active Omarchy theme's palette and repaints itself when you run
`omarchy theme set <name>`. Color is theme-driven; typography, spacing, and
layering are not. Off Omarchy, it falls back to its own editorial palette.

[`THEMING.md`](THEMING.md) is the authority for the token contract and the
derivation rules. [`DESIGN.md`](DESIGN.md) governs everything that is not color.

## Project structure

- `src/` — React application and editorial interface.
- `src-electron/` — Electron main process, hardened preload bridge, and the Omarchy theme resolver.
- `packaging/` — Arch PKGBUILD, desktop entry, and maintainer notes.
- `scripts/` — development helpers.
- `build/` — application icon assets.
