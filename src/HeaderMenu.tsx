import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type MenuItem = {
  key: string
  label: string
  icon?: ReactNode
  hint?: string
  disabled?: boolean
  /** Present on a radio item; true marks the current choice. */
  toggle?: boolean
  checked?: boolean
  separated?: boolean
  onSelect: () => void
}

/* A small popup menu for the late header stages. Positioned against its own
   button and right-aligned, so it opens into the workspace at any width. */
export function HeaderMenu({ label, title, className, trigger, items }: {
  label: string
  title: string
  className?: string
  trigger: ReactNode
  items: MenuItem[]
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    /* Capture, and stop there: Escape closes this menu and nothing else — it
       must not also fall through to leaving focus mode or closing the outline. */
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      setOpen(false)
      button.current?.focus()
    }
    window.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', onKey, true)
    list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    return () => {
      window.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  /* The list hangs right-aligned from its button. Where the header keeps
     clear of the window controls the button sits further left, so in a narrow
     window the list would run off the left edge: nudge it back in. */
  useLayoutEffect(() => {
    const element = list.current
    if (!open || !element) return
    element.style.transform = ''
    const overhang = 8 - element.getBoundingClientRect().left
    if (overhang > 0) element.style.transform = `translateX(${Math.ceil(overhang)}px)`
  }, [open])

  const moveFocus = (step: number) => {
    const options = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    if (!options.length) return
    const at = options.indexOf(document.activeElement as HTMLButtonElement)
    options[(at + step + options.length) % options.length].focus()
  }

  return (
    <div className={`header-menu ${className ?? ''}`} ref={root}>
      <button
        ref={button}
        className="icon-button header-menu-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={title}
        onClick={() => setOpen((current) => !current)}
      >
        {trigger}
      </button>
      {open && (
        <div
          className="header-menu-list"
          id={id}
          role="menu"
          aria-label={label}
          ref={list}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(1) }
            if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(-1) }
            if (event.key === 'Tab') setOpen(false)
          }}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role={item.checked === undefined ? 'menuitem' : item.toggle ? 'menuitemcheckbox' : 'menuitemradio'}
              aria-checked={item.checked}
              className={[item.separated ? 'separated' : '', item.checked ? 'checked' : ''].filter(Boolean).join(' ') || undefined}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                button.current?.focus()
                item.onSelect()
              }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.hint && <kbd>{item.hint}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
