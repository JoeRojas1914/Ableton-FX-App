import { useState } from 'react'
import StepSetup      from './components/StepSetup'
import StepSong       from './components/StepSong'
import StepInstrument from './components/StepInstrument'
import Results        from './components/Results'
import './index.css'

const STEPS = ['Setup', 'Canción', 'Instrumento', 'Efectos']

const INITIAL = {
  version:     '12',
  license:     'suite',
  inputMethod: 'spotify',
  song:        '',
  artist:      '',
  spotifyId:   '',
  trackImage:  null,
  instrument:  '',
  audioFile:   null
}

function App() {
  const [step,   setStep]   = useState(1)
  const [config, setConfig] = useState(INITIAL)

  function update(key, value) {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  function goNext()  { setStep(s => s + 1) }
  function goBack()  { setStep(s => s - 1) }
  function restart() { setStep(1); setConfig(INITIAL) }

  return (
    <div className="app">

      <div className="window-bar">
        <span className="dot red"    />
        <span className="dot yellow" />
        <span className="dot green"  />
        <span className="app-title">Ableton FX</span>
        <span className="app-badge">Live {config.version} · {config.license}</span>
      </div>

      <div className="step-bar">
        {STEPS.map((label, i) => {
          const n      = i + 1
          const done   = n < step
          const active = n === step
          return (
            <div key={n} className="step-item">
              {n > 1 && <div className={`step-line ${done ? 'done' : ''}`} />}
              <div className={`step-dot ${done ? 'done' : active ? 'active' : ''}`}>
                {done ? '✓' : n}
              </div>
              <span className={`step-label ${active ? 'active' : done ? 'done' : ''}`}>
                {label}
              </span>
            </div>
          )
        })}
      </div>

      <div className="step-content">
        {step === 1 && <StepSetup      config={config} update={update} onNext={goNext} />}
        {step === 2 && <StepSong       config={config} update={update} onNext={goNext} onBack={goBack} />}
        {step === 3 && <StepInstrument config={config} update={update} onNext={goNext} onBack={goBack} />}
        {step === 4 && <Results        config={config} onRestart={restart} />}
      </div>

    </div>
  )
}

export default App