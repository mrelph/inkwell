import { constants } from 'node:fs'
import { access, lstat, open, readlink, realpath, rename, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

async function destination(file: string, depth = 0): Promise<string> {
  try {
    return await realpath(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const entry = await lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
  if (!entry?.isSymbolicLink()) return file
  if (depth >= 40) throw new Error('Too many symbolic links')
  return destination(path.resolve(path.dirname(file), await readlink(file)), depth + 1)
}

export async function writeDocument(file: string, content: string) {
  const target = await destination(file)
  const previous = await stat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
  if (previous && !previous.isFile()) throw new Error('Expected a regular file')
  if (previous) await access(target, constants.W_OK)
  const temporary = path.join(path.dirname(target), '.inkwell-' + randomUUID())
  const handle = await open(temporary, 'wx', previous ? 0o600 : 0o666)
  try {
    try {
      await handle.writeFile(content, 'utf8')
      if (previous) await handle.chmod(previous.mode & 0o777)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, target)
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}
