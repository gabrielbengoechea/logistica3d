import { mulberry32 } from '../sim/rng'

/**
 * Geometría de la terminal en metros. Eje x a lo largo del muelle, z hacia tierra (z < 0 es agua), y hacia arriba.
 * Las medidas son típicas de una terminal de contenedores, no las de la terminal real de Montevideo.
 */
export const LAND_Y = 3
export const BERTH_LEN = 330
export const MAX_BERTHS = 3
export const berthX = (b: number) => (b - 1) * BERTH_LEN

/** Entrada del canal de acceso, donde aparecen y desaparecen los buques. */
export const CHANNEL: [number, number] = [-2600, -2300]

export function anchorageSlot(i: number): [number, number] {
  const k = i % 12
  return [-1000 + (k % 6) * 380, -1500 - Math.floor(k / 6) * 380]
}

export const berthPos = (b: number, beam: number): [number, number] => [berthX(b), -(beam / 2 + 4)]
export const offBerthPos = (b: number, beam: number): [number, number] => [berthX(b), -(beam / 2 + 4) - 280]

export const craneX = (b: number, i: number, n: number) => berthX(b) + (i - (n - 1) / 2) * 72

export const CONTAINER_COLORS = ['#d9534f', '#f0ad4e', '#3b7dd8', '#4cae6e', '#8e6cc8', '#e9edf2', '#2bb3b1', '#f47c3c']

/** Posiciones del patio: 12 bloques de 10 bahías x 6 filas x 4 alturas = 2880 contenedores de 40 pies. */
export function yardSlots(): [number, number, number, number][] {
  const rand = mulberry32(11)
  const blocksX = [-400, -240, -80, 80, 240, 400]
  const blocksZ = [130, 185]
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
