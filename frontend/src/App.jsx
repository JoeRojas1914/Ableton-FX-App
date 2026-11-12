import { useState } from 'react'
import StepSetup      from './components/StepSetup'
import StepSong       from './components/StepSong'
import StepInstrument from './components/StepInstrument'
import Results        from './components/Results'
import './index.css'

const STEPS = ['Tu Ableton', 'Canción', 'Instrumento', 'Efectos']

const LICENSE_NAMES = { lite: 'Lite', intro: 'Intro', standard: 'Standard', suite: 'Suite' }

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

      <header className="topbar">
        <span className="app-title">Ableton FX</span>
        <span className="app-setup">Live {config.version} {LICENSE_NAMES[config.license]}</span>
      </header>

      <nav className="step-bar" aria-label="Pasos">
        {STEPS.map((label, i) => {
          const n     = i + 1
          const state = n < step ? 'done' : n === step ? 'active' : ''
          return (
            <div key={n} className={`step-item ${state}`} aria-current={n === step ? 'step' : undefined}>
              <span className="step-num">{n}</span>
              <span className="step-label">{label}</span>
              <span className="step-led" />
            </div>
          )
        })}
      </nav>

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