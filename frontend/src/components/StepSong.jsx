import { useState } from 'react'

function StepSong({ config, update, onNext, onBack }) {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [searched,  setSearched]  = useState(false)

  const canContinue = config.song.trim().length > 0

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setSearched(true)


    setResults([])
    setSearching(false)
  }

  function selectTrack(track) {
    update('song',      track.name)
    update('artist',    track.artist)
    update('spotifyId', track.id)
    setResults([])
    setSearched(false)
    setQuery('')
  }

  function clearTrack() {
    update('song',      '')
    update('artist',    '')
    update('spotifyId', '')
  }

  return (
    <div className="step">
      <div className="step-eyebrow">Paso 2</div>
      <h2 className="step-title">Selecciona la canción</h2>

      {/* Tabs de método */}
      <div className="method-tabs">
        {[
          { id: 'spotify', label: 'Spotify' },
          { id: 'youtube', label: 'YouTube' },
          { id: 'file',    label: 'Archivo'  }
        ].map(m => (
          <button
            key={m.id}
            className={`method-tab ${config.inputMethod === m.id ? 'active' : ''}`}
            onClick={() => {
              update('inputMethod', m.id)
              update('song', '')
              update('artist', '')
              update('spotifyId', '')
              setResults([])
              setSearched(false)
              setQuery('')
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {config.inputMethod === 'spotify' && (
        <div>
          {config.song ? (
            <div className="track-selected">
              <div className="track-thumb" />
              <div className="track-info">
                <div className="track-name">{config.song}</div>
                <div className="track-artist">{config.artist}</div>
              </div>
              <button className="track-clear" onClick={clearTrack}>✕</button>
            </div>
          ) : (
            <>
              <div className="search-row">
                <div className="search-wrap">
                  <span className="search-icon">⌕</span>
                  <input
                    className="search-input"
                    type="text"
                    placeholder="Artista o nombre de canción..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  />
                </div>
                <button
                  className="btn-search"
                  onClick={handleSearch}
                  disabled={searching || !query.trim()}
                >
                  {searching ? '...' : 'Buscar'}
                </button>
              </div>

              {results.length > 0 && (
                <div className="results-list">
                  {results.map(track => (
                    <div
                      key={track.id}
                      className="result-item"
                      onClick={() => selectTrack(track)}
                    >
                      <div
                        className="result-thumb"
                        style={{ background: track.color || '#1a1a1a' }}
                      />
                      <div className="result-info">
                        <div className="result-name">{track.name}</div>
                        <div className="result-meta">{track.artist} · {track.album}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searched && results.length === 0 && !searching && (
                <div className="search-empty">
                </div>
              )}
            </>
          )}
        </div>
      )}

      {config.inputMethod === 'youtube' && (
        <div className="search-wrap">
          <span className="search-icon">⌕</span>
          <input
            className="search-input"
            type="text"
            placeholder="Pega el link de YouTube aquí..."
            value={config.song}
            onChange={e => update('song', e.target.value)}
          />
        </div>
      )}

      {config.inputMethod === 'file' && (
        <div className="file-drop">
          <input
            type="file"
            accept=".mp3,.wav,.flac"
            id="audio-file"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files[0]
              if (file) {
                update('audioFile', file)
                update('song', file.name)
              }
            }}
          />
          <label htmlFor="audio-file" className="file-drop-label">
            {config.audioFile
              ? `✓  ${config.audioFile.name}`
              : 'Haz clic para seleccionar MP3, WAV o FLAC'}
          </label>
        </div>
      )}

      <div className="nav-row">
        <button className="btn-ghost" onClick={onBack}>← Atrás</button>
        <button className="btn-primary" onClick={onNext} disabled={!canContinue}>
          Siguiente →
        </button>
      </div>
    </div>
  )
}

export default StepSong