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
      const fields = {
        inputMethod: config.inputMethod,
        song:        config.song,
        artist:      config.artist,
        instrument:  config.instrument,
        license:     config.license,
        version:     config.version
      }

      let options
      if (config.inputMethod === 'file' && config.audioFile) {
        const form = new FormData()
        Object.entries(fields).forEach(([k, v]) => form.append(k, v ?? ''))
        form.append('audio', config.audioFile)
        options = { method: 'POST', body: form }
      } else {
        options = {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(fields)
        }
      }

      const res  = await fetch('http://localhost:3001/api/analyze', options)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
    } catch (err) {
      setError(err.message || 'No se pudo analizar la canción')
    }
    setLoading(false)
  }

  analyze()
},  [config.inputMethod, config.song, config.artist, config.instrument, config.license, config.version, config.audioFile])

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
      <p className="step-desc">
        Descargando audio, aislando el instrumento y midiéndolo. Puede tardar 30–90 segundos.
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

  const { chain, meta, notes = [] } = result

  const metrics = [
    { label: 'BPM',       val: meta.bpm },
    { label: 'Tonalidad', val: meta.key },
    { label: 'Loudness',  val: meta.loudness },
    { label: 'Crest',     val: meta.crest },
    { label: 'Estéreo',   val: meta.width }
  ]

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
          {meta.title && meta.title !== config.song && (
            <div className="song-source">Audio analizado: {meta.title}</div>
          )}
        </div>
      </div>

      <div className="analyzed-badge">{meta.analyzed}</div>

      <div className="analysis-bar">
        {metrics.map(m => (
          <div key={m.label} className="analysis-item">
            <div className="analysis-val">{m.val}</div>
            <div className="analysis-key">{m.label}</div>
          </div>
        ))}
      </div>

      {notes.length > 0 && (
        <ul className="notes-box">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}

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
            {fx.why?.length > 0 && (
              <details className="fx-why">
                <summary>¿Por qué estos valores?</summary>
                <ul>
                  {fx.why.map((w, j) => <li key={j}>{w}</li>)}
                </ul>
              </details>
            )}
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