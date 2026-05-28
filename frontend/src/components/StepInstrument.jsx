const INSTRUMENTS = [
  { id: 'kick',   label: 'Kick / Bombo'   },
  { id: 'snare',  label: 'Snare / Caja'   },
  { id: 'hihat',  label: 'Hi-hats'        },
  { id: 'bass',   label: 'Bajo / Bass'    },
  { id: 'synth',  label: 'Synth Lead'     },
  { id: 'pads',   label: 'Pads / Acordes' },
  { id: 'guitar', label: 'Guitarra'       },
  { id: 'vocals', label: 'Voz / Vocals'   },
  { id: 'master', label: 'Master / Mix'   }
]

function StepInstrument({ config, update, onNext, onBack }) {
  return (
    <div className="step">
      <div className="step-eyebrow">Paso 3</div>
      <h2 className="step-title">¿A qué instrumento le aplicamos efectos?</h2>
      <p className="step-desc">Los parámetros se optimizan para el instrumento seleccionado</p>

      <div className="instrument-grid">
        {INSTRUMENTS.map(inst => (
          <div
            key={inst.id}
            className={`inst-card ${config.instrument === inst.id ? 'active' : ''}`}
            onClick={() => update('instrument', inst.id)}
          >
            <div className="inst-label">{inst.label}</div>
          </div>
        ))}
      </div>

      <div className="nav-row">
        <button className="btn-ghost" onClick={onBack}>← Atrás</button>
        <button
          className="btn-primary"
          onClick={onNext}
          disabled={!config.instrument}
        >
          Generar efectos →
        </button>
      </div>
    </div>
  )
}

export default StepInstrument