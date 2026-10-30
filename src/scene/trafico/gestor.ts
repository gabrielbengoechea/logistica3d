/**
 * Gestor del tránsito: crea y retira camiones con rutas al azar (carril de portería, bahía, carril de salida),
 * arma los circuitos de los straddle carriers y mantiene el motor (trafico.ts) andando.
 *
 * Es código puro (sin three.js): lo usan el componente de la escena y las pruebas.
 */
import { mulberry32 } from '../../sim/rng'
import { BERTHS, YARD, berthToTerminal, craneLocalX, type P2 } from '../layout'
import { Camino } from './camino'
import { BAHIAS_X, GATE_IN_X, GATE_OUT_X, circuitoStraddle, rutaCamion, rutasRepresentativas } from './red'
import { TIPOS, Trafico, Vehiculo, chocan, detectarZonas, type Obstaculo } from './trafico'

// ---------------------------------------------------------------------------------------------------------------------
// Circuitos de los straddle carriers (los de siempre, con carriles de un solo sentido sobre la calle del muelle)
// ---------------------------------------------------------------------------------------------------------------------
export const ROAD_N = 118
export const ROAD_W = -356
const blockTop = (bz: number) => bz - (YARD.bays * YARD.bay) / 2 - 8
const blockBottom = (bz: number) => bz + (YARD.bays * YARD.bay) / 2 + 8
const rowX = (bx: number, r: number) => bx + (r - (YARD.rows - 1) / 2) * YARD.rowPitch
const laneX = (bx: number) => bx + (YARD.rows * YARD.rowPitch) / 2 + 10

/** Cada tramo horizontal sobre la calle del muelle va a su carril según el sentido (separados 6 m: no hay choques de frente). */
function carrilar(path: P2[]): P2[] {
  const lane = (z: number, dx: number): number | null => {
    if (Math.abs(z - ROAD_N) < 0.01) return dx > 0 ? ROAD_N - 6 : ROAD_N
    if (Math.abs(z - (ROAD_N + 8)) < 0.01) return dx > 0 ? ROAD_N + 6 : ROAD_N + 12
    return null
  }
  const out = path.map((p) => [p[0], p[1]] as P2)
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]
    const b = path[i + 1]
    if (Math.abs(a[1] - b[1]) < 0.01) {
      const z = lane(a[1], b[0] - a[0])
      if (z !== null) {
        out[i][1] = z
        out[i + 1][1] = z
      }
    }
  }
  return out
}

export interface Circuito {
  key: string
  berth: number | null
  path: P2[]
  /** Punto donde deja el contenedor (va cargado desde el inicio hasta acá). */
  drop: P2
  color: number
  offset: number
}

function craneCircuit(berth: number, crane: P2, bx: number, bz: number, r: number): { path: P2[]; drop: P2 } {
  const x = rowX(bx, r)
  const lane = laneX(bx)
  const top = blockTop(bz)
  const bottom = blockBottom(bz)
  const mid = bz + ((r % 5) - 2) * YARD.bay
  let path: P2[]
  // bajo la grúa se pasa a lo largo del muelle (entre las patas), como hacen los straddle carriers de verdad:
  // baja por un pasillo 25 m al este de la grúa, cruza bajo ella por z = 24 y sube por un pasillo 25 m al oeste
  const B = (lx: number, lz: number): P2 => (berth < 2 ? [crane[0] + lx, lz] : berthToTerminal(2, cl + lx, lz))
  const cl = berth < 2 ? 0 : crane[0]
  if (berth < 2) {
    path = [B(-25, 24), B(-25, ROAD_N), [x, ROAD_N], [x, top], [x, mid], [x, bottom], [lane, bottom], [lane, ROAD_N + 8], B(25, ROAD_N + 8), B(25, 24)]
  } else {
    const inA = B(25, 70)
    const inB = B(-25, 70)
    path = [B(-25, 24), inB, [ROAD_W, inB[1]], [ROAD_W, ROAD_N], [x, ROAD_N], [x, top], [x, mid], [x, bottom], [lane, bottom], [lane, ROAD_N + 8], [ROAD_W + 6, ROAD_N + 8], [ROAD_W + 6, inA[1]], inA, B(25, 24)]
  }
  return { path: carrilar(path), drop: [x, mid] }
}

function yardCircuit(bx: number, bz: number, r: number): { path: P2[]; drop: P2 } {
  const x = rowX(bx, r)
  const lane = laneX(bx)
  const bottom = blockBottom(YARD.blocksZ[YARD.blocksZ.length - 1])
  // el primer bloque vuelve por el carril oeste de la calle del muelle (mismo sentido que las vueltas de las grúas)
  const ret = bz === YARD.blocksZ[0] ? ROAD_N + 12 : blockTop(bz) - 2
  const path: P2[] = [[x, ret], [x, bz], [x, bottom + 30], [lane, bottom + 30], [lane, ret]]
  return { path, drop: [x, bz] }
}

export function circuitosStraddle(berths: number, n: number): Circuito[] {
  const out: Circuito[] = []
  for (let b = 0; b < berths; b++)
    for (let i = 0; i < n; i++) {
      const local = craneLocalX(i, n)
      const crane = b < 2 ? berthToTerminal(b, local, 24) : ([local, 24] as P2)
      const bi = b < 2 ? YARD.blocksX.reduce((best, bx, k) => (Math.abs(bx - crane[0]) < Math.abs(YARD.blocksX[best] - crane[0]) ? k : best), 0) : i % 2
      for (const k of [0, 1]) {
        const bz = YARD.blocksZ[(i + k) % YARD.blocksZ.length]
        const { path, drop } = craneCircuit(b, crane, YARD.blocksX[bi], bz, (b * 3 + i * 4 + k * 5) % YARD.rows)
        out.push({ key: `c${b}-${i}-${k}`, berth: b, path, drop, color: (b * 3 + i * 5 + k) % 8, offset: k * 0.5 + i * 0.13 })
      }
    }
  for (let k = 0; k < 4; k++) {
    const bx = YARD.blocksX[1 + k * 2]
    const { path, drop } = yardCircuit(bx, YARD.blocksZ[k % 3], (k * 3) % YARD.rows)
    out.push({ key: `y${k}`, berth: null, path, drop, color: (k * 2 + 1) % 8, offset: k * 0.31 })
  }
  return out
}

/** Patas de las grúas de muelle como obstáculos fijos (en el marco de la terminal). */
export function patasGruas(berths: number, n: number): Obstaculo[] {
  const out: Obstaculo[] = []
  for (let b = 0; b < Math.min(berths, BERTHS.length); b++)
    for (let i = 0; i < n; i++)
      for (const lx of [-9, 9])
        for (const lz of [6, 34]) {
          const [x, z] = berthToTerminal(b, craneLocalX(i, n) + lx, lz)
          out.push({ x, z, r: 1.6 })
        }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// Gestor
// ---------------------------------------------------------------------------------------------------------------------
export interface Carga {
  /** Librea (0-7) y tamaño. */
  livery: number
  size: '40' | '20x2'
}

export interface EstadoGestor {
  /** ¿Trabaja la grúa de ese puesto? (los straddle de una grúa parada se detienen) */
  gruaTrabaja: (berth: number) => boolean
}

export class Gestor {
  trafico = new Trafico()
  objetivo = 8
  straddles: { v: Vehiculo; c: Circuito; camino: Camino; sDrop: number }[] = []
  private rng = mulberry32(2026)
  private claveStraddle = ''
  viajes = 0

  constructor() {
    this.recalcularZonas()
  }

  /** Configura los straddle carriers según puestos y grúas; recalcula las zonas de conflicto. */
  configurar(berths: number, cranes: number, camiones: number) {
    this.objetivo = camiones
    const key = `${berths}-${cranes}`
    if (key === this.claveStraddle) return
    this.claveStraddle = key
    for (const s of this.straddles) this.trafico.quitar(s.v)
    this.straddles = []
    for (const c of circuitosStraddle(berths, cranes)) {
      const camino = circuitoStraddle(c.path)
      const v = new Vehiculo(TIPOS.straddle, camino, c.offset * camino.len, true)
      v.meta.circuito = c.key
      const sDrop = camino.project(c.drop[0], c.drop[1], 0, 1e9, 1e9)
      this.straddles.push({ v, c, camino, sDrop })
    }
    // ubicar sin superposiciones: si dos arrancan encimados, el de atrás retrocede por su camino
    for (const s of this.straddles) {
      for (let k = 0; k < 40 && !this.lugarLibre(s.v); k++) this.moverA(s.v, s.v.s + 9)
      this.trafico.agregar(s.v)
    }
    this.trafico.estaticos = patasGruas(berths, cranes)
    this.recalcularZonas()
    this.trafico.ocuparIniciales()
  }

  private lugarLibre(v: Vehiculo) {
    const mine = v.obbs([])
    for (const o of this.trafico.vehiculos) for (const b of o.obbs([])) for (const a of mine) if (chocan(a, b, 0.4)) return false
    return true
  }

  private moverA(v: Vehiculo, s: number) {
    v.s = s
    const p = v.camino.at(((s % v.camino.len) + v.camino.len) % v.camino.len)
    v.x = p.x
    v.z = p.z
    v.h = p.h
  }

  recalcularZonas() {
    const rutas = rutasRepresentativas()
    const caminos = [...rutas.map((r) => r.camino), ...this.straddles.map((s) => s.camino)]
    const anchos = [...rutas.map(() => TIPOS.camion.width), ...this.straddles.map(() => TIPOS.straddle.width)]
    this.trafico.setZonas(detectarZonas(caminos, anchos))
  }

  /** Camiones dentro de la terminal por carril de portería (para elegir la cola más corta). */
  private colas() {
    const n = GATE_IN_X.map(() => 0)
    for (const v of this.trafico.vehiculos) if (v.tipo === TIPOS.camion && typeof v.meta.carril === 'number' && !v.meta.pasoPorteria) n[v.meta.carril as number]++
    return n
  }

  private nuevoCamion(): Vehiculo | null {
    const colas = this.colas()
    const min = Math.min(...colas)
    const opciones = colas.map((c, i) => (c === min ? i : -1)).filter((i) => i >= 0)
    const g = opciones[Math.floor(this.rng() * opciones.length)]
    // bahías ocupadas o reservadas: elegir una libre si hay
    const usadas = new Set(this.trafico.vehiculos.filter((v) => v.tipo === TIPOS.camion && !v.meta.pasoBahia).map((v) => v.meta.bahia as number))
    const libres = BAHIAS_X.map((_, i) => i).filter((i) => !usadas.has(i))
    const b = libres.length ? libres[Math.floor(this.rng() * libres.length)] : Math.floor(this.rng() * BAHIAS_X.length)
    const o = Math.floor(this.rng() * GATE_OUT_X.length)
    const ruta = rutaCamion(g, b, o)
    if (!this.trafico.libreEn(ruta.camino, 0, 18)) return null
    const v = new Vehiculo(TIPOS.camion, ruta.camino, 0)
    v.meta.carril = g
    v.meta.bahia = b
    v.meta.salida = o
    v.meta.cabina = Math.floor(this.rng() * 3)
    // exportación (llega cargado y lo deja) o importación (llega vacío y se lo lleva)
    const exporta = this.rng() < 0.5
    const carga: Carga = { livery: Math.floor(this.rng() * 8), size: this.rng() < 0.25 ? '20x2' : '40' }
    v.meta.carga = exporta ? carga : null
    const espera = (a: number, b2: number) => a + this.rng() * (b2 - a)
    v.paradas = ruta.paradas.map((p) => ({
      s: p.s,
      tipo: p.tipo,
      id: p.id,
      espera: p.tipo === 'porteria' ? espera(8, 18) : p.tipo === 'bahia' ? espera(25, 55) : espera(4, 9),
      alSalir: (vv: Vehiculo) => {
        if (p.tipo === 'porteria') vv.meta.pasoPorteria = true
        if (p.tipo === 'bahia') {
          vv.meta.pasoBahia = true
          vv.meta.carga = vv.meta.carga ? null : { livery: Math.floor(this.rng() * 8), size: this.rng() < 0.25 ? '20x2' : '40' }
          this.viajes++
        }
      },
    }))
    return this.trafico.agregar(v)
  }

  update(dt: number, estado: EstadoGestor) {
    const tr = this.trafico
    // retirar los que salieron
    for (const v of [...tr.vehiculos]) if (v.terminado) tr.quitar(v)
    const camiones = tr.vehiculos.filter((v) => v.tipo === TIPOS.camion).length
    if (camiones < this.objetivo) this.nuevoCamion()
    for (const s of this.straddles) {
      s.v.activo = s.c.berth === null ? true : estado.gruaTrabaja(s.c.berth)
      const ss = ((s.v.s % s.camino.len) + s.camino.len) % s.camino.len
      s.v.meta.cargado = s.v.activo && ss < s.sDrop
    }
    tr.step(dt)
  }
}

