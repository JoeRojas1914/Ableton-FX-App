import { getInstrument } from './instruments.js'
import { tieneEfecto }   from './licencias.js'
import { clamp }         from './dsp.js'

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const r     = n => Math.round(n)
const r1    = n => Math.round(n * 10) / 10
const half  = n => Math.round(n * 2) / 2
const sign  = n => (n >= 0 ? `+${r1(n)}` : `${r1(n)}`)
const hz    = f => (f >= 1000 ? `${r1(f / 1000)} kHz` : `${r(f)} Hz`)

// ─── EQ ───────────────────────────────────────────────────────────────────

function linearFit(xs, ys) {
  const n  = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2 }
  const slope = den ? num / den : 0
  return { slope, intercept: my - slope * mx }
}

function buildEQ(features, inst) {
  const { freqs, db } = features.spectrum
  const { lo, hi }    = features.edges
  // Solo la "banda útil": dentro del rango del instrumento y lejos de los cortes reales,
  // para que la pendiente y las resonancias no se distorsionen por las caídas de los extremos
  const fLo = Math.max(inst.range[0], lo * 1.4)
  const fHi = Math.min(inst.range[1], hi / 1.4)
  const idx = freqs.map((f, i) => i).filter(i => freqs[i] >= fLo && freqs[i] <= fHi && db[i] > -60)
  const bands = []
  const why   = []

  if (idx.length < 6) {
    return { bands: [], why: ['No hubo suficiente señal del instrumento para medir su ecualización.'], tilt: 0 }
  }

  // Suavizado a ~1/2 octava y recta de tendencia (dB vs octavas)
  const smooth = db.map((_, i) => {
    let s = 0, c = 0
    for (let j = i - 1; j <= i + 1; j++) if (db[j] !== undefined) { s += db[j]; c++ }
    return s / c
  })
  const oct = freqs.map(f => Math.log2(f / 1000))
  const fit = linearFit(idx.map(i => oct[i]), idx.map(i => smooth[i]))
  const tiltDiff = fit.slope - inst.refTilt

  // Filtros de corte según dónde está realmente la energía
  const lowCut  = lo * 0.8 >= 30 ? lo * 0.8 : null
  const highCut = hi < 14000 && inst !== getInstrument('hihat') ? Math.min(20000, hi * 1.15) : null
  if (lowCut) {
    bands.push({ type: 'Low Cut 48', freq: lowCut })
    why.push(`Casi no hay energía por debajo de ${hz(lo)}: el corte limpia graves que la referencia no tiene.`)
  }
  if (highCut) {
    bands.push({ type: 'High Cut 12', freq: highCut })
    why.push(`El instrumento casi no tiene contenido por encima de ${hz(hi)} (sonido oscuro).`)
  }

  // Resonancias y huecos: desviaciones de la tendencia
  const resid = idx.map(i => ({ i, f: freqs[i], v: smooth[i] - (fit.slope * oct[i] + fit.intercept) }))
  const peaks = resid.filter((p, k) => {
    const a = resid[k - 1]?.v ?? -Infinity, b = resid[k + 1]?.v ?? -Infinity
    const c = resid[k - 1]?.v ??  Infinity, d = resid[k + 1]?.v ??  Infinity
    return (p.v > 2.5 && p.v >= a && p.v >= b) || (p.v < -2.5 && p.v <= c && p.v <= d)
  })
  peaks.sort((a, b) => Math.abs(b.v) - Math.abs(a.v))

  const chosen = []
  for (const p of peaks) {
    if (chosen.length >= 3) break
    if (p.v < 0 && chosen.filter(c => c.v < 0).length >= 1) continue
    if (chosen.some(c => Math.abs(Math.log2(c.f / p.f)) < 0.66)) continue
    // ancho del pico: hasta dónde el residuo cae a la mitad
    const k0 = resid.indexOf(p)
    let kl = k0, kr = k0
    while (kl > 0 && Math.abs(resid[kl - 1].v) > Math.abs(p.v) / 2 && Math.sign(resid[kl - 1].v) === Math.sign(p.v)) kl--
    while (kr < resid.length - 1 && Math.abs(resid[kr + 1].v) > Math.abs(p.v) / 2 && Math.sign(resid[kr + 1].v) === Math.sign(p.v)) kr++
    const bw = Math.max(1 / 3, Math.log2(resid[kr].f / resid[kl].f) + 1 / 6)
    const q  = clamp(Math.sqrt(2 ** bw) / (2 ** bw - 1), 0.5, 4)
    chosen.push({ ...p, q })
  }
  for (const c of chosen.sort((a, b) => a.f - b.f)) {
    const gain = clamp(half(c.v * 0.6), -6, 6)
    bands.push({ type: 'Bell', freq: c.f, gain, q: c.q })
    why.push(c.v > 0
      ? `La referencia tiene un realce en ${hz(c.f)} (${sign(c.v)} dB sobre su tendencia).`
      : `La referencia tiene un hueco en ${hz(c.f)} (${sign(c.v)} dB bajo su tendencia).`)
  }

  // Inclinación general (brillo) contra una referencia neutra del instrumento
  if (Math.abs(tiltDiff) >= 1) {
    const g = clamp(half(tiltDiff * 1.5), -6, 6)
    // un shelf por debajo del Low Cut (o por encima del High Cut) no haría nada
    if (!lowCut  || inst.shelf[0] > lowCut * 1.5)  bands.push({ type: 'Low Shelf',  freq: inst.shelf[0], gain: -g / 2 })
    if (!highCut || inst.shelf[1] < highCut / 1.5) bands.push({ type: 'High Shelf', freq: inst.shelf[1], gain:  g / 2 })
    why.push(tiltDiff > 0
      ? `Suena más brillante que un ${inst.label.toLowerCase()} típico (pendiente ${r1(fit.slope)} dB/oct).`
      : `Suena más oscuro/cálido que un ${inst.label.toLowerCase()} típico (pendiente ${r1(fit.slope)} dB/oct).`)
  }

  return { bands, why, tilt: tiltDiff }
}

function eqDevice(eq) {
  const order = { 'Low Cut 48': 0, 'Low Shelf': 1, Bell: 2, 'High Shelf': 3, 'High Cut 12': 4 }
  const sorted = [...eq.bands].sort((a, b) => order[a.type] - order[b.type] || a.freq - b.freq)
  return {
    name:    'EQ Eight',
    purpose: 'imitar el balance tonal del instrumento en la canción',
    params:  sorted.length
      ? sorted.map((b, i) => ({
          key: `${b.type} (banda ${i + 1})`,
          val: b.type === 'Bell'
            ? `${hz(b.freq)}  ${sign(b.gain)} dB  Q ${r1(b.q)}`
            : b.gain !== undefined ? `${hz(b.freq)}  ${sign(b.gain)} dB` : hz(b.freq)
        }))
      : [{ key: 'Ajuste', val: 'Plano: el balance ya es neutro' }],
    why: [...eq.why, 'Punto de partida: compara A/B con la canción y ajusta a oído, porque tu sonido de origen también influye.']
  }
}

// ─── Dinámica ─────────────────────────────────────────────────────────────

function buildCompressor(features, inst, bpm) {
  const { crest } = features.dynamics
  const { riseMs, decayMs } = features.hits
  const amount = clamp(inst.crestRef - crest, 0, 14)   // dB de dinámica "perdida" respecto a natural

  const ratio = amount < 1.5 ? 1.5 : amount < 3 ? 2 : amount < 5 ? 3 : amount < 8 ? 4 : amount < 11 ? 6 : 8
  const gr    = clamp(r(amount * 0.6), 1, 10)

  let attack, attackWhy
  if (inst.percussive && riseMs !== null && riseMs <= 8) {
    attack = clamp(r(10 + amount), 10, 30)
    attackWhy = `Los golpes tienen ataque rápido (${r(riseMs)} ms) y conservan pegada: un attack lento deja pasar el transiente.`
  } else if (!inst.percussive && riseMs !== null && riseMs > 20) {
    attack = 1
    attackWhy = `Los transientes son suaves (${r(riseMs)} ms): un attack rápido los aplana como en la canción.`
  } else {
    attack = inst.percussive ? 5 : 10
    attackWhy = 'Attack medio para controlar picos sin perder definición.'
  }

  const beat    = 60000 / bpm
  const release = clamp(r((decayMs ?? beat / 4) * 0.8), 30, r(beat / 2))

  return {
    amount,
    device: {
      name:    'Compressor',
      purpose: 'igualar la dinámica medida',
      params: [
        { key: 'Ratio',     val: `${ratio}:1` },
        { key: 'Attack',    val: `${attack} ms` },
        { key: 'Release',   val: `${release} ms` },
        { key: 'Threshold', val: `bajar hasta ~${gr} dB de reducción (GR)` },
        { key: 'Knee',      val: amount > 8 ? '1 dB' : '6 dB' },
        { key: 'Makeup',    val: 'Activado' }
      ],
      why: [
        `Crest factor medido: ${r1(crest)} dB (un ${inst.label.toLowerCase()} sin procesar ronda ${inst.crestRef} dB). ` +
          (amount < 1.5 ? 'Casi no está comprimido.' : `Está comprimido unos ${r1(amount)} dB.`),
        attackWhy,
        `Release según cuánto tarda en caer cada nota (${decayMs !== null ? `${r(decayMs)} ms` : 'no medido'}) y el tempo.`
      ]
    }
  }
}

function buildSaturator(amount, inst) {
  if (amount < 7 || inst.label.startsWith('Master')) return null
  const drive = clamp(r(amount / 2), 2, 8)
  return {
    name:    'Saturator',
    purpose: 'densidad y armónicos',
    params: [
      { key: 'Tipo',    val: inst.percussive ? 'Analog Clip' : 'Soft Sine' },
      { key: 'Drive',   val: `${drive} dB` },
      { key: 'Output',  val: `-${drive} dB` },
      { key: 'Dry/Wet', val: `${clamp(r(amount * 4), 25, 60)}%` }
    ],
    why: ['La dinámica está muy reducida, algo típico de saturación o clipping además de compresión.']
  }
}

function buildGlue(amount, inst) {
  if (amount < 4) return null
  if (!['kick', 'snare', 'hihat', 'master'].some(k => inst === getInstrument(k))) return null
  return {
    name:    'Glue Compressor',
    purpose: 'pegar el grupo',
    params: [
      { key: 'Ratio',   val: '4:1' },
      { key: 'Attack',  val: '10 ms' },
      { key: 'Release', val: 'Auto' },
      { key: 'Threshold', val: 'hasta 2–3 dB de GR' }
    ],
    why: ['La batería/mezcla de la referencia suena compactada: úsalo en el bus de grupo.']
  }
}

// ─── Espacio ──────────────────────────────────────────────────────────────

function buildReverb(features, inst, bpm, tilt) {
  if (inst.reverb.maxRt === 0) return null
  const { rt60, tailDb } = features.hits
  const why = []

  let decay
  if (rt60 !== null) {
    decay = clamp(rt60, 0.3, inst.reverb.maxRt)
    why.push(`Cola medida después de cada nota: ~${r1(rt60)} s de RT60.`)
  } else {
    decay = inst.reverb.rt
    why.push('No se pudo medir la cola (notas muy seguidas o sostenidas): valor típico del instrumento.')
  }

  let wet
  if (tailDb !== null) {
    // relación cola/directo: -30 dB (seco) → -5 dB (muy húmedo)
    wet = clamp(r(((tailDb + 30) / 25) * inst.reverb.maxWet), 3, inst.reverb.maxWet)
    why.push(`Relación cola/sonido directo: ${r1(tailDb)} dB.`)
  } else {
    wet = inst.reverb.wet
  }

  if (features.stereo.side > 0.5) why.push('El instrumento es ancho en estéreo, típico de reverb o efectos de modulación.')

  return {
    name:    'Reverb',
    purpose: 'recrear el espacio de la canción',
    params: [
      { key: 'Decay time', val: `${r1(decay)} s` },
      { key: 'Pre-delay',  val: `${clamp(r(60000 / bpm / 32), 5, 40)} ms` },
      { key: 'Size',       val: decay > 2.5 ? 'Grande (Hall)' : decay > 1 ? 'Mediana (Room grande)' : 'Pequeña (Room)' },
      { key: 'Hi Cut',     val: tilt < -1 ? '5 kHz' : '9 kHz' },
      { key: 'Dry/Wet',    val: `${wet}%` }
    ],
    why
  }
}

function buildDelay(features, inst, bpm) {
  if (!inst.delay) return null
  const { tailDb } = features.hits
  const wetness = tailDb !== null ? clamp((tailDb + 30) / 25, 0, 1) : 0.4
  return {
    name:    'Delay',
    purpose: 'repeticiones sincronizadas al tempo (opcional)',
    params: [
      { key: 'Modo',     val: 'Sync' },
      { key: 'Time L',   val: `1/8 (${r(60000 / bpm / 2)} ms)` },
      { key: 'Time R',   val: `1/4 (${r(60000 / bpm)} ms)` },
      { key: 'Feedback', val: `${clamp(r(15 + wetness * 30), 15, 45)}%` },
      { key: 'Dry/Wet',  val: `${clamp(r(5 + wetness * 15), 5, 20)}%` }
    ],
    why: ['El delay no se detecta automáticamente: es una sugerencia sincronizada al tempo, quítalo si no se oye en la referencia.']
  }
}

function buildUtility(features, inst, version, license) {
  const { side, lowSide } = features.stereo
  const params = []
  const why = []

  if (side < 0.08) {
    params.push({ key: 'Width', val: '0% (mono)' })
    why.push('En la canción este instrumento está prácticamente en mono.')
  } else if (side > 0.6) {
    params.push({ key: 'Width', val: `${clamp(r(100 + (side - 0.6) * 100), 110, 150)}%` })
    why.push(`Es muy ancho en estéreo (lado/centro ${r1(side)}).`)
  } else if (side < 0.25) {
    params.push({ key: 'Width', val: '60%' })
    why.push('Es bastante estrecho, cerca del centro.')
  }

  if (inst.mono && lowSide > 0.1) {
    params.push({ key: 'Graves', val: 'mantener en mono (<150 Hz)' })
    why.push('Los graves conviene dejarlos en mono para que tengan pegada.')
  }

  if (!params.length) return []

  const devices = [{
    name: 'Utility', purpose: 'imagen estéreo', params, why
  }]

  // Si es ancho y tu fuente es mono, Utility no puede ensancharla: sugerir chorus
  const chorus = Number(version) >= 11 ? 'Chorus-Ensemble' : 'Chorus'
  if (side > 0.6 && !inst.mono && tieneEfecto('Chorus', license)) {
    devices.push({
      name: chorus,
      purpose: 'ensanchar si tu sonido es mono',
      params: [
        { key: 'Rate',    val: '0.5 Hz' },
        { key: 'Amount',  val: '20%' },
        { key: 'Dry/Wet', val: '25%' }
      ],
      why: ['Utility solo ensancha lo que ya es estéreo; si tu sonido es mono, un chorus suave da amplitud.']
    })
  }
  return devices
}

function buildLimiter(features, inst) {
  if (!inst.label.startsWith('Master')) return null
  const lufs = features.loudness.integrated
  return {
    name:    'Limiter',
    purpose: 'alcanzar el volumen de la referencia',
    params: [
      { key: 'Ceiling', val: '-1.0 dB' },
      { key: 'Gain',    val: `subir hasta ~${r1(lufs)} LUFS integrados` },
      { key: 'Lookahead', val: '3 ms' }
    ],
    why: [`La referencia mide ${r1(lufs)} LUFS (rango ${r1(features.loudness.range)} LU). Usa un medidor de LUFS para igualarla.`]
  }
}

// ─── Ensamblado ───────────────────────────────────────────────────────────

export function mapToAbleton(features, instrumentId, { license = 'suite', version = '12' } = {}) {
  const inst = getInstrument(instrumentId)
  const bpm  = features.tempo

  const eq   = buildEQ(features, inst)
  const comp = buildCompressor(features, inst, bpm)

  const candidates = [
    eqDevice(eq),
    comp.device,
    buildGlue(comp.amount, inst),
    buildSaturator(comp.amount, inst),
    ...buildUtility(features, inst, version, license),
    buildReverb(features, inst, bpm, eq.tilt),
    buildDelay(features, inst, bpm),
    buildLimiter(features, inst)
  ].filter(Boolean)

  const lic = license.toLowerCase()
  const chain   = []
  const skipped = []
  for (const fx of candidates) {
    const base = fx.name === 'Chorus-Ensemble' ? 'Chorus' : fx.name
    if (tieneEfecto(base, lic)) chain.push(fx)
    else skipped.push(fx.name)
  }
  chain.forEach((fx, i) => { fx.order = `${i + 1}.°` })

  const notes = [...features.notes]
  if (features.tempoAlt) {
    notes.push(`El tempo puede ser ${r(bpm)} o ${r(features.tempoAlt)} BPM (medio/doble tempo). ` +
      'Los tiempos de delay y release están calculados con el primero; si tu proyecto usa el otro, sincroniza el delay en modo Sync.')
  }
  if (skipped.length) notes.push(`No incluidos por tu licencia ${license}: ${skipped.join(', ')}.`)

  return {
    chain,
    notes,
    meta: {
      bpm:      features.tempoAlt ? `${r(bpm)} / ${r(features.tempoAlt)}` : r(bpm),
      key:      `${KEY_NAMES[features.key ?? 0]} ${features.mode === 0 ? 'menor' : 'mayor'}`,
      loudness: `${r1(features.loudness.integrated)} LUFS`,
      crest:    `${r1(features.dynamics.crest)} dB`,
      width:    features.stereo.side < 0.08 ? 'Mono' : `${r(features.stereo.side * 100)}%`,
      analyzed: features.analyzed,
      title:    features.title
    }
  }
}
