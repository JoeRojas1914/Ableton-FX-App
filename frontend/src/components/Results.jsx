function Results({ config, onRestart }) {
  return (
    <div className="step">
      <div className="step-eyebrow">Paso 4</div>
      <h2 className="step-title">Cadena de efectos</h2>

      <div className="summary-pills">
        <span className="pill">Live {config.version}</span>
        <span className="pill">{config.license}</span>
        <span className="pill">{config.genre}</span>
        <span className="pill">{config.song}</span>
        <span className="pill">{config.instrument}</span>
      </div>

      <div className="fx-placeholder">
      </div>

      <button className="btn-ghost" onClick={onRestart}>
        ← Nueva búsqueda
      </button>
    </div>
  )
}

export default Results