// Perfiles por instrumento.
//
// stem        → qué stem de Demucs contiene el instrumento (null = mezcla completa)
// band        → filtro para aislar el instrumento dentro del stem (Hz) y detectar sus golpes
// range       → rango de frecuencias donde se analiza su EQ
// refTilt     → pendiente espectral "neutra" de referencia (dB/octava); se compara con la medida
// crestRef    → crest factor (pico/RMS en dB) típico del instrumento sin comprimir
// reverb      → valores por defecto si no se puede medir la cola, y límites razonables
// delay       → si tiene sentido sugerir delay
// percussive  → golpes cortos (cambia cómo se interpretan ataque y decay)

export const INSTRUMENTS = {
  kick: {
    label: 'Kick / Bombo', stem: 'drums', band: { lp: 150 },
    range: [30, 6000], refTilt: -9, crestRef: 18, percussive: true,
    reverb: { rt: 0.6, wet: 4, maxRt: 1.2, maxWet: 12 }, delay: false, mono: true,
    shelf: [100, 4000]
  },
  snare: {
    label: 'Snare / Caja', stem: 'drums', band: { hp: 180, lp: 6000 },
    range: [100, 14000], refTilt: -4, crestRef: 18, percussive: true,
    reverb: { rt: 1.2, wet: 14, maxRt: 3, maxWet: 35 }, delay: false, mono: false,
    shelf: [200, 6000]
  },
  hihat: {
    label: 'Hi-hats', stem: 'drums', band: { hp: 6000 },
    range: [2000, 18000], refTilt: -2, crestRef: 16, percussive: true,
    reverb: { rt: 0.9, wet: 10, maxRt: 2, maxWet: 25 }, delay: false, mono: false,
    shelf: [3000, 10000]
  },
  bass: {
    label: 'Bajo / Bass', stem: 'bass', band: null,
    range: [30, 6000], refTilt: -8, crestRef: 14, percussive: false,
    reverb: { rt: 0.5, wet: 3, maxRt: 1, maxWet: 8 }, delay: false, mono: true,
    shelf: [80, 2500]
  },
  synth: {
    label: 'Synth Lead', stem: 'other', band: null,
    range: [100, 16000], refTilt: -5, crestRef: 13, percussive: false,
    reverb: { rt: 1.8, wet: 18, maxRt: 5, maxWet: 45 }, delay: true, mono: false,
    shelf: [250, 8000]
  },
  pads: {
    label: 'Pads / Acordes', stem: 'other', band: null,
    range: [80, 14000], refTilt: -6, crestRef: 12, percussive: false,
    reverb: { rt: 3, wet: 30, maxRt: 8, maxWet: 60 }, delay: true, mono: false,
    shelf: [200, 6000]
  },
  guitar: {
    label: 'Guitarra', stem: 'other', band: null,
    range: [70, 12000], refTilt: -5, crestRef: 14, percussive: false,
    reverb: { rt: 1.5, wet: 16, maxRt: 4, maxWet: 40 }, delay: true, mono: false,
    shelf: [150, 6000]
  },
  vocals: {
    label: 'Voz / Vocals', stem: 'vocals', band: null,
    range: [80, 16000], refTilt: -5, crestRef: 16, percussive: false,
    reverb: { rt: 1.8, wet: 18, maxRt: 4, maxWet: 40 }, delay: true, mono: false,
    shelf: [150, 10000]
  },
  master: {
    label: 'Master / Mix', stem: null, band: null,
    range: [25, 18000], refTilt: -4.5, crestRef: 16, percussive: false,
    reverb: { rt: 0, wet: 0, maxRt: 0, maxWet: 0 }, delay: false, mono: false,
    shelf: [80, 12000]
  }
}

export function getInstrument(id) {
  return INSTRUMENTS[id] ?? INSTRUMENTS.synth
}
