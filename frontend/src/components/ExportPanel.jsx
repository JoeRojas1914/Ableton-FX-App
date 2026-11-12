import { useEffect, useState } from 'react'

const API = 'http://localhost:3001/api/export'

const INSTRUMENT_NAMES = {
  kick: 'Kick', snare: 'Snare', hihat: 'Hi-hats', bass: 'Bajo', synth: 'Synth lead',
  pads: 'Pads', guitar: 'Guitarra', vocals: 'Voz', master: 'Master'
}

function ExportPanel({ chain, config }) {
  const [status,  setStatus]  = useState(null)
  const [busy,    setBusy]    = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    fetch(`${API}/status`)
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus({ available: false, reason: 'No se pudo consultar el backend.' }))
  }, [])

  if (!status) return null

  if (!status.available) {
    return (
      <section className="export">
        <h3 className="export-title">Llevar a Ableton</h3>
        <p className="export-text">{status.reason} Copia los valores a mano mientras tanto.</p>
      </section>
    )
  }

  const name = `${config.song} - ${INSTRUMENT_NAMES[config.instrument] ?? config.instrument}`
  const body = {
    name,
    chain: chain.map(fx => ({ name: fx.name, purpose: fx.purpose, why: fx.why, ableton: fx.ableton }))
  }
  const versionMismatch = Number(config.version) !== status.major

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      const res  = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, save: true })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage({
        ok: true,
        text: `Guardado como “${name}”. En Live búscalo en el navegador: User Library / Presets / Audio Effects / Audio Effect Rack / Ableton FX, y arrástralo a tu pista.` +
          (data.skipped?.length ? ` No se incluyeron: ${data.skipped.join(', ')}.` : '')
      })
    } catch (err) {
      setMessage({ ok: false, text: `No se pudo guardar: ${err.message}` })
    }
    setBusy(false)
  }

  async function download() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const url  = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href     = url
      link.download = `${name}.adg`
      link.click()
      URL.revokeObjectURL(url)
      setMessage({ ok: true, text: 'Descargado. Arrastra el archivo .adg a una pista de audio en Live.' })
    } catch (err) {
      setMessage({ ok: false, text: `No se pudo descargar: ${err.message}` })
    }
    setBusy(false)
  }

  return (
    <section className="export">
      <h3 className="export-title">Llevar a Ableton</h3>
      <p className="export-text">
        Crea un Audio Effect Rack con toda la cadena ya configurada. Cada efecto lleva su explicación en la Info View de Live.
      </p>
      {versionMismatch && (
        <p className="export-text warn">
          El rack se genera con tu {status.live} instalado, así que necesitas Live {status.major} para abrirlo
          (elegiste Live {config.version}).
        </p>
      )}
      <div className="export-actions">
        {status.userLibrary && (
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Generando' : 'Guardar en Ableton'}
          </button>
        )}
        <button className="btn-ghost" onClick={download} disabled={busy}>Descargar .adg</button>
      </div>
      {message && (
        <p className={`export-text ${message.ok ? 'ok' : 'warn'}`} role="status">{message.text}</p>
      )}
    </section>
  )
}

export default ExportPanel
