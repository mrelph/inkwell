import { BrowserWindow, dialog, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { access, mkdtemp, rmdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import type { ClientConnection } from '@agentclientprotocol/sdk'

const providers = [
  { name: 'Codex', command: 'codex-acp', args: [] },
  { name: 'Claude Code', command: 'claude-agent-acp', args: [] },
  { name: 'Kiro', command: 'kiro-cli', args: ['acp'] }
]
const searchPath = [...new Set([...(process.env.PATH ?? '').split(path.delimiter), path.join(homedir(), '.local/bin')].filter(path.isAbsolute))]
async function executable(command: string) {
  for (const directory of searchPath) {
    const file = path.join(directory, command)
    try {
      await access(file, constants.X_OK)
      if ((await stat(file)).isFile()) return file
    } catch { /* Try the next PATH entry. */ }
  }
}

type Prompt = { provider: string; text: string; note?: { id: string; path?: string; name: string; content: string } }

export function registerAgent(window: BrowserWindow) {
  let enabled = false
  let generation = 0
  let terminate: (() => void) | undefined
  let session: { connection: ClientConnection; id: string; notePath?: string; key: string; embedded: boolean } | undefined
  let busy = false
  let sharedContent: string | undefined
  let sequence = 0
  const waiting = new Map<number, (reply?: string) => void>()
  function stop() {
    generation++
    terminate?.()
    terminate = undefined
    session = undefined
    busy = false
    for (const settle of waiting.values()) settle()
    waiting.clear()
  }
  function askBuffer(id: string, change?: string) {
    const request = ++sequence
    return new Promise<string>((resolve, reject) => {
      waiting.set(request, value => {
        waiting.delete(request)
        if (typeof value === 'string') resolve(value)
        else reject(new Error('Note unavailable, changed, or edit declined'))
      })
      window.webContents.send('agent:buffer', { request, id, change, base: sharedContent })
    })
  }
  const valid = (sender: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) =>
    sender.senderFrame === window.webContents.mainFrame && sender.sender === window.webContents
  const channels = ['agent:enable', 'agent:providers', 'agent:prompt', 'agent:stop', 'agent:reply']
  ipcMain.handle('agent:enable', (event, value) => {
    if (!valid(event)) return
    enabled = value === true
    if (!enabled) stop()
  })
  ipcMain.handle('agent:providers', async event => {
    if (!valid(event) || !enabled) return []
    return Promise.all(providers.map(async p => ({ name: p.name, installed: !!await executable(p.command) })))
  })
  ipcMain.handle('agent:stop', event => { if (valid(event)) stop() })
  ipcMain.handle('agent:reply', (event, request, reply) => {
    if (valid(event)) waiting.get(request)?.(reply)
  })
  ipcMain.handle('agent:prompt', async (event, input: Prompt) => {
    if (!valid(event) || !enabled || busy) throw new Error('Agent unavailable')
    const provider = providers.find(p => p.name === input.provider)
    if (!provider || !input.text.trim()) throw new Error('Choose a provider and enter a prompt')
    const key = JSON.stringify([provider.name, input.note?.id])
    if (session && session.key !== key) stop()
    const turn = generation
    busy = true
    const current = () => {
      if (generation !== turn || !enabled) throw new Error('Session stopped')
    }
    try {
      if (!session) {
        const program = await executable(provider.command)
        if (!program) throw new Error(provider.command + ' is not installed')
        current()
        const cwd = await mkdtemp(path.join(tmpdir(), 'inkwell-agent-'))
        if (turn !== generation) { await rmdir(cwd); current() }
        const notePath = input.note && (input.note.path ?? path.join(cwd, path.basename(input.note.name)))
        const child = spawn(program, provider.args, { cwd, stdio: ['pipe', 'pipe', 'ignore'] })
        const { ClientApp, ndJsonStream }: typeof import('./agentRuntime') = require('./agent-runtime.cjs')
        const client = new ClientApp()
        const checkFile = (file: string, id: string) => {
          current()
          if (session?.id !== id || file !== notePath || !input.note) throw new Error('Only the shared open note is available')
          return input.note.id
        }
        client.onRequest('fs/read_text_file', async ({ params }) => {
          const content = await askBuffer(checkFile(params.path, params.sessionId))
          sharedContent = content
          const start = Math.max(0, (params.line ?? 1) - 1)
          return { content: params.line || params.limit ? content.split('\n').slice(start, params.limit == null ? undefined : start + params.limit).join('\n') : content }
        })
        client.onRequest('fs/write_text_file', async ({ params }) => {
          sharedContent = await askBuffer(checkFile(params.path, params.sessionId), params.content)
          return {}
        })
        client.onRequest('session/request_permission', async ({ params }) => {
          current()
          if (session?.id !== params.sessionId) throw new Error('Unknown session')
          const { response } = await dialog.showMessageBox(window, {
            message: params.toolCall.title ?? 'Agent requests permission',
            buttons: ['Cancel', ...params.options.map(option => option.name)], defaultId: 0, cancelId: 0
          })
          current()
          return { outcome: response ? { outcome: 'selected', optionId: params.options[response - 1].optionId } : { outcome: 'cancelled' } }
        })
        client.onNotification('session/update', ({ params }) => {
          if (generation !== turn || params.sessionId !== session?.id) return
          const u = params.update
          if (u.sessionUpdate === 'agent_message_chunk' && u.content.type === 'text')
            window.webContents.send('agent:text', u.content.text)
        })
        const connection = client.connect(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>))
        terminate = () => {
          connection.close()
          child.stdin.end()
          child.kill()
          const timer = setTimeout(() => child.kill('SIGKILL'), 1500)
          timer.unref()
          child.once('close', () => clearTimeout(timer))
        }
        child.on('error', err => connection.close(err))
        child.once('close', () => {
          void rmdir(cwd).catch(() => {})
          if (turn === generation) stop()
        })
        const startup = { cancellationSignal: AbortSignal.timeout(20000), stopWaitingOnCancel: true }
        const info = await connection.agent.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: !!input.note, writeTextFile: !!input.note } } }, startup)
        if (info.protocolVersion !== 1) throw new Error('Unsupported ACP version')
        const opened = await connection.agent.request('session/new', { cwd, mcpServers: [] }, startup)
        current()
        session = { id: opened.sessionId, key, notePath, connection, embedded: !!info.agentCapabilities?.promptCapabilities?.embeddedContext }
      }
      sharedContent = input.note?.content
      const prompt: import('@agentclientprotocol/sdk').ContentBlock[] = [{ type: 'text', text: input.text }]
      if (input.note && session.notePath) {
        const resource = { uri: pathToFileURL(session.notePath).href, mimeType: 'text/markdown', text: input.note.content }
        prompt.push(session.embedded ? { type: 'resource', resource } : { type: 'text', text: session.notePath + '\n' + resource.text })
      }
      await session.connection.agent.request('session/prompt', { sessionId: session.id, prompt })
    } catch (error) {
      if (generation === turn) stop()
      throw error
    } finally {
      if (generation === turn) busy = false
    }
  })
  window.webContents.on('render-process-gone', stop)
  window.on('closed', () => {
    stop()
    channels.forEach(channel => ipcMain.removeHandler(channel))
  })
}
