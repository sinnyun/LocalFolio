import { open } from 'node:fs/promises'

const FILE_HEADER_BYTES = 26
const RESOURCE_HEADER_BYTES = 28
const MAX_PREVIEW_BYTES = 4 * 1024 * 1024
const MAX_PREVIEW_DIM = 1024
const MAX_RESOURCE_BLOCKS = 4096
const PHOTOSHOP_JPEG_RESOURCE = 1036

/** Read only the PSD/PSB image resource directory and the selected JPEG payload. */
export async function readPsdEmbeddedJpeg(filePath: string, signal?: AbortSignal): Promise<Buffer | null> {
  if (signal?.aborted) return null
  const file = await open(filePath, 'r')
  try {
    const { size } = await file.stat()
    const read = async (offset: number, length: number): Promise<Buffer | null> => {
      if (offset + length > size) return null
      const bytes = Buffer.alloc(length)
      let done = 0
      while (done < length && !signal?.aborted) {
        const chunk = await file.read(bytes, done, length - done, offset + done)
        if (chunk.bytesRead === 0) return null
        done += chunk.bytesRead
      }
      return done === length ? bytes : null
    }

    const header = await read(0, FILE_HEADER_BYTES + 4)
    if (!header || header.toString('ascii', 0, 4) !== '8BPS') return null
    const version = header.readUInt16BE(4)
    if (version !== 1 && version !== 2) return null

    // PSD and PSB both use 32-bit lengths for these first two sections.
    const resourceLengthOffset = FILE_HEADER_BYTES + 4 + header.readUInt32BE(FILE_HEADER_BYTES)
    const resourceLength = await read(resourceLengthOffset, 4)
    if (!resourceLength) return null
    let offset = resourceLengthOffset + 4
    const end = offset + resourceLength.readUInt32BE(0)
    if (end > size) return null

    for (let index = 0; index < MAX_RESOURCE_BLOCKS && offset + 12 <= end; index += 1) {
      const block = await read(offset, 7)
      if (!block || block.toString('ascii', 0, 4) !== '8BIM') return null
      const nameBytes = 1 + block[6]!
      const lengthOffset = offset + 6 + nameBytes + (nameBytes % 2)
      if (lengthOffset + 4 > end) return null
      const lengthBytes = await read(lengthOffset, 4)
      if (!lengthBytes) return null

      const length = lengthBytes.readUInt32BE(0)
      const start = lengthOffset + 4
      const next = start + length + (length % 2)
      if (next > end) return null
      offset = next
      if (block.readUInt16BE(4) !== PHOTOSHOP_JPEG_RESOURCE || length < RESOURCE_HEADER_BYTES) continue

      const preview = await read(start, RESOURCE_HEADER_BYTES)
      if (!preview) return null
      const width = preview.readUInt32BE(4)
      const height = preview.readUInt32BE(8)
      const jpegLength = preview.readUInt32BE(20)
      if (
        preview.readUInt32BE(0) !== 1 ||
        width < 1 || height < 1 || Math.max(width, height) > MAX_PREVIEW_DIM ||
        jpegLength < 4 || jpegLength > Math.min(MAX_PREVIEW_BYTES, length - RESOURCE_HEADER_BYTES)
      ) continue

      const jpeg = await read(start + RESOURCE_HEADER_BYTES, jpegLength)
      if (jpeg?.readUInt16BE(0) === 0xffd8 && jpeg.readUInt16BE(jpeg.length - 2) === 0xffd9) return jpeg
    }
    return null
  } finally {
    await file.close()
  }
}
