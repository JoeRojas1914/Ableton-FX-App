import { useState, useEffect } from 'react'

function Results({ config, onRestart }) {
  const [loading, setLoading] = useState(true)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState('')

  useEffect(() => {
  async function analyze() {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('http://localhost:3001/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputMethod: config.inputMethod,
          song:        config.song,
          artist:      config.artist,
          instrument:  config.instrument,
          license:     config.license,
          version:     config.version
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
    } catch (err) {
      setError(err.message || 'No se pudo analizar la canción')
    }
    setLoading(false)
  }

  analyze()
},  [config.inputMethod, config.song, config.artist, config.instrument, config.license, config.version])

  if (loading) return (
    <div className="step">
      <div className="step-eyebrow">Paso 4</div>
      <h2 className="step-title">Analizando...</h2>
      <div className="loading-bar">
        <div className="loading-track" />
      </div>
      <p className="step-desc" style={{ marginTop: '12px' }}>
        Calculando parámetros para {config.instrument} · {config.song}
      </p>
    </div>
  )


  if (error) return (
    <div className="step">
      <div className="step-eyebrow">Paso 4</div>
      <h2 className="step-title">Error</h2>
      <div className="error-box">{error}</div>
      <div className="nav-row">
        <button className="btn-ghost" onClick={onRestart}>← Volver al inicio</button>
      </div>
    </div>
  )

  const { chain, meta } = result

  return (
    <div className="step">
      <div className="step-eyebrow">Paso 4</div>
      <h2 className="step-title">Cadena de efectos</h2>

      <div className="song-summary">
        {config.trackImage && (
          <img className="song-cover" src={config.trackImage} alt={config.song} />
        )}
        <div>
          <div className="song-title">{config.song}</div>
          <div className="song-artist">{config.artist}</div>
        </div>
      </div>

      <div className="analysis-bar">
        <div className="analysis-item">
          <div className="analysis-val">{meta.bpm}</div>
          <div className="analysis-key">BPM</div>
        </div>
        <div className="analysis-item">
          <div className="analysis-val">{meta.key}</div>
          <div className="analysis-key">Tonalidad</div>
        </div>
        <div className="analysis-item">
          <div className="analysis-val">{meta.energy}%</div>
          <div className="analysis-key">Energía</div>
        </div>
        <div className="analysis-item">
          <div className="analysis-val">{meta.loudness}</div>
          <div className="analysis-key">Loudness</div>
        </div>
      </div>

      <div className="fx-chain">
        {chain.map((fx, i) => (
          <div key={i} className="fx-card">
            <div className="fx-header">
              <span className="fx-order">{fx.order}</span>
              <span className="fx-name">{fx.name}</span>
            </div>
            <div className="fx-purpose">{fx.purpose}</div>
            <div className="params-grid">
              {fx.params.map((p, j) => (
                <div key={j} className="param">
                  <div className="param-key">{p.key}</div>
                  <div className="param-val">{p.val}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="nav-row">
        <button className="btn-ghost" onClick={onRestart}>← Nueva búsqueda</button>
      </div>
    </div>
  )
}

export default Results