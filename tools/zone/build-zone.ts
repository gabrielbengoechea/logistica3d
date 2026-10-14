/**
 * Prepara una zona para el explorador 3D: relieve, imagen satelital y geometría, en metros locales.
 *
 *   pnpm zone montevideo                    # todo, escribe public/zones/montevideo/
 *   pnpm zone montevideo terrain imagery    # solo algunos pasos
 *
 * Fuentes (todas abiertas, leídas directo de AWS bajando solo el recorte necesario):
 * - Relieve: Copernicus DEM GLO-30 (~30 m).
 * - Imagen: Copernicus Sentinel-2 L2A, color verdadero (10 m), una escena sin nubes elegida a mano.
 * - Geometría: Overture Maps (incluye datos de OpenStreetMap): muelles, edificios, calles y vías.
 *
 * Coordenadas de salida: UTM (EPSG de la zona) trasladado al origen de la zona.
 * x = este (m), z = sur (m), así el eje y de three.js queda hacia arriba.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromUrl } from 'geotiff'
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import proj4 from 'proj4'
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// Si el entorno sale a internet por un proxy, fetch lo tiene que usar.
if (process.env.HTTPS_PROXY || process.env.https_proxy) setGlobalDispatcher(new EnvHttpProxyAgent())

type BBox = [number, number, number, number] // oeste, sur, este, norte (grados)

interface Zone {
  name: string
  bbox: BBox
  /** Recorte más chico para edificios (la ciudad entera tiene decenas de miles). */
  buildingsBbox: BBox
  /** Recorte donde el suelo se dibuja con las calles, plazas y parques (más nítido que la imagen satelital). */
  groundBbox: BBox
  /** Origen de las coordenadas locales [lon, lat]. */
  origin: [number, number]
  sentinelScene: string
  demTile: string
  epsg: number
  proj: string
  /** Terminal en metros locales: x, z, giro (rad) y largo del frente de muelle. */
  terminal?: { x: number; z: number; yaw: number; quayLength: number }
}

const ZONES: Record<string, Zone> = {
  montevideo: {
    name: 'montevideo',
    bbox: [-56.32, -34.975, -56.13, -34.855],
    buildingsBbox: [-56.235, -34.912, -56.19, -34.89],
    groundBbox: [-56.24, -34.915, -56.183, -34.886],
    origin: [-56.2125, -34.9015],
    sentinelScene: 'S2B_21HWB_20260208_1_L2A',
    demTile: 'Copernicus_DSM_COG_10_S35_00_W057_00_DEM',
    epsg: 32721,
    proj: '+proj=utm +zone=21 +south +datum=WGS84 +units=m +no_defs',
    // Muelle de Escala de la terminal de contenedores (TCP), medido sobre el contorno del puerto en OpenStreetMap.
    terminal: { x: -693.4, z: 323.1, yaw: 0.5461, quayLength: 632 },
  },
}

const DEM_RES = 30
const IMAGE_RES = 10
const S2_BASE = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs'
const DEM_BASE = 'https://copernicus-dem-30m.s3.amazonaws.com'
const OVERTURE_BASE = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com'
const OVERTURE_RELEASE = 'release/2026-09-23.1'

/** Conversión lon/lat ↔ metros locales y grilla de salida. */
class Local {
  readonly toUtm: proj4.Converter
  readonly e0: number
  readonly n0: number
  readonly emin: number
  readonly emax: number
  readonly nmin: number
  readonly nmax: number

  constructor(zone: Zone) {
    this.toUtm = proj4('EPSG:4326', zone.proj)
    ;[this.e0, this.n0] = this.toUtm.forward(zone.origin)
    const [w, s, e, n] = zone.bbox
    const corners = [
      [w, s],
      [e, s],
      [w, n],
      [e, n],
    ].map((p) => this.toUtm.forward(p))
    this.emin = Math.min(...corners.map((c) => c[0]))
    this.emax = Math.max(...corners.map((c) => c[0]))
    this.nmin = Math.min(...corners.map((c) => c[1]))
    this.nmax = Math.max(...corners.map((c) => c[1]))
  }

  xz(lon: number, lat: number): [number, number] {
    const [e, n] = this.toUtm.forward([lon, lat])
    return [e - this.e0, -(n - this.n0)]
  }

  grid(res: number) {
    return { width: Math.round((this.emax - this.emin) / res), height: Math.round((this.nmax - this.nmin) / res) }
  }

  extent() {
    const r = (v: number) => Math.round(v * 10) / 10
    return { xmin: r(this.emin - this.e0), xmax: r(this.emax - this.e0), zmin: r(-(this.nmax - this.n0)), zmax: r(-(this.nmin - this.n0)) }
  }
}

/** Lectura bilineal de una banda en coordenadas de píxel fraccionarias (centro del píxel en +0.5). */
function bilinear(data: ArrayLike<number>, w: number, h: number, fx: number, fy: number): number {
  const x = Math.max(0, Math.min(w - 1.001, fx))
  const y = Math.max(0, Math.min(h - 1.001, fy))
  const c = Math.floor(x)
  const r = Math.floor(y)
  const u = x - c
  const v = y - r
  const at = (rr: number, cc: number) => data[rr * w + cc]
  return (at(r, c) * (1 - u) + at(r, c + 1) * u) * (1 - v) + (at(r + 1, c) * (1 - u) + at(r + 1, c + 1) * u) * v
}

async function buildTerrain(zone: Zone, local: Local, out: string) {
  const tiff = await fromUrl(`${DEM_BASE}/${zone.demTile}/${zone.demTile}.tif`)
  const image = await tiff.getImage()
  const [lon0, lat0] = image.getOrigin()
  const [dx, dy] = image.getResolution()
  const [w, s, e, n] = zone.bbox
  const pad = 4
  const x0 = Math.max(0, Math.floor((w - lon0) / dx) - pad)
  const x1 = Math.min(image.getWidth(), Math.ceil((e - lon0) / dx) + pad)
  const y0 = Math.max(0, Math.floor((n - lat0) / dy) - pad)
  const y1 = Math.min(image.getHeight(), Math.ceil((s - lat0) / dy) + pad)
  const [band] = (await image.readRasters({ window: [x0, y0, x1, y1] })) as unknown as Float32Array[]
  const ww = x1 - x0
  const hh = y1 - y0

  const toLonLat = proj4(zone.proj, 'EPSG:4326')
  const { width, height } = local.grid(DEM_RES)
  const h = new Float32Array(width * height)
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) {
      const [lon, lat] = toLonLat.forward([local.emin + (c + 0.5) * DEM_RES, local.nmax - (r + 0.5) * DEM_RES])
      let v = bilinear(band, ww, hh, (lon - lon0) / dx - 0.5 - x0, (lat - lat0) / dy - 0.5 - y0)
      // En el DEM el agua queda cerca de 0 m. La bajamos para que quede bajo el plano de agua.
      if (v < 0.5) v = -3
      h[r * width + c] = v
    }

  // Codificación Terrarium (PNG): altura = R*256 + G + B/256 - 32768. Precisión de ~4 mm.
  const png = new PNG({ width, height })
  for (let i = 0; i < h.length; i++) {
    const val = Math.min(65535.996, Math.max(0, h[i] + 32768))
    const R = Math.floor(val / 256)
    const G = Math.floor(val - R * 256)
    const B = Math.floor((val - R * 256 - G) * 256)
    png.data.set([R, G, B, 255], i * 4)
  }
  writeFileSync(join(out, 'terrain.png'), PNG.sync.write(png))
  let min = Infinity
  let max = -Infinity
  for (const v of h) {
    min = Math.min(min, v)
    max = Math.max(max, v)
  }
  console.log(`relieve: ${width}x${height} celdas, ${min.toFixed(1)} a ${max.toFixed(1)} m`)
  return { file: 'terrain.png', encoding: 'terrarium', cols: width, rows: height, res: DEM_RES, min, max }
}

async function buildImagery(zone: Zone, local: Local, out: string) {
  const [, tile, date] = zone.sentinelScene.split('_')
  const utmZone = tile.slice(0, 2)
  const band = tile[2]
  const square = tile.slice(3)
  const url = `${S2_BASE}/${utmZone}/${band}/${square}/${date.slice(0, 4)}/${Number(date.slice(4, 6))}/${zone.sentinelScene}/TCI.tif`
  const image = await (await fromUrl(url)).getImage()
  const [ox, oy] = image.getOrigin()
  const [rx, ry] = image.getResolution()
  const x0 = Math.max(0, Math.floor((local.emin - ox) / rx) - 2)
  const x1 = Math.min(image.getWidth(), Math.ceil((local.emax - ox) / rx) + 2)
  const y0 = Math.max(0, Math.floor((local.nmax - oy) / ry) - 2)
  const y1 = Math.min(image.getHeight(), Math.ceil((local.nmin - oy) / ry) + 2)
  const bands = (await image.readRasters({ window: [x0, y0, x1, y1] })) as unknown as Uint8Array[]
  const ww = x1 - x0
  const hh = y1 - y0

  const { width, height } = local.grid(IMAGE_RES)
  const rgb = new Float32Array(width * height * 3)
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) {
      const fx = (local.emin + (c + 0.5) * IMAGE_RES - ox) / rx - 0.5 - x0
      const fy = (local.nmax - (r + 0.5) * IMAGE_RES - oy) / ry - 0.5 - y0
      for (let k = 0; k < 3; k++) rgb[(r * width + c) * 3 + k] = bilinear(bands[k], ww, hh, fx, fy)
    }

  // El color verdadero de Sentinel-2 sale oscuro: estiramiento por percentiles y un poco de gamma.
  const sample: number[] = []
  for (let i = 0; i < rgb.length; i += 7) if (rgb[i] > 0) sample.push(rgb[i])
  sample.sort((a, b) => a - b)
  const lo = sample[Math.floor(sample.length * 0.01)]
  const hi = sample[Math.floor(sample.length * 0.995)]
  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    for (let k = 0; k < 3; k++) {
      const v = Math.min(1, Math.max(0, (rgb[i * 3 + k] - lo) / (hi - lo))) ** 0.85
      data[i * 4 + k] = Math.round(v * 255)
    }
    data[i * 4 + 3] = 255
  }
  writeFileSync(join(out, 'imagery.jpg'), jpeg.encode({ data, width, height }, 86).data)
  console.log(`imagen: ${width}x${height} px`)
  const day = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
  return { file: 'imagery.jpg', width, height, res: IMAGE_RES, source: `Copernicus Sentinel-2 (${day})` }
}

// ---------- Overture ----------

type Geometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] }
  | { type: string; coordinates: unknown }

interface Row {
  geometry: Geometry
  bbox: { xmin: number; xmax: number; ymin: number; ymax: number }
  [k: string]: unknown
}

async function s3List(prefix: string): Promise<string[]> {
  const keys: string[] = []
  let token: string | null = null
  do {
    const q: string = `?list-type=2&prefix=${encodeURIComponent(prefix)}${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`
    const xml: string = await (await fetch(`${OVERTURE_BASE}/${q}`)).text()
    keys.push(...[...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map((m) => m[1]))
    token = xml.match(/<NextContinuationToken>([^<]*)</)?.[1] ?? null
  } while (token)
  return keys.filter((k) => k.endsWith('.parquet'))
}

/** Filas de Overture dentro del bbox. Usa las estadísticas de cada bloque para no bajar el resto. */
async function overtureRows(theme: string, type: string, bbox: BBox, columns: string[]): Promise<Row[]> {
  const [w, s, e, n] = bbox
  const keys = await s3List(`${OVERTURE_RELEASE}/theme=${theme}/type=${type}/`)
  const rows: Row[] = []
  let next = 0
  const worker = async () => {
    while (next < keys.length) {
      const key = keys[next++]
      const file = await asyncBufferFromUrl({ url: `${OVERTURE_BASE}/${key}` })
      const metadata = await parquetMetadataAsync(file)
      let start = 0
      for (const rg of metadata.row_groups) {
        const count = Number(rg.num_rows)
        const stat = (name: string) => rg.columns.find((c) => c.meta_data?.path_in_schema.join('.') === `bbox.${name}`)?.meta_data?.statistics
        const hit = !(Number(stat('xmin')?.min_value) > e || Number(stat('xmax')?.max_value) < w || Number(stat('ymin')?.min_value) > n || Number(stat('ymax')?.max_value) < s)
        if (hit) {
          const part = (await parquetReadObjects({ file, metadata, columns: [...columns, 'bbox', 'geometry'], rowStart: start, rowEnd: start + count, compressors })) as Row[]
          for (const r of part) if (r.bbox.xmin <= e && r.bbox.xmax >= w && r.bbox.ymin <= n && r.bbox.ymax >= s) rows.push(r)
        }
        start += count
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  console.log(`overture ${theme}/${type}: ${rows.length} elementos`)
  return rows
}

/** Douglas-Peucker sobre una polilínea en metros. */
function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length <= 2) return pts
  const [a, b] = [pts[0], pts[pts.length - 1]]
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  let worst = 0
  let idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]
    const d = len ? Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len : Math.hypot(p[0] - a[0], p[1] - a[1])
    if (d > worst) {
      worst = d
      idx = i
    }
  }
  if (worst <= tol) return [a, b]
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)]
}

const round = (p: [number, number]): [number, number] => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]

function ringLocal(ring: number[][], local: Local, tol = 1): [number, number][] | null {
  const pts = ring.map(([lon, lat]) => local.xz(lon, lat))
  const s = simplify(pts, tol).slice(0, -1)
  return s.length >= 3 ? s.map(round) : null
}

const lineLocal = (line: number[][], local: Local, tol = 2) => simplify(line.map(([lon, lat]) => local.xz(lon, lat)), tol).map(round)

function polygons(g: Geometry): number[][][][] {
  if (g.type === 'Polygon') return [g.coordinates as number[][][]]
  if (g.type === 'MultiPolygon') return g.coordinates as number[][][][]
  return []
}

function lines(g: Geometry): number[][][] {
  if (g.type === 'LineString') return [g.coordinates as number[][]]
  if (g.type === 'MultiLineString') return g.coordinates as number[][][]
  return []
}

function buildingHeight(b: Row): number {
  if (b.height) return Number(b.height)
  if (b.num_floors) return Number(b.num_floors) * 3.2
  return 8
}

const primaryName = (r: Row) => ((r.names as { primary?: string } | null)?.primary ?? null) as string | null

/** Categorías de calle que se dibujan en el suelo (el ancho de cada una lo decide la escena). */
const STREETS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'living_street', 'unclassified', 'pedestrian'])
const GREEN = new Set(['park', 'garden', 'grass', 'pitch', 'playground', 'recreation_ground', 'village_green', 'cemetery', 'meadow', 'golf_course', 'dog_park'])
const PAVED = new Set(['pedestrian', 'plaza', 'square'])

async function buildVectors(zone: Zone, local: Local, out: string) {
  const data = {
    buildings: [] as { h: number; ring: [number, number][] }[],
    piers: [] as { class: string; name: string | null; ring?: [number, number][]; line?: [number, number][] }[],
    areas: [] as { class: string; name: string | null; ring: [number, number][] }[],
    roads: [] as { class: string; pts: [number, number][] }[],
    rails: [] as [number, number][][],
    parks: [] as { kind: 'verde' | 'plaza'; ring: [number, number][] }[],
    ground: null as { xmin: number; xmax: number; zmin: number; zmax: number } | null,
  }

  for (const b of await overtureRows('buildings', 'building', zone.buildingsBbox, ['height', 'num_floors', 'class']))
    for (const poly of polygons(b.geometry)) {
      const ring = ringLocal(poly[0], local)
      if (ring) data.buildings.push({ h: Math.round(buildingHeight(b) * 10) / 10, ring })
    }

  for (const r of await overtureRows('base', 'infrastructure', zone.bbox, ['subtype', 'class', 'names'])) {
    if (!['pier', 'quay', 'breakwater', 'groyne', 'dock'].includes(r.class as string)) continue
    for (const poly of polygons(r.geometry)) {
      const ring = ringLocal(poly[0], local)
      if (ring) data.piers.push({ class: r.class as string, name: primaryName(r), ring })
    }
    for (const ln of lines(r.geometry)) data.piers.push({ class: r.class as string, name: primaryName(r), line: lineLocal(ln, local) })
  }

  for (const r of await overtureRows('base', 'land_use', zone.bbox, ['subtype', 'class', 'names'])) {
    if (!['port', 'harbour', 'industrial', 'container_terminal'].includes(r.class as string) && r.subtype !== 'transportation') continue
    for (const poly of polygons(r.geometry)) {
      const ring = ringLocal(poly[0], local, 3)
      if (ring) data.areas.push({ class: r.class as string, name: primaryName(r), ring })
    }
  }

  // Suelo de la ciudad: calles de todas las categorías, plazas y espacios verdes, solo en el recorte del suelo.
  const g = zone.groundBbox
  const corners = [local.xz(g[0], g[3]), local.xz(g[2], g[1])]
  const r1 = (v: number) => Math.round(v)
  data.ground = { xmin: r1(corners[0][0]), zmin: r1(corners[0][1]), xmax: r1(corners[1][0]), zmax: r1(corners[1][1]) }
  const histogram: Record<string, number> = {}
  for (const r of await overtureRows('base', 'land_use', g, ['subtype', 'class'])) {
    const key = `${r.subtype}/${r.class}`
    histogram[key] = (histogram[key] ?? 0) + 1
    const kind = GREEN.has(r.class as string) ? 'verde' : PAVED.has(r.class as string) ? 'plaza' : null
    if (!kind) continue
    for (const poly of polygons(r.geometry)) {
      const ring = ringLocal(poly[0], local, 0.8)
      if (ring) data.parks.push({ kind, ring })
    }
  }
  console.log('usos del suelo:', histogram)

  const roadHistogram: Record<string, number> = {}
  for (const r of await overtureRows('transportation', 'segment', zone.bbox, ['subtype', 'class']))
    for (const ln of lines(r.geometry)) {
      if (r.subtype === 'rail') data.rails.push(lineLocal(ln, local))
      else if (r.subtype === 'road' && STREETS.has(r.class as string) && r.bbox.xmax >= g[0] && r.bbox.xmin <= g[2] && r.bbox.ymax >= g[1] && r.bbox.ymin <= g[3]) {
        roadHistogram[r.class as string] = (roadHistogram[r.class as string] ?? 0) + 1
        data.roads.push({ class: r.class as string, pts: lineLocal(ln, local, 0.6) })
      }
    }
  console.log('calles:', roadHistogram)

  writeFileSync(join(out, 'vectors.json'), JSON.stringify(data))
  console.log(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])))
  return { file: 'vectors.json', source: 'Overture Maps (incluye datos de OpenStreetMap, ODbL)' }
}

async function main() {
  const [name = 'montevideo', ...rest] = process.argv.slice(2)
  const zone = ZONES[name]
  if (!zone) throw new Error(`Zona desconocida: ${name}. Zonas: ${Object.keys(ZONES).join(', ')}`)
  const steps = new Set(rest.length ? rest : ['terrain', 'imagery', 'vectors'])
  proj4.defs(`EPSG:${zone.epsg}`, zone.proj)
  const local = new Local(zone)
  const out = join(ROOT, 'public', 'zones', zone.name)
  mkdirSync(out, { recursive: true })
  const metaPath = join(out, 'zone.json')
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {}
  Object.assign(meta, { name: zone.name, origin: zone.origin, epsg: zone.epsg, extent: local.extent() })
  if (zone.terminal) meta.terminal = zone.terminal
  if (steps.has('terrain')) {
    meta.terrain = await buildTerrain(zone, local, out)
    const old = join(out, 'terrain.bin')
    if (existsSync(old)) unlinkSync(old)
  }
  if (steps.has('imagery')) meta.imagery = await buildImagery(zone, local, out)
  if (steps.has('vectors')) meta.vectors = await buildVectors(zone, local, out)
  writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  console.log(`listo: ${out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
