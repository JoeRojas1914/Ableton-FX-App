// Utilidades de procesamiento de señal sin dependencias externas.

export const dB      = (x, floor = 1e-12) => 10 * Math.log10(Math.max(x, floor))   // potencia → dB
export const ampDB   = (x, floor = 1e-9)  => 20 * Math.log10(Math.max(x, floor))   // amplitud → dB
export const clamp   = (n, min, max) => Math.max(min, Math.min(max, n))

export function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function percentile(arr, p) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  return s[clamp(Math.round((p / 100) * (s.length - 1)), 0, s.length - 1)]
}

// ─── FFT radix-2 iterativa ────────────────────────────────────────────────

const fftCache = new Map()

function fftSetup(n) {
  if (fftCache.has(n)) return fftCache.get(n)
  const rev  = new Uint32Array(n)
  const bits = Math.log2(n)
  for (let i = 0; i < n; i++) {
    let r = 0
    for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1)
    rev[i] = r
  }
  const cos = new Float64Array(n / 2)
  const sin = new Float64Array(n / 2)
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n)
    sin[i] = -Math.sin((2 * Math.PI * i) / n)
  }
  const win = new Float64Array(n)
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
  const setup = { rev, cos, sin, win }
  fftCache.set(n, setup)
  return setup
}

function fftInPlace(re, im, setup) {
  const n = re.length
  const { rev, cos, sin } = setup
  for (let i = 0; i < n; i++) {
    const j = rev[i]
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t
      t = im[i]; im[i] = im[j]; im[j] = t
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const step = n / size
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step], wi = sin[k * step]
        const a  = start + k, b = a + half
        const xr = re[b] * wr - im[b] * wi
        const xi = re[b] * wi + im[b] * wr
        re[b] = re[a] - xr; im[b] = im[a] - xi
        re[a] += xr;        im[a] += xi
      }
    }
  }
}


export function stft(signal, n, hop, onFrame) {
  const setup = fftSetup(n)
  const re    = new Float64Array(n)
  const im    = new Float64Array(n)
  const power = new Float64Array(n / 2 + 1)
  let frame   = 0

  for (let start = 0; start + n <= signal.length; start += hop, frame++) {
    for (let i = 0; i < n; i++) { re[i] = signal[start + i] * setup.win[i]; im[i] = 0 }
    fftInPlace(re, im, setup)
    for (let k = 0; k <= n / 2; k++) power[k] = re[k] * re[k] + im[k] * im[k]
    onFrame(power, frame)
  }
  return frame
}

// ─── Filtros biquad (RBJ) ─────────────────────────────────────────────────

function biquadCoeffs(type, f, sr, q = Math.SQRT1_2, gainDb = 0) {
  const w0 = (2 * Math.PI * f) / sr
  const c  = Math.cos(w0)
  const al = Math.sin(w0) / (2 * q)
  let b0, b1, b2, a0, a1, a2

  if (type === 'lowpass') {
    b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2
    a0 = 1 + al;      a1 = -2 * c; a2 = 1 - al
  } else if (type === 'highpass') {
    b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2
    a0 = 1 + al;      a1 = -2 * c;   a2 = 1 - al
  } else if (type === 'highshelf') {
    const A = 10 ** (gainDb / 40), sA = 2 * Math.sqrt(A) * al
    b0 = A * ((A + 1) + (A - 1) * c + sA)
    b1 = -2 * A * ((A - 1) + (A + 1) * c)
    b2 = A * ((A + 1) + (A - 1) * c - sA)
    a0 = (A + 1) - (A - 1) * c + sA
    a1 = 2 * ((A - 1) - (A + 1) * c)
    a2 = (A + 1) - (A - 1) * c - sA
  } else {
    throw new Error(`Filtro desconocido: ${type}`)
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0]
}

function applyBiquad(x, [b0, b1, b2, a1, a2]) {
  const y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v
    y[i] = v
  }
  return y
}

export function bandFilter(x, sr, band) {
  if (!band) return x
  let y = x
  if (band.hp) for (let i = 0; i < 2; i++) y = applyBiquad(y, biquadCoeffs('highpass', band.hp, sr))
  if (band.lp) for (let i = 0; i < 2; i++) y = applyBiquad(y, biquadCoeffs('lowpass',  band.lp, sr))
  return y
}

// ─── Loudness ITU-R BS.1770 (LUFS) ────────────────────────────────────────

function kWeight(x, sr) {
  const shelf = biquadCoeffs('highshelf', 1681.974450955533, sr, 0.7071752369554196, 3.999843853973347)
  const hp    = biquadCoeffs('highpass',  38.13547087602444,  sr, 0.5003270373238773)
  return applyBiquad(applyBiquad(x, shelf), hp)
}

function blockLoudness(kChannels, sr, blockSec, overlap) {
  const size = Math.round(blockSec * sr)
  const step = Math.round(size * (1 - overlap))
  const out  = []
  for (let s = 0; s + size <= kChannels[0].length; s += step) {
    let z = 0
    for (const ch of kChannels) {
      let sum = 0
      for (let i = s; i < s + size; i++) sum += ch[i] * ch[i]
      z += sum / size
    }
    out.push(z)
  }
  return out
}

const lufsOf = z => -0.691 + 10 * Math.log10(Math.max(z, 1e-12))

// Devuelve { integrated, range } en LUFS / LU
export function loudness(channels, sr) {
  const k = channels.map(ch => kWeight(ch, sr))

  const blocks = blockLoudness(k, sr, 0.4, 0.75).filter(z => lufsOf(z) > -70)
  if (!blocks.length) return { integrated: -70, range: 0 }
  const relGate = lufsOf(blocks.reduce((a, b) => a + b, 0) / blocks.length) - 10
  const gated   = blocks.filter(z => lufsOf(z) > relGate)
  const integrated = lufsOf(gated.reduce((a, b) => a + b, 0) / gated.length)

  const st = blockLoudness(k, sr, 3, 0.9).map(lufsOf).filter(l => l > -70)
  let range = 0
  if (st.length > 2) {
    const g    = lufsOf(st.map(l => 10 ** ((l + 0.691) / 10)).reduce((a, b) => a + b, 0) / st.length) - 20
    const kept = st.filter(l => l > g)
    if (kept.length > 2) range = percentile(kept, 95) - percentile(kept, 10)
  }

  return { integrated, range }
}

// Envolvente RMS en dB con resolución de 1 ms (ventana de 3 ms)
export function envelopeDB(x, sr) {
  const hop = Math.round(sr / 1000)
  const win = hop * 3
  const n   = Math.floor((x.length - win) / hop)
  const env = new Float32Array(Math.max(0, n))
  for (let f = 0; f < n; f++) {
    let sum = 0
    const s = f * hop
    for (let i = s; i < s + win; i++) sum += x[i] * x[i]
    env[f] = dB(sum / win)
  }
  return env
}
