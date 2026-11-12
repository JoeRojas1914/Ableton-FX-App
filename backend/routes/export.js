import { Router } from 'express'
import { buildRack, exportStatus, safeFileName, saveToUserLibrary } from '../audio/ableton.js'

const router = Router()

router.get('/status', (req, res) => {
  res.json(exportStatus())
})

router.post('/', async (req, res) => {
  const { name = 'Ableton FX', save = false, chain = [] } = req.body ?? {}

  if (!Array.isArray(chain) || !chain.length) {
    return res.status(400).json({ error: 'No hay efectos para exportar' })
  }

  const devices = chain
    .filter(fx => fx?.ableton?.tag)
    .map(fx => ({
      tag:  fx.ableton.tag,
      set:  Array.isArray(fx.ableton.set) ? fx.ableton.set : [],
      name: fx.name,
      annotation: [fx.purpose, ...(Array.isArray(fx.why) ? fx.why : [])].filter(Boolean).join('\n').slice(0, 2000)
    }))

  try {
    const fileName = safeFileName(name)
    const { buffer, skipped, live } = buildRack(devices, fileName)

    if (save) {
      const path = await saveToUserLibrary(buffer, fileName)
      return res.json({ saved: true, path, skipped, live })
    }

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}.adg`)
    res.setHeader('X-Skipped-Devices', encodeURIComponent(skipped.join(', ')))
    res.setHeader('Access-Control-Expose-Headers', 'X-Skipped-Devices, Content-Disposition')
    res.send(buffer)
  } catch (err) {
    console.error('Error exportando:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
