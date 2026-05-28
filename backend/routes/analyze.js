import { Router }            from 'express'
import { mapToAbleton }      from '../audio/mapper.js'
import { analyzeFromSearch, analyzeFromURL } from '../audio/analyzer.js'

const router = Router()
const cache  = new Map()

router.post('/', async (req, res) => {
  const { inputMethod, song, artist, instrument } = req.body

  if (!song) {
    return res.status(400).json({ error: 'Falta el nombre de la canción o el link' })
  }

  const cacheKey = `${inputMethod}-${song}-${instrument}`

  try {
    let features = null

    if (cache.has(cacheKey)) {
      console.log('Caché hit:', song)
      features = cache.get(cacheKey)
    } else if (inputMethod === 'youtube') {
      features = await analyzeFromURL(song)
    } else {
      features = await analyzeFromSearch(song, artist)
    }

    cache.set(cacheKey, features)
    setTimeout(() => cache.delete(cacheKey), 60 * 60 * 1000)

    const result  = mapToAbleton(features, instrument)
    result.source = features.source
    res.json(result)

  } catch (err) {
    console.error('Error en analyze:', err.message)
    res.status(500).json({ error: `No se pudo analizar: ${err.message}` })
  }
})

export default router