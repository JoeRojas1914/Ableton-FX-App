import Meyda from 'meyda'
import { findYouTubeUrl, downloadAudioAsWAV } from './youtube.js'

function parseWAV(buffer) {
  const sampleRate = buffer.readUInt32LE(24)
  const bitDepth   = buffer.readUInt16LE(34)
  const dataStart  = 44
  const numSamples = (buffer.length - dataStart) / (bitDepth / 8)
  const samples    = new Float32Array(numSamples)

  for (let i = 0; i < numSamples; i++) {
    samples[i] = bitDepth === 16
      ? buffer.readInt16LE(dataStart + i * 2) / 32768.0
      : buffer.readFloatLE(dataStart + i * 4)
  }

  return { samples, sampleRate }
}

function detectBPM(samples, sampleRate) {
  const frameSize = 512
  const energies  = []

  for (let i = 0; i < samples.length - frameSize; i += frameSize) {
    let e = 0
    for (let j = 0; j < frameSize; j++) e += samples[i + j] ** 2
    energies.push(e / frameSize)
  }

  const mean  = energies.reduce((a, b) => a + b) / energies.length
  const peaks = []

  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > mean * 1.5 &&
        energies[i] > energies[i - 1] &&
        energies[i] > energies[i + 1] &&
        (peaks.length === 0 || i - peaks.at(-1) > 5)) {
      peaks.push(i)
    }
  }

  if (peaks.length < 4) return 120

  const intervals = []
  for (let i = 1; i < Math.min(peaks.length, 20); i++) {
    intervals.push(peaks[i] - peaks[i - 1])
  }

  const avg = intervals.reduce((a, b) => a + b) / intervals.length
  return Math.max(60, Math.min(200, Math.round(60 / ((avg * frameSize) / sampleRate))))
}

function detectKey(chromaFrames) {
  const avg = new Array(12).fill(0)
  for (const f of chromaFrames) {
    for (let i = 0; i < 12; i++) avg[i] += f[i]
  }
  for (let i = 0; i < 12; i++) avg[i] /= chromaFrames.length

  const major = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]
  const minor = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]

  const corr = (a, b) => {
    const n  = a.length
    const ma = a.reduce((s, x) => s + x) / n
    const mb = b.reduce((s, x) => s + x) / n
    let num = 0, da = 0, db = 0
    for (let i = 0; i < n; i++) {
      num += (a[i] - ma) * (b[i] - mb)
      da  += (a[i] - ma) ** 2
      db  += (b[i] - mb) ** 2
    }
    return (da && db) ? num / Math.sqrt(da * db) : 0
  }

  let best = -Infinity, bestKey = 0, bestMode = 1

  for (let k = 0; k < 12; k++) {
    const rot = [...avg.slice(k), ...avg.slice(0, k)]
    const cm  = corr(rot, major)
    const cn  = corr(rot, minor)
    if (cm > best) { best = cm; bestKey = k; bestMode = 1 }
    if (cn > best) { best = cn; bestKey = k; bestMode = 0 }
  }

  return { key: bestKey, mode: bestMode }
}

async function analyzeWAV(wavBuffer, source) {
  const { samples, sampleRate } = parseWAV(wavBuffer)

  const frameSize    = 2048
  const hopSize      = 1024
  const rmsValues    = []
  const chromaFrames = []
  let   totalEnergy  = 0
  let   frameCount   = 0

  for (let i = 0; i < samples.length - frameSize; i += hopSize) {
    const frame = samples.slice(i, i + frameSize)
    const f     = Meyda.extract(['rms', 'energy', 'chroma'], frame)

    if (f && !isNaN(f.rms)) {
      rmsValues.push(f.rms)
      totalEnergy += f.energy || 0
      if (f.chroma) chromaFrames.push(Array.from(f.chroma))
      frameCount++
    }
  }

  if (frameCount === 0) throw new Error('No se pudo leer el audio')

  const avgRMS   = rmsValues.reduce((a, b) => a + b) / rmsValues.length
  const energy   = Math.min(1, totalEnergy / frameCount)
  const loudness = Math.max(-60, Math.min(-1, 20 * Math.log10(avgRMS + 0.00001) * 1.8))
  const bpm      = detectBPM(samples, sampleRate)
  const { key, mode } = chromaFrames.length > 10
    ? detectKey(chromaFrames)
    : { key: 0, mode: 1 }

  console.log(`Análisis listo — BPM: ${bpm} | Key: ${key}${mode ? 'M' : 'm'} | Energy: ${energy.toFixed(2)} | Fuente: ${source}`)

  return {
    tempo:        bpm,
    energy,
    loudness,
    key,
    mode,
    danceability: Math.min(1, energy * 0.85 + (bpm > 100 && bpm < 150 ? 0.15 : 0)),
    valence:      mode === 1 ? 0.60 : 0.42,
    acousticness: Math.max(0, 0.9 - energy),
    source
  }
}

export async function analyzeFromSearch(songName, artistName) {
  const url = await findYouTubeUrl(songName, artistName)
  const wav = await downloadAudioAsWAV(url)
  return analyzeWAV(wav, 'youtube-búsqueda')
}

export async function analyzeFromURL(youtubeUrl) {
  const wav = await downloadAudioAsWAV(youtubeUrl)
  return analyzeWAV(wav, 'youtube-directo')
}