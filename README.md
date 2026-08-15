# Inkwell

Inkwell is a local-first Markdown reader and editor for Linux desktop. It pairs a deliberate reading surface with an editable source view, while saving directly to your filesystem.

## What it does

- Open one or more Markdown files, or browse a folder of Markdown documents.
- Create new drafts and save them as local `.md` files.
- Switch between focused reading, source editing, and split view.
- Render GitHub-flavored Markdown including tables, task lists, blockquotes, and code.
- Use the generated outline to navigate long documents.
- Work entirely locally—there are no accounts or cloud services.

## Run it in development

```bash
pnpm install
pnpm dev
```

## Build and package

```bash
pnpm build
pnpm package:linux
```

The packaged Linux application is written to `dist/Inkwell-0.1.0.AppImage`.

```bash
chmod +x dist/Inkwell-0.1.0.AppImage
./dist/Inkwell-0.1.0.AppImage
```

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Open Markdown file(s) |
| `Ctrl+Shift+O` | Open a folder |
| `Ctrl+S` | Save the active document |

## Project structure

- `src/` — React application and editorial interface.
- `src-electron/` — Electron main process and hardened preload bridge for local-file dialogs and saving.
- `build/` — application icon assets.
