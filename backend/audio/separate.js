import { spawn }      from 'child_process'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const HERE      = dirname(fileURLToPath(import.meta.url))
const SEP_DIR   = join(HERE, '..', 'separation')
const SCRIPT    = join(SEP_DIR, 'separate.py')
const TIMEOUT   = 6 * 60 * 1000

function pythonPath() {
  if (process.env.DEMUCS_PYTHON) return process.env.DEMUCS_PYTHON
  const win  = join(SEP_DIR, '.venv', 'Scripts', 'python.exe')
  const unix = join(SEP_DIR, '.venv', 'bin', 'python')
  if (existsSync(win))  return win
  if (existsSync(unix)) return unix
  return null
}

export function separationAvailable() {
  return process.env.DISABLE_SEPARATION !== '1' && pythonPath() !== null
}

export function separateStem(inPath, stem, outPath) {
  const py = pythonPath()
  if (!py) return Promise.reject(new Error('Demucs no está instalado (falta backend/separation/.venv)'))

  return new Promise((resolve, reject) => {
    const proc   = spawn(py, [SCRIPT, inPath, stem, outPath], {
      windowsHide: true,
      env: { ...process.env, HF_HUB_DISABLE_SYMLINKS_WARNING: '1', PYTHONWARNINGS: 'ignore' }
    })
    let   stderr = ''
    const timer  = setTimeout(() => {
      proc.kill()
      reject(new Error('Demucs tardó demasiado'))
    }, TIMEOUT)

    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', err => { clearTimeout(timer); reject(err) })
    proc.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(outPath)
      else reject(new Error(`Demucs falló (código ${code}): ${stderr.trim().split('\n').at(-1) ?? ''}`))
    })
  })
}
