# Ableton FX App

Aplicación web que analiza canciones y genera configuraciones de efectos optimizadas para **Ableton Live**, adaptadas al instrumento, versión y licencia del usuario.

## ¿Cómo funciona?

El usuario sigue un flujo de 4 pasos:

1. **Configuración** — Selecciona la versión de Ableton Live (10/11/12) y el tipo de licencia (Intro/Standard/Suite)
2. **Canción** — Busca una canción por Spotify, ingresa una URL de YouTube, o sube un archivo de audio
3. **Instrumento** — Elige el instrumento al que aplicar los efectos (kick, bajo, voces, master, etc.)
4. **Resultados** — La app descarga el audio, lo analiza y genera una cadena de efectos con parámetros personalizados

La cadena de efectos generada incluye: **EQ Eight → Compresor → Reverb → Delay**, con parámetros calculados en base a BPM, energía, tonalidad y el instrumento seleccionado.

## Stack tecnológico

### Frontend
- [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/)
- CSS personalizado

### Backend
- [Node.js](https://nodejs.org/) + [Express 4](https://expressjs.com/)
- [Meyda](https://meyda.js.org/) — extracción de características de audio
- [yt-dlp-exec](https://github.com/nicholasgasior/yt-dlp-exec) + [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) — descarga y conversión de audio de YouTube
- [Spotify Web API](https://developer.spotify.com/documentation/web-api) — búsqueda de canciones
- [node-cache](https://github.com/node-cache/node-cache) — caché en memoria (TTL de 1 hora)

## Estructura del proyecto

```
Ableton FX App/
├── backend/
│   ├── server.js            # Punto de entrada Express (puerto 3001)
│   ├── routes/
│   │   ├── analyze.js       # POST /api/analyze
│   │   └── spotify.js       # GET /api/spotify/search
│   └── audio/
│       ├── analyzer.js      # Parseo WAV, detección de BPM y tonalidad
│       ├── mapper.js        # Mapeo de características a parámetros Ableton
│       ├── instruments.js   # Perfiles por instrumento
│       ├── spotify.js       # Integración con Spotify API
│       ├── youtube.js       # Búsqueda y descarga desde YouTube
│       └── licencias.js     # Efectos disponibles por tipo de licencia
└── frontend/
    └── src/
        ├── App.jsx
        └── components/
            ├── StepSetup.jsx       # Paso 1: Versión y licencia
            ├── StepSong.jsx        # Paso 2: Selección de canción
            ├── StepInstrument.jsx  # Paso 3: Instrumento
            └── Results.jsx         # Paso 4: Resultados
```

## Requisitos previos

- **Node.js** v16+
- Las dependencias `ffmpeg-static` y `yt-dlp-exec` instalan FFmpeg y yt-dlp automáticamente

## Instalación

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

## Variables de entorno

Crea el archivo `backend/.env` con las credenciales de la [Spotify Web API](https://developer.spotify.com/dashboard):

```env
PORT=3001
SPOTIFY_CLIENT_ID=tu_client_id
SPOTIFY_CLIENT_SECRET=tu_client_secret
```

## Ejecutar en desarrollo

Abre dos terminales:

```bash
# Terminal 1 — Backend
cd backend
npm run dev
# → http://localhost:3001
```

```bash
# Terminal 2 — Frontend
cd frontend
npm run dev
# → http://localhost:5173
```

## API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/health` | Estado del servidor |
| `GET` | `/api/spotify/search?q=<query>` | Búsqueda de canciones en Spotify |
| `POST` | `/api/analyze` | Analiza audio y genera la cadena de efectos |

### Body de `/api/analyze`

```json
{
  "inputMethod": "youtube",
  "song": "nombre de la canción",
  "artist": "nombre del artista",
  "instrument": "kick",
  "version": "12",
  "license": "Suite"
}
```

## Construcción para producción

```bash
cd frontend
npm run build
# Salida en frontend/dist/
```

El backend no requiere build; se ejecuta directamente con Node.
