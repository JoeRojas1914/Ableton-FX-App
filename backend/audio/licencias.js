const BASIC = [
  'EQ Three', 'Compressor', 'Reverb', 'Delay', 'Auto Filter',
  'Limiter', 'Utility', 'Saturator', 'Chorus'
]

export const FX = {
  lite:  BASIC,
  intro: [...BASIC, 'Gate'],
  standard: [
    'EQ Eight', 'EQ Three', 'Compressor', 'Glue Compressor', 'Multiband Dynamics',
    'Reverb', 'Delay', 'Auto Filter', 'Gate', 'Limiter',
    'Utility', 'Saturator', 'Chorus', 'Flanger', 'Phaser', 'Overdrive'
  ],
  suite: [
    'EQ Eight', 'EQ Three', 'Compressor', 'Glue Compressor', 'Multiband Dynamics',
    'Reverb', 'Delay', 'Auto Filter', 'Gate', 'Limiter',
    'Utility', 'Saturator', 'Chorus', 'Flanger', 'Phaser', 'Overdrive',
    'Spectral Blur', 'Spectral Time', 'Convolution Reverb',
    'Max for Live'
  ]
}

export function tieneEfecto(nombre, license) {
  return FX[license?.toLowerCase()]?.includes(nombre) ?? false
}
