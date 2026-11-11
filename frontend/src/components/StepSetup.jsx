const VERSIONS = ['10', '11', '12']

const LICENSES = [
  { id: 'intro',    label: 'Intro',    desc: 'Efectos básicos' },
  { id: 'standard', label: 'Standard', desc: 'Suma Glue, Chorus, Saturator y más' },
  { id: 'suite',    label: 'Suite',    desc: 'Todos los efectos y Max for Live' }
]

function StepSetup({ config, update, onNext }) {
  return (
    <div className="step">
      <h2 className="step-title">¿Qué Ableton usas?</h2>
      <p className="step-desc">Solo te vamos a sugerir efectos que tengas instalados.</p>

      <div className="field-label">Versión</div>
      <div className="card-row" role="radiogroup" aria-label="Versión">
        {VERSIONS.map(v => (
          <button
            key={v}
            role="radio"
            aria-checked={config.version === v}
            className={`sel-card ${config.version === v ? 'active' : ''}`}
            onClick={() => update('version', v)}
          >
            <div className="sel-card-title">Live {v}</div>
          </button>
        ))}
      </div>

      <div className="field-label">Licencia</div>
      <div className="card-row" role="radiogroup" aria-label="Licencia">
        {LICENSES.map(l => (
          <button
            key={l.id}
            role="radio"
            aria-checked={config.license === l.id}
            className={`sel-card ${config.license === l.id ? 'active' : ''}`}
            onClick={() => update('license', l.id)}
          >
            <div className="sel-card-title">{l.label}</div>
            <div className="sel-card-desc">{l.desc}</div>
          </button>
        ))}
      </div>

      <div className="nav-row">
        <button className="btn-primary" onClick={onNext}>Continuar</button>
      </div>
    </div>
  )
}

export default StepSetup