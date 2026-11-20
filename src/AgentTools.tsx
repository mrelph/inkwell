import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HeaderMenu, type MenuItem } from './HeaderMenu'
import { Settings, Bot, X } from 'lucide-react'
import { createTwoFilesPatch } from 'diff'

type Props = {
  enabled: boolean
  onEnable: (value: boolean) => void
  view: string
  otherCommands: Record<string, () => void>
  commands: MenuItem[]
  note?: SharedNote
  onReplace: (before: string, after: string) => boolean
}

export function AgentTools(props: Props) {
  const { enabled, note, onEnable } = props
  const api = window.inkwell?.agent
  const [panel, setPanel] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const toggle = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && !event.shiftKey && event.code === 'KeyA') {
        event.preventDefault()
        setPanel(open => !open)
      }
    }
    window.addEventListener('keydown', toggle)
    return () => window.removeEventListener('keydown', toggle)
  }, [enabled])
  const [providers, setProviders] = useState<AgentProvider[]>([])
  const [provider, setProvider] = useState('')
  const [share, setShare] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<BufferRequest>()
  const reviewing = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const latest = useRef(props)
  const version = useRef(0)
  useLayoutEffect(() => { latest.current = props })
  useEffect(() => {
    if (!api) return
    let live = true
    void api.enable(enabled).then(async () => {
      if (!enabled || !live) return
      const list = await api.providers()
      if (live) {
        setProviders(list)
        setProvider(list.find(item => item.installed)?.name ?? '')
      }
    }).catch(error => { if (live) setTranscript(String(error)) })
    return () => { live = false }
  }, [api, enabled])

  function reset() {
    version.current++
    void api?.stop()
    reviewing.current = false
    setProposal(undefined)
    setBusy(false)
    setTranscript('')
  }
  useEffect(() => {
    reset()
    return () => { void api?.stop() }
  }, [api, note?.id, enabled, share, provider])

  useEffect(() => {
    if (!api) return
    const text = api.onText(chunk => setTranscript(value => value + chunk))
    const buffer = api.onBuffer(request => {
      const current = latest.current.note
      if (!current || current.id !== request.id) void api.reply(request.request)
      else if (request.change === undefined) void api.reply(request.request, current.content)
      else if (current.content !== request.base) void api.reply(request.request)
      else if (reviewing.current) void api.reply(request.request)
      else {
        reviewing.current = true
        setProposal(request)
      }
    })
    return () => { text(); buffer() }
  }, [api])
  useEffect(() => {
    if (proposal) dialog.current?.showModal()
  }, [proposal])
  function review(allow: boolean) {
    if (!proposal || !api) return
    dialog.current?.close()
    const accepted = allow && proposal.id === note?.id && proposal.base === note?.content &&
      proposal.change !== undefined && props.onReplace(note.content, proposal.change)
    void api.reply(proposal.request, accepted ? proposal.change : undefined)
    reviewing.current = false
    setProposal(undefined)
  }
  async function send() {
    if (!api || busy || !provider || !prompt.trim()) return
    const turn = version.current
    const text = prompt.trim()
    setPrompt('')
    setBusy(true)
    setTranscript(value => value + '\nYou: ' + text + '\n')
    try {
      await api.prompt({ provider, text, note: share && note ? { id: note.id, name: note.name, path: note.path, content: note.content } : undefined })
    } catch (error) {
      if (version.current === turn) setTranscript(value => value + '\n' + String(error))
    } finally {
      if (version.current === turn) setBusy(false)
    }
  }
  function popupCommands() {
    void window.inkwell?.popupCommands({ enabled, hasNote: !!note, view: props.view })
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'F10' && !event.shiftKey && !event.repeat && !document.querySelector('dialog[open]')) {
        event.preventDefault()
        popupCommands()
      }
    }
    window.addEventListener('keydown', keydown)
    const off = window.inkwell?.onCommand(id => {
      if (id === 'enableAgent') { onEnable(!enabled); setPanel(!enabled) }
      else if (id === 'panel') setPanel(value => !value)
      else (props.commands.find(command => command.key === id)?.onSelect ?? props.otherCommands[id])?.()
    })
    return () => { window.removeEventListener('keydown', keydown); off?.() }
  }, [props, enabled, note, onEnable])
  return <>
    {enabled && <button className="icon-button" title="Agent (Ctrl+Alt+A)" aria-label="Agent panel" aria-expanded={panel}
      onClick={() => setPanel(open => !open)}><Bot size={17} /></button>}
    <HeaderMenu label="Settings and commands" title="Settings and commands" trigger={<Settings size={17} />} items={[
      ...props.commands,
      { key: 'enableAgent', label: 'Enable agent', checked: enabled, toggle: true, separated: true,
        onSelect: () => { onEnable(!enabled); setPanel(!enabled) } },
      { key: 'all', label: 'All menu commands…', hint: 'F10', separated: true, onSelect: popupCommands }
    ]} />
    {enabled && panel && createPortal(<aside className="agent-panel" aria-label="Agent panel">
      <header><strong>Agent</strong><button className="icon-button" aria-label="Hide agent panel" onClick={() => setPanel(false)}><X size={16} /></button></header>
      <label>Provider <select disabled={busy} value={provider} onChange={e => setProvider(e.target.value)}>
        {!provider && <option value="">Select provider</option>}
        {providers.map(p => <option key={p.name} disabled={!p.installed} value={p.name}>{p.name}{p.installed ? '' : ' (not installed)'}</option>)}
      </select></label>
      {!provider && <p>Install codex-acp, claude-agent-acp, or kiro-cli and reopen the integration.</p>}
      <label><input type="checkbox" disabled={busy || !note} checked={share} onChange={e => setShare(e.target.checked)} /> Include current note</label>
      <small>Inkwell asks before editing the shared note. The provider’s own tools use its permission settings.</small>
      <pre aria-label="Conversation">{transcript}</pre>
      <form onSubmit={e => { e.preventDefault(); void send() }}>
        <textarea aria-label="Message to agent" value={prompt} onChange={e => setPrompt(e.target.value)} />
        <button disabled={busy || !provider || !prompt.trim()}>Send</button>
        <button type="button" onClick={reset}>{busy ? 'Stop' : 'New session'}</button>
      </form>
    </aside>, document.body)}
    {proposal && createPortal(<dialog className="agent-review" aria-labelledby="review-title" ref={dialog} onCancel={e => { e.preventDefault(); review(false) }}>
      <h2 id="review-title">Review proposed edit</h2><p>{note?.path ?? note?.name}</p>
      <pre>{createTwoFilesPatch('Current note', 'Proposed note', proposal.base ?? '', proposal.change ?? '')}</pre>
      <button autoFocus onClick={() => review(false)}>Deny</button>
      <button disabled={proposal.base !== note?.content} onClick={() => review(true)}>Apply once</button>
    </dialog>, document.body)}
  </>
}
