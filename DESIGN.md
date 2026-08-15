---
name: Inkwell
description: A local-first editorial workspace for reading and writing Markdown.
colors:
  ink: "#1c2b31"
  paper: "#fbf8f1"
  workbench: "#e8e1d5"
  line: "#d7cfc2"
  teal-action: "#1b6366"
  teal-focus: "#167b81"
  amber-note: "#f2b86f"
  coral-file: "#e56d40"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "clamp(38px, 4vw, 56px)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.72
  label:
    fontFamily: "Manrope Variable, Manrope, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.35
rounded:
  code: "4px"
  control: "8px"
  field: "9px"
  surface: "12px"
spacing:
  compact: "8px"
  control: "12px"
  panel: "16px"
  canvas: "25px"
components:
  button-primary:
    backgroundColor: "{colors.teal-action}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "34px"
  button-new-note:
    backgroundColor: "{colors.amber-note}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0 10px"
    height: "34px"
  input-search:
    backgroundColor: "rgba(255, 253, 248, .52)"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0 9px"
    height: "36px"
---

# Design System: Inkwell

## Overview

**Creative North Star: "The Editorial Worktable"**

Inkwell turns Markdown into a place for sustained reading and deliberate revision. The interface is a small worktable: a warm, softly layered frame holds a generous paper reading surface, with the source close at hand rather than hidden behind an application mode. It should feel considered and humane, never like a dashboard, browser tab, or generic code editor.

The visual hierarchy belongs to the document. A blue-black title bar, restrained navigation, and quiet utility panels establish location without competing with the page. Coral marks document identity, amber invites a new note, and teal is reserved for saved or selected action. The reading pane gets the largest type, calmest surface, and longest measure.

**Key Characteristics:**

- Editorial serif reading paired with precise, compact sans-serif controls.
- Warm paper, darker ink, and low-contrast separators establish depth through tonal layers.
- Three useful states—Read, Split, and Write—change the work surface without changing the product’s visual voice.
- Icons remain thin-line Lucide symbols; color and shape carry meaning before decoration does.

## Colors

The palette is a material system: dark ink and warm paper make the workspace feel grounded, while three accents identify action and document state without becoming decoration.

### Primary

- **Working Teal:** Reserved for the primary save action, selected reading-mode controls, links, focus treatment, and interactive confirmation.

### Secondary

- **Note Amber:** Used for the New note action and a small amount of warm emphasis; it should read as an invitation, not a general-purpose highlight.

### Tertiary

- **Document Coral:** Marks file identity, editor accents, and the app mark. It is a navigation cue, not a page background.

### Neutral

- **Blue-Black Ink:** Holds the title bar, primary reading text, and the strongest application chrome.
- **Editorial Paper:** The reading surface and high-priority control backgrounds; it is intentionally warmer than white.
- **Workbench and Rule:** Soft beige surrounds the page, while quiet warm-gray rules separate functional regions.

**The Accent Rarity Rule.** A screen should have one action color doing one job at a time. Keep teal, amber, and coral in compact, functional areas; broad content surfaces remain paper and ink.

## Typography

**Display Font:** Source Serif 4 (with Georgia fallback)

**Body Font:** Source Serif 4 (with Georgia fallback)

**Label/Chrome Font:** Manrope Variable (with Manrope fallback)

**Source Font:** A system monospace stack for editable Markdown and code only.

**Character:** Source Serif makes the document feel published without becoming ornamental. Manrope keeps navigation, metadata, and compact controls sharply legible. Monospace is strictly a source-language tool, never a stylistic costume.

### Hierarchy

- **Display:** The document’s first heading is expansive, tightly tracked, and editorial; it owns the reader’s first glance.
- **Headline:** Reader section headings are serif, strong, and calmer than the first heading.
- **Title:** Document and navigation titles use compact Manrope at a heavier weight for scanning.
- **Body:** Long-form reading uses the serif body face at a generous measure; utility text uses Manrope at a smaller, denser scale.
- **Label:** Small chrome labels are semibold to bold Manrope, sometimes with modest uppercase tracking for library metadata.

**The Document Leads Rule.** The reader’s serif hierarchy is always visually stronger than the application’s UI labels.

## Layout

The desktop shell is a three-region worktable: a persistent document library, a central workspace, and an outline. The central workspace holds its own document header, canvas, and slim status bar. The split canvas gives reader and source equal responsibility, divided by a single warm rule rather than container cards.

Use a compact outer chrome and an expansive inner page. At full width, the library and outline stay narrow while the central document remains fluid. At the compact desktop breakpoint, the outline becomes a state-driven overlay with its own close control; it must never become a visible-but-inert affordance. At smaller widths, the library can be toggled and the split view prioritizes reading.

Spacing groups controls tightly and gives content noticeably more room above a heading than below it. The status bar remains thin, quiet, and anchored to the workspace bottom.

## Elevation & Depth

Depth comes primarily from adjacent paper tones and hairline warm rules. Shadows are scarce and soft: selected documents and primary actions receive only a low, natural lift; the compact outline overlay receives a broad ambient edge to establish it above the canvas.

### Shadow Vocabulary

- **Selected item lift** (`0 2px 7px rgba(69, 54, 34, .07)`): Used for the active document in the library.
- **Action lift** (`0 2px 5px rgba(24, 73, 74, .18)`): Used for the teal save action.
- **Overlay lift** (`-12px 0 28px rgba(40, 35, 27, .13)`): Used only when the compact outline overlays the workspace.

**The Paper-First Depth Rule.** Use tonal changes and rules before adding a shadow. A shadow must explain elevation or interaction; it is never a decorative halo.

## Shapes

Forms are gently curved and precise. Small code fragments use the smallest radius; controls and rows use compact rounded corners; reader callouts and code blocks use the broadest corners. Borders are thin, warm, and low contrast. Pills are limited to compact controls such as the view switcher—not used as general containers.

## Components

### Buttons

- **Primary Save:** Teal with paper text, a compact rounded corner, and a soft functional lift. Hover slightly deepens the teal and raises the control by one pixel.
- **New Note:** Amber with dark ink, a visible warm border, and the same compact control height as Save. It is the sole amber call-to-action.
- **Save As:** An outlined, paper-adjacent secondary action. Keep it close to Save and hide it only where the compact desktop overlay would obstruct it; the keyboard shortcut remains available.
- **Icon Buttons:** Thin-line icons in a square control with a quiet rounded hover surface. Every icon-only action has an accessible label.

### Inputs / Fields

- **Search:** A soft paper-tinted field with a warm border and compact radius. Focus changes both the border and a teal-tinted outer ring.
- **Source Editor:** Borderless inside its panel, with generous inner padding, dark monospace text, a coral caret, and an intentional selection color.

### Navigation

- **Document Library:** File rows are flat by default. The active row becomes a light paper sheet with a fine warm border and small ambient lift; coral distinguishes its file icon.
- **Outline:** A narrow contextual list with progressively indented heading levels. At compact width it is a real overlay, not a reduced static column.
- **View Switcher:** Read, Split, and Write live as a compact grouped control. The selected state becomes paper on a warm neutral backing with a small inset lift.

### Reader Surface

- **Reading Pane:** A clean paper field with a centered long-form measure, serif hierarchy, warm rules, quiet tables, and teal-linked text.
- **Callout:** Pale teal paper with a fine teal border and broad compact corner; use for information that deserves a pause, not for every aside.

## Do's and Don'ts

### Do:

- **Do** give documents the largest type, clearest contrast, and most generous whitespace.
- **Do** use paper-tone layering and hairline rules to establish regions before reaching for shadows.
- **Do** use teal for completion and active interaction, amber for starting a note, and coral for document identity.
- **Do** preserve clear keyboard focus, custom selection, caret, and scrollbar treatments as part of the interface.
- **Do** keep file, folder, save, and mode controls immediately understandable with text or accessible labels.

### Don't:

- **Don't** turn the reader into an analytics dashboard, a tiled card layout, or a generic code-editor clone.
- **Don't** use gradient text, decorative glass, hard offset shadows, or broad accent-color panels.
- **Don't** use monospace outside source editing, code, or measurements.
- **Don't** replace the thin-line icon system with emoji or unrelated glyphs.
- **Don't** offer a control at compact widths unless it remains visibly and functionally operable.
