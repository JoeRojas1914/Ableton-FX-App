import ytDlpExec  from 'yt-dlp-exec'
import Ffmpeg     from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import { PassThrough } from 'stream'

Ffmpeg.setFfmpegPath(ffmpegPath)

export const SAMPLE_RATE = 44100

// Cuántos segundos bajamos de YouTube: un tramo amplio del centro de la canción,
// del que luego se elige la ventana más fuerte (normalmente el estribillo).
const YT_WINDOW = 120

async function getInfo(target) {
  const info = await ytDlpExec(target, {
    dumpSingleJson:      true,
    format:              'bestaudio/best',
    noPlaylist:          true,
    noWarnings:          true,
    noCheckCertificates: true
  })
  // Una búsqueda "ytsearch1:" devuelve una playlist con un solo resultado
  const entry = info.entries ? info.entries[0] : info
  if (!entry?.url) throw new Error('YouTube no devolvió un audio descargable')
  return entry
}

function headerString(headers = {}) {
  return Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n'
}

// Decodifica cualquier fuente (archivo local o URL) a WAV estéreo 16-bit 44.1 kHz en memoria
export function decodeToWAV(input, { start = 0, duration = null, headers = null } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const cmd    = Ffmpeg(input)

    if (headers) cmd.inputOptions(['-headers', headerString(headers)])
    if (start > 0) cmd.seekInput(start)
    if (duration)  cmd.duration(duration)

    cmd.audioChannels(2)
      .audioFrequency(SAMPLE_RATE)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('error', err => reject(new Error(`ffmpeg: ${err.message}`)))

    cmd.pipe(new PassThrough())
      .on('data',  chunk => chunks.push(chunk))
      .on('end',   ()    => resolve(Buffer.concat(chunks)))
      .on('error', err   => reject(err))
  })
}

async function downloadFromInfo(info) {
  const duration = info.duration || 0
  // Empezamos en ~30% de la canción para saltar la intro
  const start = duration > YT_WINDOW + 20 ? Math.floor(duration * 0.3) : 0
  const safeStart = Math.min(start, Math.max(0, duration - YT_WINDOW))
  console.log(`Descargando "${info.title}" (${Math.round(duration)} s) desde ${safeStart}s`)
  const wav = await decodeToWAV(info.url, {
    start:    safeStart,
    duration: YT_WINDOW,
    headers:  info.http_headers
  })
  return { wav, title: info.title }
}

export async function downloadBySearch(songName, artistName) {
  const query = `ytsearch1:${artistName ?? ''} ${songName} official audio`.trim()
  const info  = await getInfo(query)
  return downloadFromInfo(info)
}

export async function downloadByURL(youtubeUrl) {
  const info = await getInfo(youtubeUrl)
  return downloadFromInfo(info)
}
