const VERSIONS = ['10', '11', '12']

const LICENSES = [
  { id: 'intro',    label: 'Intro',    desc: 'Efectos básicos' },
  { id: 'standard', label: 'Standard', desc: 'Efectos completos' },
  { id: 'suite',    label: 'Suite',    desc: 'Todo + Max for Live' }
]

function StepSetup({ config, update, onNext }) {
  return (
    <div className="step">
      <div className="step-eyebrow">Paso 1</div>
      <h2 className="step-title">Configura tu Ableton</h2>
      <p className="step-desc">Solo verás los efectos disponibles en tu versión y licencia</p>

      <div className="field-label">Versión</div>
      <div className="card-row">
        {VERSIONS.map(v => (
          <div
            key={v}
            className={`sel-card ${config.version === v ? 'active' : ''}`}
            onClick={() => update('version', v)}
          >
            <div className="sel-card-title">Live {v}</div>
          </div>
        ))}
      </div>

      <div className="field-label">Licencia</div>
      <div className="card-row">
        {LICENSES.map(l => (
          <div
            key={l.id}
            className={`sel-card ${config.license === l.id ? 'active' : ''}`}
            onClick={() => update('license', l.id)}
          >
            <div className="sel-card-title">{l.label}</div>
            <div className="sel-card-desc">{l.desc}</div>
          </div>
        ))}
      </div>

      <div className="nav-row" style={{ marginTop: '24px' }}>
        <button className="btn-primary" onClick={onNext}>
          Siguiente →
        </button>
      </div>
    </div>
  )
}

export default StepSetup