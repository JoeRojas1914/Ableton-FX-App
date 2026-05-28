import express        from 'express'
import cors           from 'cors'
import dotenv         from 'dotenv'
import spotifyRouter  from './routes/spotify.js'
import analyzeRouter  from './routes/analyze.js'

dotenv.config()

const app  = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.use('/api/spotify',  spotifyRouter)
app.use('/api/analyze',  analyzeRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mensaje: 'Servidor de Ableton FX corriendo' })
})

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
})