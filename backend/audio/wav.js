import { writeFile } from 'fs/promises'

// Lee un WAV PCM 16/24/32-bit o float 32-bit, mono o estéreo.
// Recorre los chunks en vez de asumir un header fijo de 44 bytes.
export function parseWAV(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('El archivo no es un WAV válido')
  }

  let offset = 12
  let fmt    = null
  let data   = null

  while (offset + 8 <= buffer.length) {
    const id   = buffer.toString('ascii', offset, offset + 4)
    let   size = buffer.readUInt32LE(offset + 4)
    const body = offset + 8

    if (id === 'data' && (size === 0 || body + size > buffer.length)) size = buffer.length - body

    if (id === 'fmt ') {
      let format = buffer.readUInt16LE(body)
      if (format === 0xFFFE && size >= 26) format = buffer.readUInt16LE(body + 24)
      fmt = {
        format,
        channels:   buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitDepth:   buffer.readUInt16LE(body + 14)
      }
    } else if (id === 'data') {
      data = { start: body, size }
      break
    }
    offset = body + size + (size % 2)
  }

  if (!fmt || !data) throw new Error('WAV sin chunks fmt/data')

  const { channels, sampleRate, bitDepth } = fmt
  const isFloat   = fmt.format === 3
  const bytes     = bitDepth / 8
  const frames    = Math.floor(data.size / (bytes * channels))
  const out       = Array.from({ length: channels }, () => new Float32Array(frames))

  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const p = data.start + (i * channels + c) * bytes
      let v
      if (isFloat)            v = buffer.readFloatLE(p)
      else if (bitDepth === 16) v = buffer.readInt16LE(p) / 32768
      else if (bitDepth === 24) v = buffer.readIntLE(p, 3) / 8388608
      else if (bitDepth === 32) v = buffer.readInt32LE(p) / 2147483648
      else throw new Error(`Profundidad de bits no soportada: ${bitDepth}`)
      out[c][i] = v
    }
  }

  return { channels: out, sampleRate }
}

export async function writeWAV(path, channels, sampleRate) {
  const nCh    = channels.length
  const frames = channels[0].length
  const buf    = Buffer.alloc(44 + frames * nCh * 2)

  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + frames * nCh * 2, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(nCh, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * nCh * 2, 28)
  buf.writeUInt16LE(nCh * 2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(frames * nCh * 2, 40)

  let p = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]))
      buf.writeInt16LE(Math.round(s * 32767), p)
      p += 2
    }
  }

  await writeFile(path, buf)
}
