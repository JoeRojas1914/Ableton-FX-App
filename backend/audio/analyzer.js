import { tmpdir }        from 'os'
import { join }          from 'path'
import { readFile, rm, mkdtemp } from 'fs/promises'
import { parseWAV, writeWAV }    from './wav.js'
import { downloadBySearch, downloadByURL, decodeToWAV } from './youtube.js'
import { separateStem, separationAvailable } from './separate.js'
import { getInstrument } from './instruments.js'
import {
  stft, bandFilter, loudness, envelopeDB,
  dB, ampDB, clamp, median, percentile
} from './dsp.js'

const ANALYSIS_SECONDS = 45     // ventana que se analiza (y que procesa Demucs)
const N   = 4096                // tamaño de FFT: ~10.8 Hz por bin a 44.1 kHz
const HOP = 512                 // ~11.6 ms entre frames

const STEM_LABELS = { drums: 'batería', bass: 'bajo', vocals: 'voz', other: 'instrumentos melódicos' }

// ─── Caché en memoria (evita re-descargar/re-separar al cambiar de instrumento) ──

const CACHE_TTL = 60 * 60 * 1000
const CACHE_MAX = 3
const songCache = new Map()   // songKey        → { channels, sr, tempo, key, mode, title, start }
const stemCache = new Map()   // songKey|stem   → channels

function cacheGet(map, key) {
  const hit = map.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL) { map.delete(key); return null }
  map.delete(key); map.set(key, hit)        // LRU: mover al final
  return hit.value
}

function cacheSet(map, key, value) {
  map.set(key, { value, at: Date.now() })
  while (map.size > CACHE_MAX) map.delete(map.keys().next().value)
}

// ─── Utilidades de señal ──────────────────────────────────────────────────

function toMono(channels) {
  if (channels.length === 1) return channels[0]
  const [l, r] = channels
  const m = new Float32Array(l.length)
  for (let i = 0; i < l.length; i++) m[i] = (l[i] + r[i]) * 0.5
  return m
}

// Elige la ventana de `seconds` con más energía (normalmente el estribillo)
function loudestWindow(channels, sr, seconds) {
  const total = channels[0].length
  const len   = Math.min(total, Math.round(seconds * sr))
  if (len === total) return { channels, start: 0 }

  const mono  = toMono(channels)
  const block = sr
  const nBlk  = Math.floor(total / block)
  const e     = new Float64Array(nBlk)
  for (let b = 0; b < nBlk; b++) {
    let s = 0
    for (let i = b * block; i < (b + 1) * block; i++) s += mono[i] * mono[i]
    e[b] = s
  }

  const win = Math.floor(len / block)
  let best = 0, bestSum = -1, sum = 0
  for (let b = 0; b < nBlk; b++) {
    sum += e[b]
    if (b >= win) sum -= e[b - win]
    if (b >= win - 1 && sum > bestSum) { bestSum = sum; best = b - win + 1 }
  }

  const start = best * block
  return { channels: channels.map(ch => ch.slice(start, start + len)), start: start / sr }
}

// Spectral flux en log-magnitud (para tempo y detección de golpes)
function spectralFlux(mono, onFrame) {
  const prev = new Float64Array(N / 2 + 1)
  const flux = []
  stft(mono, N, HOP, (power, f) => {
    let s = 0
    for (let k = 1; k <= N / 2; k++) {
      const v = Math.log1p(100 * Math.sqrt(power[k]))
      if (f > 0 && v > prev[k]) s += v - prev[k]
      prev[k] = v
    }
    flux.push(s)
    onFrame?.(power, f)
  })
  return Float32Array.from(flux)
}

// Picos de una curva de novedad (estilo librosa.peak_pick)
function pickPeaks(curve, { preMax = 3, postMax = 3, preAvg = 10, postAvg = 10, delta = 0.07, wait = 5 } = {}) {
  const top = percentile(Array.from(curve), 99) || 1
  const x   = curve.map(v => v / top)
  const peaks = []
  for (let i = 0; i < x.length; i++) {
    let isMax = true
    for (let j = Math.max(0, i - preMax); j <= Math.min(x.length - 1, i + postMax); j++) {
      if (x[j] > x[i]) { isMax = false; break }
    }
    if (!isMax) continue
    let avg = 0, cnt = 0
    for (let j = Math.max(0, i - preAvg); j <= Math.min(x.length - 1, i + postAvg); j++) { avg += x[j]; cnt++ }
    if (x[i] < avg / cnt + delta) continue
    if (peaks.length && i - peaks.at(-1) < wait) continue
    peaks.push(i)
  }
  return peaks
}

// ─── Tempo y tonalidad (sobre la mezcla completa) ─────────────────────────

function detectTempo(flux, sr) {
  const fps = sr / HOP
  // quitar tendencia (media local de ~0.5 s) y rectificar
  const w = Math.round(fps / 2)
  const x = new Float64Array(flux.length)
  for (let i = 0; i < flux.length; i++) {
    let s = 0, c = 0
    for (let j = Math.max(0, i - w); j <= Math.min(flux.length - 1, i + w); j++) { s += flux[j]; c++ }
    x[i] = Math.max(0, flux[i] - s / c)
  }

  const maxLag = Math.ceil((60 * fps) / 50) * 2
  const ac = new Float64Array(maxLag + 2)
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    let s = 0
    for (let i = lag; i < x.length; i++) s += x[i] * x[i - lag]
    ac[lag] = s
  }

  const minLag = Math.floor((60 * fps) / 200)
  const topLag = Math.ceil((60 * fps) / 60)
  let bestLag = 0, bestScore = -Infinity
  for (let lag = minLag; lag <= topLag; lag++) {
    const bpm    = (60 * fps) / lag
    const prior  = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2)
    const score  = prior * (ac[lag] + 0.5 * (ac[2 * lag] ?? 0))
    if (score > bestScore) { bestScore = score; bestLag = lag }
  }
  if (!bestLag) return { tempo: 120, tempoAlt: null }

  // interpolación parabólica para afinar el lag
  const a = ac[bestLag - 1], b = ac[bestLag], c = ac[bestLag + 1]
  const shift = (a - 2 * b + c) !== 0 ? 0.5 * (a - c) / (a - 2 * b + c) : 0
  const tempo = (60 * fps) / (bestLag + clamp(shift, -0.5, 0.5))

  // Medio tempo vs. doble tempo es ambiguo por naturaleza: si la alternativa también
  // tiene buena periodicidad y cae en un rango musical, se reporta
  let tempoAlt = null
  const halfLag = Math.round(bestLag / 2)
  if (tempo < 100 && tempo * 2 <= 200 && ac[halfLag] > 0.5 * ac[bestLag]) tempoAlt = tempo * 2
  else if (tempo > 140 && tempo / 2 >= 60 && (ac[bestLag * 2] ?? 0) > 0.5 * ac[bestLag]) tempoAlt = tempo / 2

  return { tempo, tempoAlt }
}

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

function correlation(a, b) {
  const n = a.length
  const ma = a.reduce((s, x) => s + x, 0) / n
  const mb = b.reduce((s, x) => s + x, 0) / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da  += (a[i] - ma) ** 2
    db  += (b[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

function detectKey(chroma) {
  let best = -Infinity, key = 0, mode = 1
  for (let k = 0; k < 12; k++) {
    const rot = [...chroma.slice(k), ...chroma.slice(0, k)]
    const cm = correlation(rot, MAJOR)
    const cn = correlation(rot, MINOR)
    if (cm > best) { best = cm; key = k; mode = 1 }
    if (cn > best) { best = cn; key = k; mode = 0 }
  }
  return { key, mode }
}

// Chroma a partir de picos espectrales (FFT de 8192 para resolver semitonos en graves),
// normalizado por frame para que los frames fuertes no dominen el promedio
function chromaOf(mono, sr) {
  const n      = 8192
  const binHz  = sr / n
  const kLo    = Math.ceil(100 / binHz)
  const kHi    = Math.floor(5000 / binHz)
  const chroma = new Array(12).fill(0)
  const frame  = new Float64Array(12)

  stft(mono, n, 2048, p => {
    frame.fill(0)
    for (let k = kLo; k <= kHi; k++) {
      if (!(p[k] > p[k - 1] && p[k] > p[k + 1])) continue
      // interpolación parabólica de la frecuencia real del pico
      const a = Math.log(p[k - 1] + 1e-12), b = Math.log(p[k] + 1e-12), c = Math.log(p[k + 1] + 1e-12)
      const den = a - 2 * b + c
      const fp  = (k + (den ? (0.5 * (a - c)) / den : 0)) * binHz
      const pc  = ((Math.round(69 + 12 * Math.log2(fp / 440)) % 12) + 12) % 12
      frame[pc] += Math.sqrt(p[k])
    }
    const max = Math.max(...frame)
    if (max > 0) for (let i = 0; i < 12; i++) chroma[i] += frame[i] / max
  })
  return chroma
}

function analyzeMix(channels, sr) {
  const mono = toMono(channels)
  const flux = spectralFlux(mono)
  return { ...detectTempo(flux, sr), ...detectKey(chromaOf(mono, sr)) }
}

// ─── Mediciones del instrumento ───────────────────────────────────────────

// Espectro promedio (potencia por bin) de los frames seleccionados
function averageSpectrum(mono, frameFilter) {
  const sum = new Float64Array(N / 2 + 1)
  let used = 0
  stft(mono, N, HOP, (power, f) => {
    if (!frameFilter(f)) return
    for (let k = 0; k <= N / 2; k++) sum[k] += power[k]
    used++
  })
  if (used) for (let k = 0; k <= N / 2; k++) sum[k] /= used
  return { power: sum, frames: used }
}

// Agrupa el espectro en bandas de 1/6 de octava (20 Hz – 20 kHz) normalizadas a 0 dB
function sixthOctaveBands(power, sr) {
  const binHz = sr / N
  const freqs = [], db = []
  for (let i = -26; i <= 26; i++) {
    const fc = 1000 * 2 ** (i / 6)
    if (fc >= sr / 2) break
    const lo = Math.ceil((fc * 2 ** (-1 / 12)) / binHz)
    const hi = Math.floor((fc * 2 ** (1 / 12)) / binHz)
    let s = 0, c = 0
    for (let k = Math.max(1, lo); k <= hi; k++) { s += power[k]; c++ }
    if (!c) { s = power[Math.max(1, Math.round(fc / binHz))]; c = 1 }
    freqs.push(fc)
    db.push(dB(s / c))
  }
  const max = Math.max(...db)
  return { freqs, db: db.map(v => v - max) }
}

// Dónde empieza y termina el contenido: primera banda a menos de -24 dB del máximo
// (graves) y última a menos de -45 dB (agudos, que siempre tienen menos nivel)
function spectrumEdges({ freqs, db }) {
  let lo = freqs[0], hi = freqs.at(-1)
  for (let i = 0; i < freqs.length; i++) if (db[i] > -24) { lo = freqs[i]; break }
  for (let i = freqs.length - 1; i >= 0; i--) if (db[i] > -45) { hi = freqs[i]; break }
  return { lo, hi }
}

// Mide cada golpe en la envolvente (1 ms): ataque, decay, pendiente de la cola, relación cola/directo
// env: envolvente del instrumento filtrado (decay/cola); envFull: sin filtrar (ataque,
// porque un paso bajo ralentiza artificialmente la subida del golpe)
function measureHits(env, envFull, onsetsMs) {
  const rise = [], decay = [], rt60 = [], tail = []
  const all   = Array.from(env)
  const floor = percentile(all, 99) - 40
  const noise = percentile(all, 5)        // piso de ruido: la cola debe medirse por encima

  for (let h = 0; h < onsetsMs.length; h++) {
    const center = onsetsMs[h]
    let ip = -1, ep = -Infinity
    for (let i = Math.max(0, center - 50); i < Math.min(env.length, center + 50); i++) {
      if (env[i] > ep) { ep = env[i]; ip = i }
    }
    if (ip < 0 || ep < floor) continue

    // Ataque: tiempo desde -20 dB hasta el pico, en la señal sin filtrar
    let fp = -1, fe = -Infinity
    for (let i = Math.max(0, ip - 30); i < Math.min(envFull.length, ip + 30); i++) {
      if (envFull[i] > fe) { fe = envFull[i]; fp = i }
    }
    for (let i = fp; i >= Math.max(0, fp - 80); i--) {
      if (envFull[i] < fe - 20) { rise.push(fp - i); break }
    }

    const next  = h + 1 < onsetsMs.length ? onsetsMs[h + 1] - 40 : env.length
    const limit = Math.min(env.length, next, ip + 2500)
    // La caída temprana (0 a -15 dB) es el propio sonido; la tardía (-15 a -35 dB) es sobre todo la sala/reverb
    let j10 = null, j15 = null, j35 = null
    for (let j = ip; j < limit; j++) {
      if (j10 === null && env[j] < ep - 10) j10 = j
      if (j15 === null && env[j] < ep - 15) j15 = j
      if (j35 === null && env[j] < ep - 35) { j35 = j; break }
    }
    if (j10 !== null) decay.push(j10 - ip)
    if (j15 !== null && j35 !== null && j35 > j15 && ep - 35 > noise) rt60.push((60 * (j35 - j15)) / 20 / 1000)

    // Cola/directo solo si la nota se apaga rápido; en notas sostenidas mediría la nota, no la sala
    if (limit > ip + 420 && j10 !== null && j10 - ip < 80) {
      let d = 0, t = 0
      for (let i = Math.max(0, ip - 5); i < ip + 50; i++) d += 10 ** (env[i] / 10)
      for (let i = ip + 80; i < ip + 400; i++)            t += 10 ** (env[i] / 10)
      tail.push(dB(t / 320) - dB(d / 55))
    }
  }

  return {
    hits:     onsetsMs.length,
    riseMs:   median(rise),
    decayMs:  median(decay),
    rt60:     rt60.length >= 3 ? median(rt60) : null,
    tailDb:   tail.length >= 3 ? median(tail) : null
  }
}

function dynamicsOf(mono, sr) {
  const block = Math.round(0.4 * sr)
  const rms = [], peaks = []
  for (let s = 0; s + block <= mono.length; s += block) {
    let sum = 0, pk = 0
    for (let i = s; i < s + block; i++) {
      sum += mono[i] * mono[i]
      const a = Math.abs(mono[i]); if (a > pk) pk = a
    }
    rms.push(sum / block); peaks.push(pk)
  }
  const loudest = Math.max(...rms)
  const active  = rms.map((r, i) => [r, peaks[i]]).filter(([r]) => dB(r) > dB(loudest) - 30)
  const rmsDb   = dB(active.reduce((a, [r]) => a + r, 0) / active.length)
  const peakDb  = ampDB(percentile(active.map(([, p]) => p), 95))
  return { rmsDb, peakDb, crest: peakDb - rmsDb }
}

function stereoOf(channels, sr) {
  if (channels.length < 2) return { side: 0, correlation: 1, lowSide: 0 }
  const [l, r] = channels
  let mm = 0, ss = 0, lr = 0, ll = 0, rr = 0
  for (let i = 0; i < l.length; i++) {
    const m = (l[i] + r[i]) / 2, s = (l[i] - r[i]) / 2
    mm += m * m; ss += s * s; lr += l[i] * r[i]; ll += l[i] * l[i]; rr += r[i] * r[i]
  }
  const lowL = bandFilter(l, sr, { lp: 150 }), lowR = bandFilter(r, sr, { lp: 150 })
  let lm = 0, ls = 0
  for (let i = 0; i < l.length; i++) {
    const m = (lowL[i] + lowR[i]) / 2, s = (lowL[i] - lowR[i]) / 2
    lm += m * m; ls += s * s
  }
  return {
    side:        mm ? Math.sqrt(ss / mm) : 0,
    correlation: ll && rr ? lr / Math.sqrt(ll * rr) : 1,
    lowSide:     lm ? Math.sqrt(ls / lm) : 0
  }
}

function analyzeTarget(channels, sr, inst) {
  const mono  = toMono(channels)
  const focus = bandFilter(mono, sr, inst.band)   // aísla kick/snare/hats dentro del stem de batería

  // Golpes / notas del instrumento
  const flux   = spectralFlux(focus)
  const onsets = pickPeaks(flux)
  const frameCenterMs = f => Math.round(((f * HOP + N / 2) / sr) * 1000)
  const onsetsMs = onsets.map(frameCenterMs)

  // Qué frames entran en el espectro promedio
  let frameFilter
  if (inst.percussive && onsets.length >= 4) {
    const span = Math.ceil((0.15 * sr) / HOP)
    const sel  = new Set()
    for (const o of onsets) for (let f = o; f <= o + span; f++) sel.add(f)
    frameFilter = f => sel.has(f)
  } else {
    const energies = []
    stft(mono, N, HOP, power => {
      let s = 0; for (let k = 1; k < power.length; k++) s += power[k]
      energies.push(s)
    })
    const thr = dB(Math.max(...energies)) - 35
    frameFilter = f => dB(energies[f]) > thr
  }

  const { power, frames } = averageSpectrum(mono, frameFilter)
  const spectrum = sixthOctaveBands(power, sr)
  const edges    = spectrumEdges(spectrum)

  const env  = envelopeDB(focus, sr)
  const hits = measureHits(env, focus === mono ? env : envelopeDB(mono, sr), onsetsMs)

  return {
    spectrum,
    edges,
    spectrumFrames: frames,
    dynamics: dynamicsOf(focus, sr),
    loudness: loudness(channels, sr),
    hits,
    stereo:   stereoOf(channels, sr)
  }
}

// ─── Punto de entrada ─────────────────────────────────────────────────────

async function loadSong(source) {
  if (source.type === 'file') {
    const wav = await decodeToWAV(source.path)
    return { wav, title: source.name }
  }
  if (source.type === 'url') return downloadByURL(source.url)
  return downloadBySearch(source.song, source.artist)
}

async function getStem(songKey, window, stem, notes) {
  const cached = cacheGet(stemCache, `${songKey}|${stem}`)
  if (cached) return cached

  const dir = await mkdtemp(join(tmpdir(), 'abletonfx-'))
  try {
    const inPath  = join(dir, 'mix.wav')
    const outPath = join(dir, `${stem}.wav`)
    await writeWAV(inPath, window.channels, window.sr)
    console.log(`Separando stem "${stem}" con Demucs...`)
    const t0 = Date.now()
    await separateStem(inPath, stem, outPath)
    console.log(`Stem listo en ${((Date.now() - t0) / 1000).toFixed(1)} s`)
    const { channels } = parseWAV(await readFile(outPath))
    cacheSet(stemCache, `${songKey}|${stem}`, channels)
    return channels
  } catch (err) {
    console.error('Separación falló:', err.message)
    notes.push(`No se pudo aislar el instrumento (${err.message}); se analizó la mezcla completa.`)
    return null
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// source: { type: 'search', song, artist } | { type: 'url', url } | { type: 'file', path, name }
export async function analyze(source, instrumentId, songKey = null) {
  const inst  = getInstrument(instrumentId)
  const notes = []

  let window = songKey && cacheGet(songCache, songKey)
  if (window) {
    console.log('Caché hit:', songKey)
  } else {
    const { wav, title } = await loadSong(source)
    const parsed = parseWAV(wav)
    let channels = parsed.channels
    if (channels.length === 1) channels = [channels[0], channels[0]]
    if (channels[0].length < parsed.sampleRate * 5) throw new Error('El audio es demasiado corto (mínimo 5 s)')

    const picked = loudestWindow(channels, parsed.sampleRate, ANALYSIS_SECONDS)
    const mix    = analyzeMix(picked.channels, parsed.sampleRate)
    window = { channels: picked.channels, sr: parsed.sampleRate, start: picked.start, title, ...mix }
    if (songKey) cacheSet(songCache, songKey, window)
  }

  let target    = window.channels
  let separated = false
  if (inst.stem) {
    if (separationAvailable()) {
      const stem = await getStem(songKey ?? `tmp-${Date.now()}`, window, inst.stem, notes)
      if (stem) { target = stem; separated = true }
    } else {
      notes.push('Demucs no está instalado: se analizó la mezcla completa, los resultados serán menos precisos.')
    }
  }

  const measured = analyzeTarget(target, window.sr, inst)
  const what = separated ? `Stem aislado (${STEM_LABELS[inst.stem]})` : 'Mezcla completa'

  console.log(
    `Análisis listo — ${what} | BPM ${window.tempo.toFixed(1)} | ` +
    `${measured.loudness.integrated.toFixed(1)} LUFS | crest ${measured.dynamics.crest.toFixed(1)} dB | ` +
    `golpes ${measured.hits.hits}`
  )

  return {
    title:     window.title,
    tempo:     window.tempo,
    tempoAlt:  window.tempoAlt,
    key:       window.key,
    mode:      window.mode,
    segment:   { start: window.start, seconds: window.channels[0].length / window.sr },
    analyzed:  what,
    separated,
    notes,
    ...measured
  }
}
