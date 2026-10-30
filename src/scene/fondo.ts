/**
 * Fondo liviano (ciudad y relieve) para reservar el presupuesto de GPU a la terminal.
 *
 * - Relieve: grilla no uniforme, con celdas de ~140 m cerca del puerto que crecen hasta ~1 km en los bordes del mapa.
 *   La imagen satelital y el suelo dibujado de la ciudad siguen dando el detalle.
 * - Edificios: los altos y grandes (hitos: Palacio Salvo, Torre Antel, etc.) quedan como prismas orientados; el resto
 *   se agrupa por manzanas en bloques (una caja por celda, con la altura media ponderada por superficie y la huella
 *   ajustada a lo construido). El sombreador de ventanas sigue funcionando sobre las caras.
 * - Presupuesto: fondo (relieve + edificios) por debajo de 15.000 triángulos. `construirFondo` ajusta el tamaño de las
 *   manzanas hasta entrar.
 */
import * as THREE from 'three'
import { heightAt, type Zone } from './zone'

export const PRESUPUESTO_FONDO = 15000

export interface Fondo {
  terreno: THREE.BufferGeometry
  edificios: THREE.BufferGeometry | null
  tris: { terreno: number; edificios: number; total: number; hitos: number; bloques: number; celda: number }
}

/** Posiciones de muestreo en un eje: paso fino cerca de `c` que crece con la distancia. */
function muestras(a: number, b: number, c: number, paso0: number, crece: number, pasoMax: number) {
  const out = [a]
  let x = a
  while (x < b) {
    const paso = Math.min(pasoMax, paso0 + crece * Math.abs(x - c))
    x = Math.min(b, x + paso)
    out.push(x)
  }
  return out
}

export function terreno(zone: Zone, centro: [number, number], aplanar: (x: number, z: number) => boolean, objetivoTris = 6000): THREE.BufferGeometry {
  const { extent } = zone.meta
  let crece = 0.05
  let xs: number[] = []
  let zs: number[] = []
  for (let k = 0; k < 20; k++) {
    xs = muestras(extent.xmin, extent.xmax, centro[0], 90, crece, 1000)
    zs = muestras(extent.zmin, extent.zmax, centro[1], 90, crece, 1000)
    if ((xs.length - 1) * (zs.length - 1) * 2 <= objetivoTris) break
    crece *= 1.15
  }
  const W = extent.xmax - extent.xmin
  const H = extent.zmax - extent.zmin
  const nx = xs.length
  const nz = zs.length
  const pos = new Float32Array(nx * nz * 3)
  const uv = new Float32Array(nx * nz * 2)
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = xs[i]
      const z = zs[j]
      let h = heightAt(zone, x, z)
      if (aplanar(x, z)) h = Math.min(h, 1)
      const k = j * nx + i
      pos.set([x, h, z], k * 3)
      uv.set([(x - extent.xmin) / W, 1 - (z - extent.zmin) / H], k * 2)
    }
  const idx: number[] = []
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i
      const b = a + 1
      const c = a + nx
      const d = c + 1
      idx.push(a, c, b, b, c, d)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

type Ring = [number, number][]

function areaDe(r: Ring) {
  let a = 0
  for (let i = 0; i < r.length; i++) {
    const [x0, z0] = r[i]
    const [x1, z1] = r[(i + 1) % r.length]
    a += x0 * z1 - x1 * z0
  }
  return Math.abs(a) / 2
}

/** Rectángulo orientado mínimo aproximado (ejes principales) de un anillo. */
function obb(r: Ring) {
  let cx = 0
  let cz = 0
  for (const [x, z] of r) {
    cx += x
    cz += z
  }
  cx /= r.length
  cz /= r.length
  let sxx = 0
  let szz = 0
  let sxz = 0
  for (const [x, z] of r) {
    sxx += (x - cx) ** 2
    szz += (z - cz) ** 2
    sxz += (x - cx) * (z - cz)
  }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz)
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (const [x, z] of r) {
    const u = (x - cx) * c + (z - cz) * s
    const v = -(x - cx) * s + (z - cz) * c
    u0 = Math.min(u0, u)
    u1 = Math.max(u1, u)
    v0 = Math.min(v0, v)
    v1 = Math.max(v1, v)
  }
  const mu = (u0 + u1) / 2
  const mv = (v0 + v1) / 2
  return { cx: cx + mu * c - mv * s, cz: cz + mu * s + mv * c, ang, l: u1 - u0, w: v1 - v0 }
}

/** Prisma (5 caras, sin piso) con color de fachada por vértice. */
function prisma(out: number[], col: number[], cx: number, cz: number, ang: number, l: number, w: number, y0: number, h: number, color: THREE.Color) {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const P = (u: number, v: number, y: number): [number, number, number] => [cx + u * c - v * s, y, cz + u * s + v * c]
  const hl = l / 2
  const hw = w / 2
  const y1 = y0 + h
  const q = [P(-hl, -hw, 0), P(hl, -hw, 0), P(hl, hw, 0), P(-hl, hw, 0)]
  const quad = (a: [number, number, number], b: [number, number, number], cc: [number, number, number], d: [number, number, number]) => {
    out.push(...a, ...b, ...cc, ...a, ...cc, ...d)
    for (let k = 0; k < 6; k++) col.push(color.r, color.g, color.b)
  }
  const up = (p: [number, number, number], y: number): [number, number, number] => [p[0], y, p[2]]
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    quad(up(a, y0), up(a, y1), up(b, y1), up(b, y0))
  }
  quad(up(q[0], y1), up(q[3], y1), up(q[2], y1), up(q[1], y1))
}

export function edificios(
  zone: Zone,
  excluir: (x: number, z: number) => boolean,
  suelo: (x: number, z: number) => number,
  colores: THREE.Color[],
  objetivoTris = 8800,
): { geo: THREE.BufferGeometry | null; hitos: number; bloques: number; celda: number; tris: number } {
  const bs = zone.vectors.buildings
    .filter((b) => !excluir(b.ring[0][0], b.ring[0][1]))
    .map((b) => ({ ...b, area: areaDe(b.ring as Ring) }))
  // hitos: los más altos y voluminosos quedan como prismas propios
  const puntaje = (b: { h: number; area: number }) => b.h * Math.sqrt(b.area)
  const orden = [...bs].sort((a, b) => puntaje(b) - puntaje(a))
  const nHitos = Math.min(70, orden.filter((b) => b.h >= 30).length)
  const hitos = new Set(orden.slice(0, nHitos))
  let celda = 55
  let resultado: ReturnType<typeof edificios> | null = null
  for (let k = 0; k < 30 && !resultado; k++) {
    const celdas = new Map<string, { a: number; ah: number; cx: number; cz: number; x0: number; x1: number; z0: number; z1: number; n: number }>()
    for (const b of bs) {
      if (hitos.has(b)) continue
      const r = b.ring as Ring
      let cx = 0
      let cz = 0
      for (const [x, z] of r) {
        cx += x
        cz += z
      }
      cx /= r.length
      cz /= r.length
      const key = `${Math.floor(cx / celda)},${Math.floor(cz / celda)}`
      let e = celdas.get(key)
      if (!e) celdas.set(key, (e = { a: 0, ah: 0, cx: 0, cz: 0, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, n: 0 }))
      e.a += b.area
      e.ah += b.area * b.h
      e.cx += cx * b.area
      e.cz += cz * b.area
      e.n++
      for (const [x, z] of r) {
        e.x0 = Math.min(e.x0, x)
        e.x1 = Math.max(e.x1, x)
        e.z0 = Math.min(e.z0, z)
        e.z1 = Math.max(e.z1, z)
      }
    }
    const tris = (celdas.size + hitos.size) * 10
    if (tris > objetivoTris) {
      celda *= 1.12
      continue
    }
    const pos: number[] = []
    const col: number[] = []
    for (const b of hitos) {
      const o = obb(b.ring as Ring)
      const c = colores[Math.abs(Math.floor(o.cx * 7.13 + o.cz * 3.71)) % colores.length]
      prisma(pos, col, o.cx, o.cz, o.ang, Math.max(4, o.l), Math.max(4, o.w), suelo(o.cx, o.cz), b.h, c)
    }
    for (const e of celdas.values()) {
      if (e.a < 150) continue
      const cx = e.cx / e.a
      const cz = e.cz / e.a
      const bw = e.x1 - e.x0
      const bd = e.z1 - e.z0
      // la huella cubre la proporción construida de la celda (sin superar lo que ocupa el conjunto)
      const k = Math.min(1, Math.sqrt(e.a / Math.max(1, bw * bd)) * 1.15)
      const w = Math.max(8, bw * k)
      const d = Math.max(8, bd * k)
      const c = colores[Math.abs(Math.floor(cx * 7.13 + cz * 3.71)) % colores.length]
      prisma(pos, col, cx, cz, 0, w, d, suelo(cx, cz), e.ah / e.a, c)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    resultado = { geo: g, hitos: hitos.size, bloques: celdas.size, celda, tris: pos.length / 9 }
  }
  return resultado ?? { geo: null, hitos: 0, bloques: 0, celda, tris: 0 }
}
