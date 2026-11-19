import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MAX_BYTES = 32 * 1024 * 1024
const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/

// The launcher passes a cache specific to its system Electron major. Dev,
// AppImage and older launchers continue to use release notifications.
export async function stageRelease(version: string, cache: string, major: string, fetcher: typeof fetch) {
  if (!VERSION.test(version) || !/^\d+$/.test(major) || !path.isAbsolute(cache) ||
      path.basename(cache) !== 'electron' + major) return false
  const target = path.join(cache, version + '.asar')
  if (await stat(target).then(s => s.isFile() && s.size > 0, () => false)) return true
  const name = 'inkwell-' + version + '-electron' + major + '.asar'
  const api = 'https://api.github.com/repos/mrelph/inkwell/releases/tags/v' + version
  const metadata = await fetcher(api, { signal: AbortSignal.timeout(10000) })
  if (!metadata.ok) return false
  const release = await metadata.json()
  if (release.tag_name !== 'v' + version || release.draft || release.prerelease || !Array.isArray(release.assets)) return false
  const asset = release.assets.find((item: { name: string }) => item?.name === name)
  if (!asset || !/^sha256:[0-9a-f]{64}$/.test(asset.digest) ||
      !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_BYTES) return false
  const url = 'https://github.com/mrelph/inkwell/releases/download/v' + version + '/' + name
  const response = await fetcher(url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok || !response.body) return false
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = response.body.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > asset.size) { await reader.cancel(); return false }
    chunks.push(value)
  }
  const data = Buffer.concat(chunks)
  if (size !== asset.size || 'sha256:' + createHash('sha256').update(data).digest('hex') !== asset.digest) return false
  await mkdir(cache, { recursive: true, mode: 0o700 })
  const temporary = path.join(cache, randomUUID() + '.tmp')
  try {
    await writeFile(temporary, data, { flag: 'wx', mode: 0o600, flush: true })
    await rename(temporary, target)
    return true
  } finally {
    await rm(temporary, { force: true })
  }
}
