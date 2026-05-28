import { Router }       from 'express'
import { searchTracks } from '../audio/spotify.js'

const router = Router()

router.get('/search', async (req, res) => {
  const { q } = req.query

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Escribe al menos 2 caracteres' })
  }

  try {
    const tracks = await searchTracks(q)
    res.json({ tracks })
  } catch (err) {
    console.error('Error Spotify:', err.message)
    res.status(500).json({ error: 'Error al buscar en Spotify' })
  }
})

export default router   