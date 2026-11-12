import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { gzipSync, gunzipSync } from 'zlib'


const TEMPLATES = {
  Eq8:            ['Defaults/Audio Effects/EQ Eight.adv',       'Devices/Audio Effects/EQ Eight'],
  FilterEQ3:      ['Defaults/Audio Effects/EQ Three.adv',       'Devices/Audio Effects/EQ Three'],
  Compressor2:    ['Defaults/Audio Effects/Compressor.adv',     'Devices/Audio Effects/Compressor'],
  GlueCompressor: ['Defaults/Audio Effects/Glue Compressor.adv', 'Devices/Audio Effects/Glue Compressor'],
  Saturator:      ['Defaults/Audio Effects/Saturator.adv',      'Devices/Audio Effects/Saturator'],
  StereoGain:     ['Defaults/Audio Effects/Utility.adv',        'Devices/Audio Effects/Utility'],
  Chorus2:        ['Defaults/Audio Effects/Chorus-Ensemble.adv', 'Devices/Audio Effects/Chorus-Ensemble'],
  Reverb:         ['Defaults/Audio Effects/Reverb.adv',         'Devices/Audio Effects/Reverb'],
  Delay:          ['Defaults/Audio Effects/Delay.adv',          'Devices/Audio Effects/Delay'],
  Limiter:        ['Defaults/Audio Effects/Limiter.adv',        'Devices/Audio Effects/Limiter']
}
const RACK_TEMPLATE = 'Racks/Audio Effect Racks/Mixing & Mastering/MS Rack Template.adg'

// ─── Localizar Live ───────────────────────────────────────────────────────

function versionOf(name) {
  const m = name.match(/Live (\d+)/)
  return m ? Number(m[1]) : 0
}

function findCoreLibrary() {
  if (process.env.ABLETON_CORE_LIBRARY) return { path: process.env.ABLETON_CORE_LIBRARY, live: null }

  const candidates = []
  const winRoot = 'C:/ProgramData/Ableton'
  if (existsSync(winRoot)) {
    for (const d of readdirSync(winRoot)) {
      const p = join(winRoot, d, 'Resources', 'Core Library')
      if (/^Live \d+/.test(d) && existsSync(p)) candidates.push({ path: p, live: d })
    }
  }
  const macRoot = '/Applications'
  if (existsSync(macRoot)) {
    for (const d of readdirSync(macRoot)) {
      const p = join(macRoot, d, 'Contents', 'App-Resources', 'Core Library')
      if (/^Ableton Live \d+/.test(d) && existsSync(p)) candidates.push({ path: p, live: d.replace(/^Ableton /, '').replace(/\.app$/, '') })
    }
  }
  candidates.sort((a, b) => versionOf(b.live) - versionOf(a.live))
  return candidates[0] ?? null
}

function findUserLibrary() {
  if (process.env.ABLETON_USER_LIBRARY) return process.env.ABLETON_USER_LIBRARY
  const p = join(homedir(), 'Documents', 'Ableton', 'User Library')
  return existsSync(p) ? p : null
}

const readGz = p => gunzipSync(readFileSync(p)).toString('utf8')

function firstPreset(dir) {
  if (!existsSync(dir)) return null
  const entries = readdirSync(dir).sort()
  for (const e of entries) {
    const p = join(dir, e)
    if (e.endsWith('.adv')) return p
  }
  for (const e of entries) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      const found = firstPreset(p)
      if (found) return found
    }
  }
  return null
}

let cached = null

function loadTemplates() {
  if (cached) return cached
  const lib = findCoreLibrary()
  if (!lib) return (cached = { available: false, reason: 'No se encontró una instalación de Ableton Live.' })

  const devices = {}
  for (const [tag, [def, folder]] of Object.entries(TEMPLATES)) {
    const file = existsSync(join(lib.path, def)) ? join(lib.path, def) : firstPreset(join(lib.path, folder))
    if (!file) continue
    const xml   = readGz(file)
    const start = xml.indexOf(`<${tag}`)
    const end   = xml.lastIndexOf(`</${tag}>`)
    if (start >= 0 && end > start) devices[tag] = xml.slice(start, end + tag.length + 3)
  }

  const rackPath = join(lib.path, RACK_TEMPLATE)
  if (!existsSync(rackPath)) {
    return (cached = { available: false, reason: 'Tu instalación de Live no incluye la plantilla de Audio Effect Rack.' })
  }

  const rack   = readGz(rackPath)
  const header = rack.match(/<Ableton [^>]*>/)[0]
  const major  = Number(header.match(/MinorVersion="(\d+)/)?.[1] ?? 0)

  return (cached = {
    available: true,
    live:      lib.live,
    major,
    rack,
    devices,
    userLibrary: findUserLibrary()
  })
}

export function exportStatus() {
  const t = loadTemplates()
  return t.available
    ? { available: true, live: t.live, major: t.major, devices: Object.keys(t.devices), userLibrary: Boolean(t.userLibrary) }
    : { available: false, reason: t.reason }
}

// ─── Edición del XML ──────────────────────────────────────────────────────

const xmlEscape = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/\n/g, '&#10;')

function formatValue(v) {
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(Math.round(v * 1e6) / 1e6)
}

function findTag(xml, name, from, to) {
  const re = new RegExp(`<${name.replace(/\./g, '\\.')}[ >/]`, 'g')
  re.lastIndex = from
  const m = re.exec(xml)
  return m && m.index < to ? m.index : -1
}

// path "Bands.0/ParameterA/Freq": baja por los elementos y cambia el <Manual Value>
// del ultimo, o su atributo Value si es un elemento simple (<Name Value="..." />)
function setParam(xml, path, value) {
  const segs = path.split('/')
  let from = 0, to = xml.length

  for (const seg of segs.slice(0, -1)) {
    const i = findTag(xml, seg, from, to)
    if (i < 0) throw new Error(`no existe ${path}`)
    const close = xml.indexOf(`</${seg}>`, i)
    from = i
    to   = close > 0 ? close : to
  }

  const last = segs.at(-1)
  const i = findTag(xml, last, from, to)
  if (i < 0) throw new Error(`no existe ${path}`)

  const tagEnd = xml.indexOf('>', i)
  const val = formatValue(value)

  if (xml[tagEnd - 1] === '/') {
    // elemento simple
    const open = xml.slice(i, tagEnd + 1)
    return xml.slice(0, i) + open.replace(/Value="[^"]*"/, `Value="${val}"`) + xml.slice(tagEnd + 1)
  }

  const close  = xml.indexOf(`</${last}>`, tagEnd)
  const manual = xml.indexOf('<Manual Value="', tagEnd)
  if (manual < 0 || manual > close) throw new Error(`${path} no tiene valor Manual`)
  const vStart = manual + '<Manual Value="'.length
  const vEnd   = xml.indexOf('"', vStart)
  return xml.slice(0, vStart) + val + xml.slice(vEnd)
}

function setSimple(xml, name, value) {
  return xml.replace(new RegExp(`<${name} Value="[^"]*" />`), `<${name} Value="${xmlEscape(value)}" />`)
}

const EMPTY_FILEREF = `<FileRef>
	<RelativePathType Value="0" />
	<RelativePath Value="" />
	<Path Value="" />
	<Type Value="2" />
	<LivePackName Value="" />
	<LivePackId Value="" />
	<OriginalFileSize Value="0" />
	<OriginalCrc Value="0" />
	<SourceHint Value="" />
</FileRef>`

function devicePreset(tag, deviceXml, id) {
  return `<AbletonDevicePreset Id="${id}">
	<OverwriteProtectionNumber Value="3077" />
	<Device>
${deviceXml}
	</Device>
	<PresetRef>
		<AbletonDefaultPresetRef Id="0">
			${EMPTY_FILEREF}
			<DeviceId Name="${tag}" />
		</AbletonDefaultPresetRef>
	</PresetRef>
</AbletonDevicePreset>`
}

// ─── Generación ───────────────────────────────────────────────────────────

const VALID_PATH = /^[\w.]+(\/[\w.]+)*$/

// devices: [{ tag, set: [[path, value]], name, annotation }]
export function buildRack(devices, rackName) {
  const t = loadTemplates()
  if (!t.available) throw new Error(t.reason)

  const presets = []
  const skipped = []

  for (const d of devices) {
    const template = t.devices[d?.tag]
    if (!template) { skipped.push(d?.name ?? d?.tag); continue }

    let xml = template.replace(new RegExp(`^<${d.tag}( Id="\\d+")?`), `<${d.tag} Id="0"`)
    for (const [path, value] of d.set ?? []) {
      if (!VALID_PATH.test(path) || !['number', 'boolean'].includes(typeof value) || Number.isNaN(value)) continue
      try { xml = setParam(xml, path, value) } catch (err) { console.warn(`Export ${d.tag}: ${err.message}`) }
    }
    xml = setSimple(xml, 'UserName', '')
    if (d.annotation) xml = setSimple(xml, 'Annotation', d.annotation)

    presets.push(devicePreset(d.tag, xml, presets.length))
  }

  if (!presets.length) throw new Error('Ninguno de los efectos se pudo exportar con tu versión de Live.')

  let rack = t.rack
  // un solo branch con nuestra cadena
  const bStart = rack.indexOf('<BranchPresets>')
  const bEnd   = rack.indexOf('</BranchPresets>') + '</BranchPresets>'.length
  const first  = rack.slice(bStart, bEnd)
  const branch = first.slice(first.indexOf('<AudioEffectBranchPreset Id="0">'), first.indexOf('</AudioEffectBranchPreset>') + '</AudioEffectBranchPreset>'.length)
  const dStart = branch.indexOf('<DevicePresets>') + '<DevicePresets>'.length
  const dEnd   = branch.indexOf('</DevicePresets>')
  const newBranch = setSimple(branch.slice(0, dStart) + '\n' + presets.join('\n') + '\n' + branch.slice(dEnd), 'Name', 'Ableton FX')
  rack = rack.slice(0, bStart) + `<BranchPresets>\n${newBranch}\n</BranchPresets>` + rack.slice(bEnd)

  // nombre del rack y sin referencias al preset original
  rack = setSimple(rack, 'UserName', rackName)
  rack = rack.replace(/<RelativePath Value="[^"]*MS Rack[^"]*" \/>/g, '<RelativePath Value="" />')
             .replace(/<Path Value="[^"]*MS Rack[^"]*" \/>/g, '<Path Value="" />')

  return { buffer: gzipSync(Buffer.from(rack, 'utf8')), skipped, live: t.live }
}

export function safeFileName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Ableton FX'
}

// Guarda el rack en la User Library para que aparezca en el navegador de Live
export async function saveToUserLibrary(buffer, fileName) {
  const t = loadTemplates()
  if (!t.userLibrary) throw new Error('No se encontró tu User Library de Ableton.')
  const dir = join(t.userLibrary, 'Presets', 'Audio Effects', 'Audio Effect Rack', 'Ableton FX')
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${fileName}.adg`)
  await writeFile(path, buffer)
  return path
}
