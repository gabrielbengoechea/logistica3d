import { mulberry32 } from '../sim/rng'

export type P2 = [number, number]

/**
 * Hay dos marcos de coordenadas, ambos en metros:
 * - Mapa: el de la zona (public/zones/montevideo), x al este y z al sur, origen en el puerto.
 * - Terminal: x a lo largo del muelle y z hacia tierra (z < 0 es agua). Se ubica en el mapa con TERMINAL.
 * La ubicación y el frente del muelle son los reales; el patio, las grúas y la operación son ilustrativos.
 */
export const TERMINAL = { x: -685, z: 317, yaw: 0.511 }

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
export const BERTH_LEN = 315
export const MAX_BERTHS = 3
/** Muelles 1 y 2 ocupan el frente real (~630 m). El 3 es una ampliación hipotética hacia el suroeste. */
export const berthX = (b: number) => (b === 2 ? -1.5 * BERTH_LEN : (b - 0.5) * BERTH_LEN)

/** Superficie de la terminal en su marco: [xmin, xmax, zmin, zmax]. */
export const PAD: [number, number, number, number] = [-340, 340, 0, 380]

// Rutas en el marco del mapa: entrada del canal (sur), boca entre las escolleras y zona de maniobra.
export const ENTRY: P2 = [-1250, 7800]
export const MOUTH: P2 = [-1080, 1350]
export const TURN: P2 = [-1150, 350]

export function anchorageSlot(i: number): P2 {
  const k = i % 12
  return [-3400 + (k % 6) * 420, 4300 + Math.floor(k / 6) * 450]
}

export const berthPos = (b: number, beam: number): P2 => toWorld(berthX(b), -(beam / 2 + 4))
export const offBerthPos = (b: number, beam: number): P2 => toWorld(berthX(b), -(beam / 2 + 4) - 260)

export const craneX = (b: number, i: number, n: number) => berthX(b) + (i - (n - 1) / 2) * 72

export const CONTAINER_COLORS = ['#d9534f', '#f0ad4e', '#3b7dd8', '#4cae6e', '#8e6cc8', '#e9edf2', '#2bb3b1', '#f47c3c']

/** Posiciones del patio: 12 bloques de 10 bahías x 6 filas x 4 alturas = 2880 contenedores de 40 pies. */
export function yardSlots(): [number, number, number, number][] {
  const rand = mulberry32(11)
  const blocksX = [-240, -80, 80, 240]
  const blocksZ = [130, 185, 240]
  const out: [number, number, number, number][] = []
  // Se llena por alturas: primero la base de todos los bloques, después el segundo nivel, etc.
  for (let tier = 0; tier < 4; tier++)
    for (const bz of blocksZ)
      for (const bx of blocksX)
        for (let bay = 0; bay < 10; bay++)
          for (let row = 0; row < 6; row++)
            out.push([
              bx - 63 + bay * 12.6 + 6.3,
              LAND_Y + tier * 2.6 + 1.3,
              bz - 8.7 + row * 2.9 + 1.45,
              Math.floor(rand() * CONTAINER_COLORS.length),
            ])
  return out
}
