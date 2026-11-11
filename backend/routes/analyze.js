import { Router }  from 'express'
import multer      from 'multer'
import { tmpdir }  from 'os'
import { rm }      from 'fs/promises'
import { mapToAbleton } from '../audio/mapper.js'
import { analyze }      from '../audio/analyzer.js'

const router = Router()
const upload = multer({
  dest:   tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024 }
})

// Acepta JSON (Spotify / YouTube) o multipart/form-data con el campo "audio" (archivo)
router.post('/', upload.single('audio'), async (req, res) => {
  const { inputMethod, song, artist, instrument, license, version } = req.body

  let source, songKey
  if (inputMethod === 'file') {
    if (!req.file) return res.status(400).json({ error: 'No llegó el archivo de audio' })
    source  = { type: 'file', path: req.file.path, name: req.file.originalname }
    songKey = null
  } else if (!song) {
    return res.status(400).json({ error: 'Falta el nombre de la canción o el link' })
  } else if (inputMethod === 'youtube') {
    source  = { type: 'url', url: song }
    songKey = `url|${song}`
  } else {
    source  = { type: 'search', song, artist }
    songKey = `search|${artist ?? ''}|${song}`.toLowerCase()
  }

  try {
    const features = await analyze(source, instrument, songKey)
    const result   = mapToAbleton(features, instrument, { license, version })
    res.json(result)
  } catch (err) {
    console.error('Error en analyze:', err)
    res.status(500).json({ error: `No se pudo analizar: ${err.message}` })
  } finally {
    if (req.file) rm(req.file.path, { force: true }).catch(() => {})
  }
})

export default router
