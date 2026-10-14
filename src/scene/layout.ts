import { mulberry32 } from '../sim/rng'

export type P2 = [number, number]

/**
 * Hay dos marcos de coordenadas, ambos en metros:
 * - Mapa: el de la zona (public/zones/montevideo), x al este y z al sur, origen en el puerto.
 * - Terminal: x a lo largo del muelle y z hacia tierra (z < 0 es agua). Se ubica en el mapa con TERMINAL.
 * La ubicación y el frente del muelle son los reales; el patio, las grúas y la operación son ilustrativos.
 */
export const TERMINAL = { x: -693.4, z: 323.1, yaw: 0.5461 }

export function toWorld(x: number, z: number): P2 {
  const c = Math.cos(TERMINAL.yaw)
  const s = Math.sin(TERMINAL.yaw)
  return [TERMINAL.x + x * c + z * s, TERMINAL.z - x * s + z * c]
}

export function toTerminal(x: number, z: number): P2 {
  const dx = x - TERMINAL.x
  const dz = z - TERMINAL.z
  const c = Math.cos(TERMINAL.yaw)
  const s = Math.sin(TERMINAL.yaw)
  return [dx * c - dz * s, dx * s + dz * c]
}

export const LAND_Y = 3
export const MAX_BERTHS = 3

/**
 * Terminal de Contenedores (TCP), según el plano de la ANP y el folleto 2025, en el marco de la terminal:
 * - Muelle de Escala: 638 m según la ANP (632 m medidos en OpenStreetMap, de x = -316 a x = 316): dos puestos,
 *   350 m a -14 m y 288 m a -10,5 m. El origen del marco es el centro del muelle.
 * - Ampliación (en construcción): muelle nuevo de 730 m sobre la cara oeste, hacia la Escollera Oeste.
 *   Su trazado es aproximado: sigue el borde del relleno que se ve en la imagen y el plano de la ANP.
 */
export const QUAY: [number, number] = [-316, 316]
export const AMP_QUAY: [P2, P2] = [
  [-420, 50],
  [-455, 778],
]

/** Puesto de atraque: centro sobre el borde del muelle y giro respecto de la terminal (en su marco). */
export interface Berth {
  x: number
  z: number
  /** Giro del puesto: su eje x corre a lo largo del muelle y su eje z apunta a tierra. */
  a: number
  name: string
}

const ampDir: P2 = [AMP_QUAY[0][0] - AMP_QUAY[1][0], AMP_QUAY[0][1] - AMP_QUAY[1][1]]
const ampLen = Math.hypot(ampDir[0], ampDir[1])
/** Largo del muelle de la ampliación y posición del primer puesto (a 30 % desde la punta norte). */
export const AMP = {
  len: ampLen,
  a: Math.atan2(-ampDir[1] / ampLen, ampDir[0] / ampLen),
  center: [AMP_QUAY[0][0] - ampDir[0] * 0.3, AMP_QUAY[0][1] - ampDir[1] * 0.3] as P2,
}

export const BERTHS: Berth[] = [
  { x: -150, z: 0, a: 0, name: 'Muelle 1' },
  { x: 160, z: 0, a: 0, name: 'Muelle 2' },
  { x: AMP.center[0], z: AMP.center[1], a: AMP.a, name: 'Muelle 3 · ampliación' },
]

/** Punto (lx, lz) del marco de un puesto, llevado al marco de la terminal. */
export function berthToTerminal(b: number, lx: number, lz: number): P2 {
  const { x, z, a } = BERTHS[b]
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [x + lx * c + lz * s, z - lx * s + lz * c]
}

/** Rumbo de un buque amarrado (proa hacia +x del puesto), en el marco del mapa. */
export const berthYaw = (b: number) => TERMINAL.yaw + BERTHS[b].a
export const berthPos = (b: number, beam: number): P2 => toWorld(...berthToTerminal(b, 0, -(beam / 2 + 4)))
export const offBerthPos = (b: number, beam: number): P2 => toWorld(...berthToTerminal(b, 0, -(beam / 2 + 4) - 260))

/** Posición de una grúa a lo largo de su puesto (en el marco del puesto). */
export const craneLocalX = (i: number, n: number) => (i - (n - 1) / 2) * 72

/** Zona de la terminal en su marco [xmin, xmax, zmin, zmax]: se reemplazan los edificios reales por el modelo. */
export const PAD: [number, number, number, number] = [-470, 225, -20, 790]

// Rutas en el marco del mapa: entrada del canal (sur), boca entre las escolleras y zona de maniobra.
export const ENTRY: P2 = [-1250, 7800]
export const MOUTH: P2 = [-1080, 1350]
export const TURN: P2 = [-1150, 350]

export function anchorageSlot(i: number): P2 {
  const k = i % 12
  return [-3400 + (k % 6) * 420, 4300 + Math.floor(k / 6) * 450]
}

export const CONTAINER_COLORS = ['#d9534f', '#f0ad4e', '#3b7dd8', '#4cae6e', '#8e6cc8', '#e9edf2', '#2bb3b1', '#f47c3c']

/**
 * Patio de straddle carriers: bloques de filas sueltas (cada fila, un contenedor de ancho) separadas lo justo
 * para que pasen las patas de la máquina, con calles entre bloques. 8 x 3 bloques de 10 filas x 10 bahías.
 */
export const YARD = {
  blocksX: Array.from({ length: 8 }, (_, i) => -318 + i * 63),
  blocksZ: [200, 354, 508],
  rows: 10,
  rowPitch: 4.1,
  bays: 10,
  bay: 12.6,
}

/** Centro de cada fila del patio (en el marco de la terminal): x de la fila y z del centro del bloque. */
export function yardRows(): P2[] {
  const out: P2[] = []
  for (const bz of YARD.blocksZ)
    for (const bx of YARD.blocksX) for (let r = 0; r < YARD.rows; r++) out.push([bx + (r - (YARD.rows - 1) / 2) * YARD.rowPitch, bz])
  return out
}

/** Posiciones del patio [x, y, z, color]. Se llena por alturas: primero la base de todos los bloques. */
export function yardSlots(tiers: number): [number, number, number, number][] {
  const rand = mulberry32(11)
  const rows = yardRows()
  const out: [number, number, number, number][] = []
  for (let tier = 0; tier < tiers; tier++)
    for (const [x, bz] of rows)
      for (let bay = 0; bay < YARD.bays; bay++)
        out.push([x, LAND_Y + tier * 2.6 + 1.3, bz + (bay - (YARD.bays - 1) / 2) * YARD.bay, Math.floor(rand() * CONTAINER_COLORS.length)])
  return out
}
