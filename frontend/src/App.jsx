import { useEffect, useState } from 'react'

function App() {
  const [estado, setEstado] = useState('Verificando conexión...')

  useEffect(() => {
    fetch('http://127.0.0.1:3001/api/health')
      .then(res => res.json())
      .then(data => setEstado(data.mensaje))
      .catch(() => setEstado('Error: el servidor no responde'))
  }, [])

  return (
    <div className="app">
      <div className="header">
        <div className="dot red" />
        <div className="dot yellow" />
        <div className="dot green" />
        <span className="app-name">Ableton FX</span>
      </div>
      <div className="content">
        <div className="status">{estado}</div>
      </div>
    </div>
  )
}

export default App