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
  const fLo = Math.max(inst.range[0], lo * 1.4)
  const fHi = Math.min(inst.range[1], hi / 1.4)
  const idx = freqs.map((f, i) => i).filter(i => freqs[i] >= fLo && freqs[i] <= fHi && db[i] > -60)
  const bands = []
  const why   = []

  if (idx.length < 6) {
    return { bands: [], why: ['No hubo suficiente señal del instrumento para medir su ecualización.'], tilt: 0 }
  }

  const smooth = db.map((_, i) => {
    let s = 0, c = 0
    for (let j = i - 1; j <= i + 1; j++) if (db[j] !== undefined) { s += db[j]; c++ }
    return s / c
  })
  const oct = freqs.map(f => Math.log2(f / 1000))
  const fit = linearFit(idx.map(i => oct[i]), idx.map(i => smooth[i]))
  const tiltDiff = fit.slope - inst.refTilt

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

  if (Math.abs(tiltDiff) >= 1) {
    const g = clamp(half(tiltDiff * 1.5), -6, 6)
    if (!lowCut  || inst.shelf[0] > lowCut * 1.5)  bands.push({ type: 'Low Shelf',  freq: inst.shelf[0], gain: -g / 2 })
    if (!highCut || inst.shelf[1] < highCut / 1.5) bands.push({ type: 'High Shelf', freq: inst.shelf[1], gain:  g / 2 })
    why.push(tiltDiff > 0
      ? `Suena más brillante que un ${inst.label.toLowerCase()} típico (pendiente ${r1(fit.slope)} dB/oct).`
      : `Suena más oscuro/cálido que un ${inst.label.toLowerCase()} típico (pendiente ${r1(fit.slope)} dB/oct).`)
  }

  return { bands, why, tilt: tiltDiff }
}

const EQ8_MODE = { 'Low Cut 48': 0, 'Low Shelf': 2, Bell: 3, 'High Shelf': 5, 'High Cut 12': 6 }

const dbToLin = d => 10 ** (d / 20)

function eqDevice(eq) {
  const order = { 'Low Cut 48': 0, 'Low Shelf': 1, Bell: 2, 'High Shelf': 3, 'High Cut 12': 4 }
  const sorted = [...eq.bands].sort((a, b) => order[a.type] - order[b.type] || a.freq - b.freq).slice(0, 8)

  const set = []
  for (let i = 0; i < 8; i++) {
    const b = sorted[i]
    const p = `Bands.${i}/ParameterA`
    set.push([`${p}/IsOn`, Boolean(b)])
    if (!b) continue
    set.push([`${p}/Mode`, EQ8_MODE[b.type]])
    set.push([`${p}/Freq`, clamp(b.freq, 10, 22000)])
    set.push([`${p}/Gain`, b.gain ?? 0])
    set.push([`${p}/Q`,    b.q ?? 0.71])
  }

  return {
    ableton: { tag: 'Eq8', set },
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

function eqThreeDevice(eq, inst) {
  const find = t => eq.bands.find(b => b.type === t)
  const lowCut = find('Low Cut 48'), highCut = find('High Cut 12')
  const lowShelf = find('Low Shelf'), highShelf = find('High Shelf')
  const bells = eq.bands.filter(b => b.type === 'Bell')

  let freqLo = clamp((lowCut ?? lowShelf)?.freq ?? inst.shelf[0], 50, 5000)
  let freqHi = clamp((highCut ?? highShelf)?.freq ?? inst.shelf[1], 200, 18000)
  if (freqHi <= freqLo * 1.5) freqHi = clamp(freqLo * 2, 200, 18000)

  const gainLo = lowCut ? 0 : lowShelf?.gain ?? 0
  const gainHi = highCut ? 0 : highShelf?.gain ?? 0
  const set = [
    ['LowOn', !lowCut], ['MidOn', true], ['HighOn', !highCut],
    ['FreqLo', freqLo], ['FreqHi', freqHi],
    ['GainLo', dbToLin(gainLo)], ['GainMid', 1], ['GainHi', dbToLin(gainHi)],
    ['Slope', 1]
  ]

  const params = []
  params.push({ key: 'Low',  val: lowCut  ? `Apagado (corta bajo ${hz(freqLo)})` : `${sign(gainLo)} dB` })
  params.push({ key: 'Mid',  val: '0 dB' })
  params.push({ key: 'High', val: highCut ? `Apagado (corta sobre ${hz(freqHi)})` : `${sign(gainHi)} dB` })
  params.push({ key: 'FreqLow',  val: hz(freqLo) })
  params.push({ key: 'FreqHi',   val: hz(freqHi) })
  params.push({ key: 'Pendiente', val: '48 dB/oct' })

  const why = [...eq.why]
  if (bells.length) {
    why.push(`EQ Three no tiene bandas paramétricas: las resonancias (${bells.map(b => `${hz(b.freq)} ${sign(b.gain)} dB`).join(', ')}) ` +
      'solo se pueden hacer con EQ Eight (Standard/Suite).')
  }

  return {
    ableton: { tag: 'FilterEQ3', set },
    name:    'EQ Three',
    purpose: 'imitar el balance tonal del instrumento en la canción',
    params,
    why: [...why, 'Punto de partida: compara A/B con la canción y ajusta a oído, porque tu sonido de origen también influye.']
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
  const knee    = amount > 8 ? 1 : 6
  const thresholdDb = clamp(-10 - gr * 2, -40, -6)

  return {
    amount,
    device: {
      ableton: {
        tag: 'Compressor2',
        set: [
          ['Threshold', dbToLin(thresholdDb)],
          ['Ratio', ratio], ['Attack', attack], ['Release', release], ['Knee', knee],
          ['AutoReleaseControlOnOff', false], ['GainCompensation', true], ['Gain', 0],
          ['DryWet', 1], ['Model', 0], ['SideChainEq_On', false]
        ]
      },
      name:    'Compressor',
      purpose: 'igualar la dinámica medida',
      params: [
        { key: 'Ratio',     val: `${ratio}:1` },
        { key: 'Attack',    val: `${attack} ms` },
        { key: 'Release',   val: `${release} ms` },
        { key: 'Threshold', val: `bajar hasta ~${gr} dB de reducción (GR)` },
        { key: 'Knee',      val: `${knee} dB` },
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
  const wet   = clamp(r(amount * 4), 25, 60)
  return {
    ableton: {
      tag: 'Saturator',
      set: [['Type', inst.percussive ? 0 : 1], ['PreDrive', drive], ['PostDrive', -drive], ['DryWet', wet / 100]]
    },
    name:    'Saturator',
    purpose: 'densidad y armónicos',
    params: [
      { key: 'Tipo',    val: inst.percussive ? 'Analog Clip' : 'Soft Sine' },
      { key: 'Drive',   val: `${drive} dB` },
      { key: 'Output',  val: `-${drive} dB` },
      { key: 'Dry/Wet', val: `${wet}%` }
    ],
    why: ['La dinámica está muy reducida, algo típico de saturación o clipping además de compresión.']
  }
}

function buildGlue(amount, inst) {
  if (amount < 4) return null
  if (!['kick', 'snare', 'hihat', 'master'].some(k => inst === getInstrument(k))) return null
  return {
    ableton: {
      tag: 'GlueCompressor',
      set: [['Threshold', -18], ['Ratio', 1], ['Attack', 5], ['Release', 6], ['Makeup', 2], ['DryWet', 1]]
    },
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
    wet = clamp(r(((tailDb + 30) / 25) * inst.reverb.maxWet), 3, inst.reverb.maxWet)
    why.push(`Relación cola/sonido directo: ${r1(tailDb)} dB.`)
  } else {
    wet = inst.reverb.wet
  }

  if (features.stereo.side > 0.5) why.push('El instrumento es ancho en estéreo, típico de reverb o efectos de modulación.')

  const preDelay = clamp(r(60000 / bpm / 32), 5, 40)
  const size     = decay > 2.5 ? 200 : decay > 1 ? 100 : 40
  const hiCut    = tilt < -1 ? 5000 : 9000

  return {
    ableton: {
      tag: 'Reverb',
      set: [
        ['DecayTime', decay * 1000], ['PreDelay', preDelay], ['RoomSize', size],
        ['ShelfHighOn', true], ['ShelfHiFreq', hiCut], ['ShelfHiGain', 0.5],
        ['MixDirect', wet / 100], ['FreezeOn', false]
      ]
    },
    name:    'Reverb',
    purpose: 'recrear el espacio de la canción',
    params: [
      { key: 'Decay time', val: `${r1(decay)} s` },
      { key: 'Pre-delay',  val: `${preDelay} ms` },
      { key: 'Size',       val: decay > 2.5 ? 'Grande (Hall)' : decay > 1 ? 'Mediana (Room grande)' : 'Pequeña (Room)' },
      { key: 'Hi Cut',     val: hz(hiCut) },
      { key: 'Dry/Wet',    val: `${wet}%` }
    ],
    why
  }
}

function buildDelay(features, inst, bpm) {
  if (!inst.delay) return null
  const { tailDb } = features.hits
  const wetness  = tailDb !== null ? clamp((tailDb + 30) / 25, 0, 1) : 0.4
  const timeL    = r(60000 / bpm / 2)
  const timeR    = r(60000 / bpm)
  const feedback = clamp(r(15 + wetness * 30), 15, 45)
  const wet      = clamp(r(5 + wetness * 15), 5, 20)
  return {
    ableton: {
      tag: 'Delay',
      set: [
        ['DelayLine_Link', false], ['DelayLine_SyncL', false], ['DelayLine_SyncR', false],
        ['DelayLine_TimeL', timeL / 1000], ['DelayLine_TimeR', timeR / 1000],
        ['Feedback', feedback / 100], ['DryWet', wet / 100], ['Freeze', false]
      ]
    },
    name:    'Delay',
    purpose: 'repeticiones al tempo de la canción (opcional)',
    params: [
      { key: 'Time L',   val: `1/8 (${timeL} ms)` },
      { key: 'Time R',   val: `1/4 (${timeR} ms)` },
      { key: 'Feedback', val: `${feedback}%` },
      { key: 'Dry/Wet',  val: `${wet}%` }
    ],
    why: ['El delay no se detecta automáticamente: es una sugerencia sincronizada al tempo, quítalo si no se oye en la referencia.']
  }
}

function buildUtility(features, inst, version, license) {
  const { side, lowSide } = features.stereo
  const params = []
  const why = []
  let width = 100

  if (side < 0.08) {
    width = 0
    params.push({ key: 'Width', val: '0% (mono)' })
    why.push('En la canción este instrumento está prácticamente en mono.')
  } else if (side > 0.6) {
    width = clamp(r(100 + (side - 0.6) * 100), 110, 150)
    params.push({ key: 'Width', val: `${width}%` })
    why.push(`Es muy ancho en estéreo (lado/centro ${r1(side)}).`)
  } else if (side < 0.25) {
    width = 60
    params.push({ key: 'Width', val: '60%' })
    why.push('Es bastante estrecho, cerca del centro.')
  }

  const bassMono = inst.mono && lowSide > 0.1
  if (bassMono) {
    params.push({ key: 'Bass Mono', val: '150 Hz' })
    why.push('Los graves conviene dejarlos en mono para que tengan pegada.')
  }

  if (!params.length) return []

  const devices = [{
    ableton: {
      tag: 'StereoGain',
      set: [
        ['StereoWidth', width / 100], ['MidSideBalanceOn', false], ['MidSideBalance', 1],
        ['ChannelMode', 1], ['Mono', false], ['BassMono', bassMono], ['BassMonoFrequency', 150],
        ['Gain', 1], ['Balance', 0], ['Mute', false]
      ]
    },
    name: 'Utility', purpose: 'imagen estéreo', params, why
  }]

  const chorus = Number(version) >= 11 ? 'Chorus-Ensemble' : 'Chorus'
  if (side > 0.6 && !inst.mono && !inst.label.startsWith('Master') && tieneEfecto('Chorus', license)) {
    devices.push({
      ableton: Number(version) >= 11
        ? { tag: 'Chorus2', set: [['Mode', 0], ['Rate', 0.5], ['Amount', 0.2], ['DryWet', 0.25]] }
        : null,
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
    ableton: {
      tag: 'Limiter',
      set: [['Ceiling', -1], ['Gain', 0], ['Lookahead', 1], ['AutoRelease', true]]
    },
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

  const lic = license.toLowerCase()
  const candidates = [
    tieneEfecto('EQ Eight', lic) ? eqDevice(eq) : eqThreeDevice(eq, inst),
    comp.device,
    buildGlue(comp.amount, inst),
    buildSaturator(comp.amount, inst),
    ...buildUtility(features, inst, version, license),
    buildReverb(features, inst, bpm, eq.tilt),
    buildDelay(features, inst, bpm),
    buildLimiter(features, inst)
  ].filter(Boolean)

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
