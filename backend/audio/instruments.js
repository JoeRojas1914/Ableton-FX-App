export const INSTRUMENTS = {
  kick: {
    label:    'Kick / Bombo',
    eqLow:    60,
    eqHigh:   180,
    ratioMod: 1.5,
    reverbMod: 0.4
  },
  snare: {
    label:    'Snare / Caja',
    eqLow:    180,
    eqHigh:   5000,
    ratioMod: 1.2,
    reverbMod: 0.7
  },
  hihat: {
    label:    'Hi-hats',
    eqLow:    4000,
    eqHigh:   16000,
    ratioMod: 0.8,
    reverbMod: 0.6
  },
  bass: {
    label:    'Bajo / Bass',
    eqLow:    60,
    eqHigh:   400,
    ratioMod: 1.3,
    reverbMod: 0.3
  },
  synth: {
    label:    'Synth Lead',
    eqLow:    300,
    eqHigh:   8000,
    ratioMod: 1.0,
    reverbMod: 1.0
  },
  pads: {
    label:    'Pads / Acordes',
    eqLow:    200,
    eqHigh:   6000,
    ratioMod: 0.8,
    reverbMod: 1.4
  },
  guitar: {
    label:    'Guitarra',
    eqLow:    100,
    eqHigh:   6000,
    ratioMod: 1.1,
    reverbMod: 0.9
  },
  vocals: {
    label:    'Voz / Vocals',
    eqLow:    150,
    eqHigh:   10000,
    ratioMod: 1.0,
    reverbMod: 1.0
  },
  master: {
    label:    'Master / Mix',
    eqLow:    30,
    eqHigh:   15000,
    ratioMod: 0.7,
    reverbMod: 0.5
  }
}

export function getInstrument(id) {
  return INSTRUMENTS[id] ?? INSTRUMENTS.synth
}