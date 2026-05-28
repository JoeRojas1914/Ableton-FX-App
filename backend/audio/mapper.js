import { getInstrument } from './instruments.js'

const KEY_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

const r  = n => Math.round(n)
const r1 = n => Math.round(n * 10) / 10
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const sign  = n => n >= 0 ? `+${r1(n)}` : `${r1(n)}`

export function mapToAbleton(features, instrumentId) {
  const {
    tempo, energy, loudness, key, mode,
    danceability, valence, acousticness
  } = features

  const inst    = getInstrument(instrumentId)
  const keyName = `${KEY_NAMES[key ?? 0]} ${mode === 0 ? 'menor' : 'mayor'}`
  const bpm     = r(tempo)

  const lowGain  = energy < 0.4 ? 2.5 : energy > 0.75 ? -1.5 : 0
  const highGain = valence > 0.6 ? 2.0 : acousticness > 0.5 ? -1.5 : 0

  const eqEight = {
    name:    'EQ Eight',
    order:   '1.°',
    purpose: 'balance frecuencial del instrumento',
    params: [
      { key: 'Low shelf',  val: `${inst.eqLow} Hz   ${sign(lowGain)} dB` },
      { key: 'High shelf', val: `${inst.eqHigh} Hz   ${sign(highGain)} dB` },
      { key: 'Modo',       val: 'Stereo' }
    ]
  }


  const threshold = clamp(r(loudness + 3), -40, -3)
  const ratio     = energy > 0.75 ? 4.0 : energy > 0.45 ? 2.5 : 1.5
  const attack    = danceability > 0.7 ? 2 : 15
  const release   = clamp(r(60000 / bpm * 0.4), 40, 800)

  const compressor = {
    name:    'Compressor',
    order:   '2.°',
    purpose: 'controla la dinámica',
    params: [
      { key: 'Threshold', val: `${threshold} dB` },
      { key: 'Ratio',     val: `${ratio}:1` },
      { key: 'Attack',    val: `${attack} ms` },
      { key: 'Release',   val: `${release} ms` }
    ]
  }

  const decay    = r((1 - energy * inst.reverbMod) * 3000 + 400)
  const preDelay = clamp(r(60000 / bpm / 16), 5, 40)
  const reverbWet = clamp(r((1 - energy) * 28 * inst.reverbMod + 4), 3, 45)

  const reverb = {
    name:    'Reverb',
    order:   '3.°',
    purpose: 'agrega espacio y profundidad',
    params: [
      { key: 'Decay time', val: `${decay} ms` },
      { key: 'Pre-delay',  val: `${preDelay} ms` },
      { key: 'Dry/Wet',    val: `${reverbWet}%` },
      { key: 'Tamaño',     val: mode === 0 ? 'Grande' : 'Mediano' }
    ]
  }

  const delayL   = r(60000 / bpm)
  const delayR   = r(60000 / bpm / 2)
  const feedback = clamp(r((1 - energy) * 38 + 5), 5, 55)
  const delayWet = clamp(r((1 - energy) * 18 + 3), 3, 30)

  const delay = {
    name:    'Delay',
    order:   '4.°',
    purpose: 'añade repeticiones rítmicas sincronizadas',
    params: [
      { key: 'Time L',   val: `${delayL} ms` },
      { key: 'Time R',   val: `${delayR} ms` },
      { key: 'Feedback', val: `${feedback}%` },
      { key: 'Dry/Wet',  val: `${delayWet}%` }
    ]
  }

  return {
    chain: [eqEight, compressor, reverb, delay],
    meta: {
      bpm,
      key:    keyName,
      energy: r(energy * 100),
      loudness: `${r1(loudness)} dBFS`
    }
  }
}