const INSTRUMENTS = [
  { id: 'kick',   label: 'Kick'           },
  { id: 'snare',  label: 'Snare'          },
  { id: 'hihat',  label: 'Hi-hats'        },
  { id: 'bass',   label: 'Bajo'           },
  { id: 'synth',  label: 'Synth lead'     },
  { id: 'pads',   label: 'Pads y acordes' },
  { id: 'guitar', label: 'Guitarra'       },
  { id: 'vocals', label: 'Voz'            },
  { id: 'master', label: 'Master'         }
]

function StepInstrument({ config, update, onNext, onBack }) {
  return (
    <div className="step">
      <h2 className="step-title">Elige el instrumento</h2>
      <p className="step-desc">
        Lo aislamos de la canción y medimos cómo suena para armar su cadena de efectos.
      </p>

      <div className="instrument-grid" role="radiogroup" aria-label="Instrumento">
        {INSTRUMENTS.map(inst => (
          <button
            key={inst.id}
            role="radio"
            aria-checked={config.instrument === inst.id}
            className={`inst-card ${config.instrument === inst.id ? 'active' : ''}`}
            onClick={() => update('instrument', inst.id)}
          >
            {inst.label}
          </button>
        ))}
      </div>

      <div className="nav-row">
        <button className="btn-ghost" onClick={onBack}>Atrás</button>
        <button
          className="btn-primary"
          onClick={onNext}
          disabled={!config.instrument}
        >
          Generar efectos
        </button>
      </div>
    </div>
  )
}

export default StepInstrument