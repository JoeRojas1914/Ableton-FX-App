import { useState } from 'react'

function StepSong({ config, update, onNext, onBack }) {
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [searched,  setSearched]  = useState(false)
  const [error,     setError]     = useState('')
  const [page,      setPage]      = useState(0)
  const [hasNext,   setHasNext]   = useState(false)
  const [lastQuery, setLastQuery] = useState('')

  const canContinue = config.song.trim().length > 0

  async function search(q, p) {
    if (!q.trim()) return
    setSearching(true)
    setSearched(true)
    setError('')

    try {
      const res  = await fetch(`http://localhost:3001/api/spotify/search?q=${encodeURIComponent(q)}&page=${p}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResults(data.tracks || [])
      setHasNext(Boolean(data.hasNext))
      setPage(p)
      setLastQuery(q)
    } catch {
      setError('No se pudo buscar en Spotify. Revisa que el backend esté corriendo y que backend/.env tenga tus credenciales.')
      setResults([])
      setHasNext(false)
    }

    setSearching(false)
  }

  // Una búsqueda nueva siempre empieza en la primera página
  const handleSearch = () => search(query, 0)
  const goToPage     = p => search(lastQuery, p)

  function selectTrack(track) {
    update('song',       track.name)
    update('artist',     track.artist)
    update('spotifyId',  track.id)
    update('trackImage', track.image)
    setResults([])
    setSearched(false)
    setQuery('')
    setPage(0)
    setHasNext(false)
  }

  function clearTrack() {
    update('song',       '')
    update('artist',     '')
    update('spotifyId',  '')
    update('trackImage', null)
  }

  return (
    <div className="step">
      <h2 className="step-title">¿Qué canción quieres imitar?</h2>
      <p className="step-desc">Búscala en Spotify, pega un link de YouTube o sube el audio.</p>

      <div className="method-tabs" role="tablist">
        {[
          { id: 'spotify', label: 'Spotify' },
          { id: 'youtube', label: 'YouTube' },
          { id: 'file',    label: 'Archivo'  }
        ].map(m => (
          <button
            key={m.id}
            role="tab"
            aria-selected={config.inputMethod === m.id}
            className={`method-tab ${config.inputMethod === m.id ? 'active' : ''}`}
            onClick={() => {
              update('inputMethod', m.id)
              update('song', '')
              update('artist', '')
              update('spotifyId', '')
              update('trackImage', null)
              setResults([])
              setSearched(false)
              setQuery('')
              setPage(0)
              setHasNext(false)
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
              {config.trackImage
                ? <img className="track-thumb" src={config.trackImage} alt={config.song} />
                : <div className="track-thumb" />
              }
              <div className="track-info">
                <div className="track-name">{config.song}</div>
                <div className="track-artist">{config.artist}</div>
              </div>
              <button className="track-clear" onClick={clearTrack}>Cambiar</button>
            </div>
          ) : (
            <>
              <div className="search-row">
                <div className="search-wrap">
                  <input
                    className="search-input"
                    type="search"
                    aria-label="Buscar en Spotify"
                    placeholder="Artista o canción"
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
                  {searching ? 'Buscando' : 'Buscar'}
                </button>
              </div>

              {error && <div className="search-empty error">{error}</div>}

              {results.length > 0 && (
                <div className="results-list">
                  {results.map(track => (
                    <div key={track.id} className="result-item" onClick={() => selectTrack(track)}>
                      {track.image
                        ? <img className="result-thumb" src={track.image} alt={track.album} />
                        : <div className="result-thumb" />
                      }
                      <div className="result-info">
                        <div className="result-name">{track.name}</div>
                        <div className="result-meta">{track.artist} · {track.album}</div>
                      </div>
                      <div className="result-duration">
                        {Math.floor(track.duration / 60)}:{String(track.duration % 60).padStart(2, '0')}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(page > 0 || hasNext) && (
                <div className="pager">
                  <button
                    className="btn-ghost"
                    onClick={() => goToPage(page - 1)}
                    disabled={searching || page === 0}
                  >
                    Anteriores
                  </button>
                  <span className="pager-page">Página {page + 1}</span>
                  <button
                    className="btn-ghost"
                    onClick={() => goToPage(page + 1)}
                    disabled={searching || !hasNext}
                  >
                    Más resultados
                  </button>
                </div>
              )}

              {searched && results.length === 0 && !searching && !error && (
                <div className="search-empty">
                  {page > 0
                    ? 'No hay más resultados. Vuelve a la página anterior o prueba otra búsqueda.'
                    : `Sin resultados para "${lastQuery || query}"`}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {config.inputMethod === 'youtube' && (
        <div className="search-wrap">
          <input
            className="search-input"
            type="url"
            aria-label="Link de YouTube"
            placeholder="https://www.youtube.com/watch?v=…"
            value={config.song}
            onChange={e => update('song', e.target.value)}
          />
        </div>
      )}

      {config.inputMethod === 'file' && (
        <div className="file-drop">
          <input
            type="file" accept=".mp3,.wav,.flac"
            id="audio-file" style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files[0]
              if (file) { update('audioFile', file); update('song', file.name) }
            }}
          />
          <label htmlFor="audio-file" className="file-drop-label">
            {config.audioFile ? config.audioFile.name : 'Elige un MP3, WAV o FLAC'}
          </label>
        </div>
      )}

      <div className="nav-row">
        <button className="btn-ghost" onClick={onBack}>Atrás</button>
        <button className="btn-primary" onClick={onNext} disabled={!canContinue}>
          Continuar
        </button>
      </div>
    </div>
  )
}

export default StepSong