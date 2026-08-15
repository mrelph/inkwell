# Theming: Omarchy Theme Adaptation

Inkwell follows the active Omarchy theme. This document is the authority for the
token vocabulary and the derivation rules. `DESIGN.md` remains the authority for
everything that is *not* color (typography, spacing, layering, motion, shape).

## Principle

**Color is theme-driven. Structure is not.** Inkwell's identity lives in its
editorial typography, its generous reading measure, tonal surface layering, and
hairline rules — not in specific hex values. A theme change repaints Inkwell; it
never restructures it.

Mode is **full theme-follow**: one accent color does all accent work. Hierarchy
between actions is expressed through *treatment* (filled / tinted / ghost), never
through inventing a second hue. This is DESIGN.md's Accent Rarity Rule taken to
its logical end: one action color, one job at a time.

## Source of truth

Palette comes from the active theme's `colors.toml`:

```
~/.local/state/omarchy/current/theme/colors.toml
```

Note this is XDG **state**, not config. `current/theme` is a real directory that
`omarchy-theme-set` replaces wholesale via an atomic `rm -rf` + `mv`, so watch the
containing directory (`~/.local/state/omarchy/current/`) for the `theme` entry
being renamed and for writes to `theme.name` — never watch `colors.toml`'s inode,
which is replaced.

`colors.toml` provides: `mode`, `accent`, `selection`, `muted`, four background
steps, four foreground steps, and 8 base + 6 bright hues. It is preferred over
`alacritty.toml` because it is the only source carrying `mode` and `accent`.

When `~/.local/state/omarchy/` is absent, Inkwell is not on Omarchy: fall back to
the static default palette below and change nothing else.

## Mode detection cascade

Replicate `omarchy-theme-color`'s own order:

1. `mode` field in `colors.toml` (`"light"` / `"dark"`)
2. legacy `theme_type` field
3. legacy `light.mode` marker file in the theme directory
4. relative luminance of `background` (≥ 0.5 → light)
5. default to dark

Set `color-scheme: light|dark` on the root element so scrollbars, form controls,
and native widgets follow, and drop the hardcoded
`<meta name="color-scheme" content="light">` from `index.html`.

## Surface derivation — the inversion trap

The four background steps are **not** ordered consistently between modes:

| theme | `background` | `dark_background` | `darker_background` | `lighter_background` |
| --- | --- | --- | --- | --- |
| osaka-jade (dark) | `#111c18` | `#0c1512` | `#090f0d` | `#23372B` (lighter) |
| flexoki-light (light) | `#FFFCF0` | `#f2efe4` | `#e5e2d8` | `#E6E4D9` (**darker**) |

In a light theme `lighter_background` is *darker* than `background`. Mapping
surfaces by name therefore inverts light themes.

**Rule: assign surfaces by measured contrast against the text color, never by
name.** Compute the WCAG contrast ratio of each of the four background steps
against the resolved foreground, sort descending, and assign:

| rank (contrast vs text) | token | role |
| --- | --- | --- |
| 1 — highest | `--surface-reader` | the reading surface; the document gets the clearest contrast |
| 2 | `--surface-panel` | sidebar, outline, editor panel |
| 3 | `--surface-canvas` | gutter behind panels, split divider field |
| 4 — lowest | `--surface-chrome` | header and status bar; recedes |

This yields the correct result in both modes automatically: a near-black reading
surface with lifted chrome in osaka-jade, and a white page with warm-gray chrome
in flexoki-light. It also satisfies DESIGN.md's "give documents the clearest
contrast" and preserves tonal layering instead of flattening every surface to one
value (the mistake Omarchy's own generated `obsidian.css` makes).

If fewer than four distinct values exist, synthesize the missing steps by mixing
the nearest surface toward or away from the foreground in small perceptual steps.

## Token vocabulary

All tokens are CSS custom properties on `:root`. `styles.css` must reference only
these — no raw hex literals.

**Surfaces**

- `--surface-reader` — reading pane
- `--surface-panel` — sidebar / outline / editor panels
- `--surface-canvas` — behind panels, split field
- `--surface-chrome` — document header, status bar
- `--surface-raised` — hover and selected sheet; derived by shifting `--surface-panel` one step toward `--surface-reader`
- `--surface-code` — fenced code block background; must be distinct from `--surface-reader`

**Text**

- `--text-primary` — body and headings
- `--text-secondary` — document titles and chrome labels
- `--text-muted` — metadata, small labels, status bar
- `--text-inverse` — text on an accent fill

**Lines**

- `--line-hairline` — warm rule separating regions
- `--line-strong` — border of an active or selected item

**Accent (single hue)**

- `--accent` — the one action color
- `--accent-hover` — one perceptual step from `--accent`
- `--accent-contrast` — text/icon color on an accent fill, contrast-checked
- `--accent-tint` — low-alpha accent for callouts and selected backgrounds
- `--accent-ring` — focus ring

**Editor**

- `--caret` — text caret, `--accent`
- `--selection-bg`, `--selection-text`

## Contrast enforcement

Arbitrary theme pairings cannot be trusted; the current hardcoded palette already
fails AA in places (`.document-item small` at roughly 2.6:1). Enforce at
derivation time, in the main process:

- `--text-primary` vs `--surface-reader` — target 7:1, **require ≥ 4.5:1**. If
  `foreground` fails, try `bright_foreground`, then `light_foreground`, then
  `dark_foreground`, then pure white/black.
- `--text-muted` vs `--surface-panel` **and** `--surface-chrome` — require
  ≥ 4.5:1 (it is used at 10–11px, so the large-text 3:1 allowance does not
  apply). Start from `muted` and blend toward `--text-primary` until it passes.
- `--accent-contrast` vs `--accent` — require ≥ 4.5:1; pick the better of the
  theme's extreme foregrounds, else white/black.
- `--selection-text` vs `--selection-bg` — require ≥ 4.5:1.

A token that cannot satisfy its floor falls back rather than shipping unreadable
text. Contrast is a correctness property here, not a preference.

## Headings stay ink

Omarchy's generated `obsidian.css` colors `h1`–`h6` red / green / yellow /
accent / magenta. Inkwell deliberately does not: headings use `--text-primary`.
Per DESIGN.md, the reader's hierarchy is carried by size, weight and spacing, and
accent color stays functional rather than decorative. Inline code and links may
take `--accent`.

## Runtime plumbing

1. Main process resolves tokens on startup and watches
   `~/.local/state/omarchy/current/` for theme swaps.
2. On change, re-resolve, re-run contrast enforcement, and
   `webContents.send('theme:changed', tokens)`.
3. Preload exposes an `onThemeChange` subscription (today it only exposes
   invoke-style calls).
4. Renderer applies tokens via `documentElement.style.setProperty` and sets
   `data-theme-mode`. No rebuild, no reload, no flash.
5. `BrowserWindow.backgroundColor` must also be set from the resolved
   `--surface-chrome`, otherwise a cream flash precedes every dark-theme launch.

## Default palette (non-Omarchy fallback)

Derived from DESIGN.md so Inkwell is unchanged off Omarchy:

| token | value |
| --- | --- |
| `--surface-reader` | `#fbf8f1` |
| `--surface-panel` | `#e9e2d6` |
| `--surface-canvas` | `#e8e1d5` |
| `--surface-chrome` | `#f7f3ec` |
| `--text-primary` | `#1c2b31` |
| `--text-muted` | `#6b6459` (darkened from DESIGN.md's muted to reach AA) |
| `--line-hairline` | `#d7cfc2` |
| `--accent` | `#1b6366` |
| `--accent-ring` | `#167b81` |
