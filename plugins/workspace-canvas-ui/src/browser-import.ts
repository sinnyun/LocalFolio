import { rpcCall } from '@folio/base-contract/rpc'
import { bytesToBase64 } from './lod.js'
import type { LinkedImageInspectResult } from './types.js'

/**
 * The shared RPC body limit is 2 MB, so browser drops are streamed as base64
 * chunks of at most 1 MiB. The host writes them into its managed imports folder
 * and answers with the absolute path that becomes a normal canvas image link.
 */
const MAX_CHUNK_BYTES = 1024 * 1024
const MIN_CHUNK_BYTES = 64 * 1024
const FALLBACK_CHUNK_BYTES = 256 * 1024

interface ImportBeginResult {
  readonly importId: string
  readonly chunkBytes: number
  readonly maxBytes: number
}

function resolveChunkBytes(chunkBytes: unknown): number {
  const requested =
    typeof chunkBytes === 'number' && Number.isFinite(chunkBytes) && chunkBytes > 0
      ? chunkBytes
      : FALLBACK_CHUNK_BYTES
  return Math.max(MIN_CHUNK_BYTES, Math.min(Math.trunc(requested), MAX_CHUNK_BYTES))
}

export async function importFileViaHost(file: File): Promise<LinkedImageInspectResult> {
  if (file.size === 0) {
    throw new Error('图片文件内容为空，无法导入')
  }

  const begin = await rpcCall<ImportBeginResult>('canvas.links.importBegin', {
    fileName: file.name || '粘贴图片',
    mime: file.type || undefined,
    size: file.size,
  })

  const chunkBytes = resolveChunkBytes(begin.chunkBytes)
  let finished = false
  try {
    for (let offset = 0; offset < file.size; offset += chunkBytes) {
      const end = Math.min(file.size, offset + chunkBytes)
      const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer())
      await rpcCall<{ readonly receivedBytes: number }>('canvas.links.importChunk', {
        importId: begin.importId,
        data: bytesToBase64(bytes),
      })
    }

    const result = await rpcCall<{ readonly item: LinkedImageInspectResult }>(
      'canvas.links.importFinish',
      { importId: begin.importId },
    )
    finished = true
    return result.item
  } finally {
    if (!finished) {
      try {
        await rpcCall('canvas.links.importAbort', { importId: begin.importId })
      } catch {
        // Best-effort cleanup; the host expires abandoned sessions by itself.
      }
    }
  }
}
