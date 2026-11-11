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
    <div className="step" aria-busy="true">
      <h2 className="step-title">Analizando {config.song}</h2>
      <div className="loading-meter" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <p className="step-desc">
        Descargamos el audio, aislamos el instrumento y lo medimos. La primera vez tarda entre 30 y 90 segundos.
      </p>
    </div>
  )

  if (error) return (
    <div className="step">
      <h2 className="step-title">No se pudo analizar la canción</h2>
      <div className="error-box" role="alert">{error}</div>
      <div className="nav-row">
        <button className="btn-ghost" onClick={onRestart}>Volver al inicio</button>
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
    <div className="step wide">
      <div className="song-summary">
        {config.trackImage && (
          <img className="song-cover" src={config.trackImage} alt="" />
        )}
        <div>
          <h2 className="song-title">{config.song}</h2>
          {config.artist && <div className="song-artist">{config.artist}</div>}
        </div>
      </div>

      <div className="readout">
        {metrics.map(m => (
          <div key={m.label} className="readout-item">
            <div className="readout-val">{m.val}</div>
            <div className="readout-key">{m.label}</div>
          </div>
        ))}
      </div>

      <p className="analyzed-line">
        Medido sobre: {meta.analyzed.toLowerCase()}
        {meta.title && meta.title !== config.song && <> de “{meta.title}”</>}
      </p>

      {notes.length > 0 && (
        <ul className="notes">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}

      <section className="rack" aria-label="Cadena de efectos, en orden de señal">
        {chain.map(fx => (
          <article key={fx.name} className="device">
            <header className="device-head">
              <span className="device-led" aria-hidden="true" />
              <h3 className="device-name">{fx.name}</h3>
            </header>
            <p className="device-purpose">{fx.purpose}</p>
            <ul className="params">
              {fx.params.map(p => (
                <li key={p.key} className="param">
                  <div className="param-key">{p.key}</div>
                  <div className="param-val">{p.val}</div>
                </li>
              ))}
            </ul>
            {fx.why?.length > 0 && (
              <details className="device-why">
                <summary>Por qué estos valores</summary>
                <ul>
                  {fx.why.map((w, j) => <li key={j}>{w}</li>)}
                </ul>
              </details>
            )}
          </article>
        ))}
      </section>

      <div className="nav-row">
        <button className="btn-ghost" onClick={onRestart}>Analizar otra canción</button>
      </div>
    </div>
  )
}

export default Results