# Ableton FX App

Aplicación web que analiza canciones y genera configuraciones de efectos optimizadas para **Ableton Live**, adaptadas al instrumento, versión y licencia del usuario.

## ¿Cómo funciona?

El usuario sigue un flujo de 4 pasos:

1. **Configuración** — Selecciona la versión de Ableton Live (10/11/12) y el tipo de licencia (Lite/Intro/Standard/Suite). Lite e Intro no traen EQ Eight ni Glue Compressor, así que su cadena usa EQ Three
2. **Canción** — Busca una canción por Spotify, ingresa una URL de YouTube, o sube un archivo de audio
3. **Instrumento** — Elige el instrumento al que aplicar los efectos (kick, bajo, voces, master, etc.)
4. **Resultados** — La app descarga el audio, lo analiza y genera una cadena de efectos con parámetros personalizados

### Cómo se analiza

1. Se descarga el audio en estéreo a 44.1 kHz y se elige la ventana de 45 s más fuerte (normalmente el estribillo).
2. **Demucs** aísla el stem del instrumento (batería, bajo, voz u otros). Para kick, snare y hi-hats, además se filtra la banda de cada uno dentro del stem de batería.
3. Sobre el instrumento aislado se mide:
   - **Espectro** en bandas de 1/6 de octava → cortes, resonancias e inclinación para el EQ Eight
   - **Crest factor** (pico/RMS) y loudness **LUFS** (ITU-R BS.1770) → cuánta compresión tiene
   - **Ataque y decay** de cada golpe → attack y release del compresor
   - **Cola** después de cada nota (RT60 y relación cola/directo) → decay y dry/wet de la reverb
   - **Ancho estéreo** (lado/centro) → Utility y chorus
4. Tempo (autocorrelación del spectral flux) y tonalidad (chroma de picos espectrales + Krumhansl) se miden sobre la mezcla.

La cadena generada incluye, según lo medido y tu licencia: **EQ Eight, Compressor, Glue Compressor, Saturator, Utility, Chorus, Reverb, Delay y Limiter**. Cada efecto explica por qué tiene esos valores.

Si Demucs no está instalado o falla, la app analiza la mezcla completa y lo indica en los resultados.

## Stack tecnológico

### Frontend
- [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/)
- CSS personalizado

### Backend
- [Node.js](https://nodejs.org/) + [Express 4](https://expressjs.com/)
- Análisis de audio propio en JavaScript (FFT, filtros, LUFS) en `backend/audio/dsp.js`
- [Demucs](https://github.com/facebookresearch/demucs) (Python) — separación de stems
- [yt-dlp-exec](https://github.com/nicholasgasior/yt-dlp-exec) + [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) — búsqueda, descarga y conversión de audio
- [multer](https://github.com/expressjs/multer) — subida de archivos de audio
- [Spotify Web API](https://developer.spotify.com/documentation/web-api) — búsqueda de canciones
- Caché en memoria del audio y los stems (1 hora, últimas 3 canciones)

## Estructura del proyecto

```
Ableton FX App/
├── backend/
│   ├── server.js            # Punto de entrada Express (puerto 3001)
│   ├── routes/
│   │   ├── analyze.js       # POST /api/analyze
│   │   └── spotify.js       # GET /api/spotify/search
│   ├── audio/
│   │   ├── analyzer.js      # Orquesta el análisis: ventana, stems, mediciones
│   │   ├── dsp.js           # FFT, filtros biquad, LUFS, envolventes
│   │   ├── wav.js           # Lectura/escritura de WAV
│   │   ├── separate.js      # Llama a Demucs (Python)
│   │   ├── mapper.js        # Mediciones → parámetros de Ableton
│   │   ├── instruments.js   # Perfiles por instrumento
│   │   ├── spotify.js       # Integración con Spotify API
│   │   ├── youtube.js       # Búsqueda, descarga y decodificación de audio
│   │   └── licencias.js     # Efectos disponibles por tipo de licencia
│   └── separation/
│       └── separate.py      # Script de separación con Demucs
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

- **Node.js** v18+
- **Python** 3.10+ (para Demucs; opcional pero muy recomendado)
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

### Demucs (separación de instrumentos)

Se instala en un entorno virtual dentro de `backend/separation/.venv` (~1 GB con PyTorch CPU):

```bash
cd backend
python -m venv separation/.venv
# Windows
separation\.venv\Scripts\python.exe -m pip install demucs soundfile
# macOS / Linux
separation/.venv/bin/python -m pip install demucs soundfile
```

La primera separación descarga el modelo `htdemucs` (~80 MB). Cada separación tarda ~20 s en CPU.

Variables opcionales en `backend/.env`:
- `DEMUCS_PYTHON` — ruta a otro intérprete de Python con Demucs instalado
- `DISABLE_SEPARATION=1` — desactiva la separación (analiza la mezcla completa)

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

## Exportar a Ableton

Desde la pantalla de resultados se genera un **Audio Effect Rack (`.adg`)** con toda la cadena configurada:

- **Guardar en Ableton** lo escribe en `User Library/Presets/Audio Effects/Audio Effect Rack/Ableton FX/`, así aparece en el navegador de Live.
- **Descargar .adg** baja el archivo para arrastrarlo a una pista.

Cada dispositivo lleva su explicación en el campo de Info de Live. El rack se arma con los presets de tu instalación de Live como plantilla (se buscan en `C:\ProgramData\Ableton\Live */Resources/Core Library` o `/Applications/Ableton Live *.app`), así que solo abre en la misma versión mayor de Live que tienes instalada.

Variables opcionales en `backend/.env`:
- `ABLETON_CORE_LIBRARY` — ruta a la Core Library si Live está en otro lugar
- `ABLETON_USER_LIBRARY` — ruta a tu User Library si la moviste

## API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/health` | Estado del servidor |
| `GET` | `/api/spotify/search?q=<query>` | Búsqueda de canciones en Spotify |
| `POST` | `/api/analyze` | Analiza audio y genera la cadena de efectos |
| `GET` | `/api/export/status` | Si se encontró Live y qué dispositivos se pueden exportar |
| `POST` | `/api/export` | Genera el rack `.adg` (`save: true` lo guarda en la User Library) |

### Body de `/api/analyze`

JSON para Spotify (`inputMethod: "spotify"`, busca la canción en YouTube) o YouTube (`inputMethod: "youtube"`, `song` es el link):

```json
{
  "inputMethod": "spotify",
  "song": "nombre de la canción",
  "artist": "nombre del artista",
  "instrument": "kick",
  "version": "12",
  "license": "suite"
}
```

Para un archivo, `multipart/form-data` con los mismos campos, `inputMethod=file` y el audio en el campo `audio`.

La respuesta incluye `chain` (efectos con `params` y `why`), `meta` (BPM, tonalidad, LUFS, crest, ancho estéreo, qué se analizó) y `notes` (avisos).

## Construcción para producción

```bash
cd frontend
npm run build
# Salida en frontend/dist/
```

El backend no requiere build; se ejecuta directamente con Node.
