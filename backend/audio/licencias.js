export const FX = {
  intro: [
    'EQ Eight', 'Compressor', 'Reverb', 'Delay',
    'Auto Filter', 'Gate', 'Limiter', 'Utility', 'Saturator'
  ],
  standard: [
    'EQ Eight', 'Compressor', 'Glue Compressor', 'Multiband Dynamics',
    'Reverb', 'Delay', 'Auto Filter', 'Gate', 'Limiter',
    'Utility', 'Saturator', 'Chorus', 'Flanger', 'Phaser', 'Overdrive'
  ],
  suite: [
    'EQ Eight', 'Compressor', 'Glue Compressor', 'Multiband Dynamics',
    'Reverb', 'Delay', 'Auto Filter', 'Gate', 'Limiter',
    'Utility', 'Saturator', 'Chorus', 'Flanger', 'Phaser', 'Overdrive',
    'Spectral Blur', 'Spectral Time', 'Convolution Reverb',
    'Max for Live'
  ]
}

export function tieneEfecto(nombre, license) {
  return FX[license]?.includes(nombre) ?? false
}