/**
 * Red de tránsito de la terminal (marco de la terminal: x a lo largo del muelle, z hacia tierra).
 *
 * Camiones externos (sentido único en todo el circuito):
 *   1. Entran desde el Acceso por 4 carriles de portería (x = 194,6 … 205,4), paran en la cabina (z = 735).
 *   2. Los 4 carriles se juntan en uno (x = 200) y doblan al oeste con radio 12 m por la calle de entrega (z = 632).
 *   3. Cada camión va a una bahía de intercambio (8 bolsillos a z = 625, cada 60 m): sale del carril en S, para,
 *      el straddle carrier carga o descarga, y vuelve al carril.
 *   4. Retorno en U (radio 12 m) en el extremo oeste, calle de vuelta hacia el este (z = 656).
 *   5. Doblan al sur (radio 12 m) hacia los 2 carriles de salida (x = 175,2 y 178,8), paran en la cabina de salida
 *      (z = 755) y se van.
 * Straddle carriers: sus circuitos de siempre (grúa ↔ patio y patio ↔ zona de camiones) con las esquinas
 * redondeadas a 8 m. Las "bahías de grúa" son los puntos de toma bajo cada grúa.
 */
import { Camino, Tortuga, redondear, type P2 } from './camino'

const N = -Math.PI / 2 // hacia el agua (−z)

export const R_GIRO = 12
export const Z_ENTREGA = 632
export const Z_BOLSILLO = 625
export const Z_RETORNO = 656
export const X_UNION = 200
export const X_SALIDA = 177
export const GATE_IN_X = [194.6, 198.2, 201.8, 205.4]
export const GATE_OUT_X = [175.2, 178.8]
export const Z_CABINA_IN = 735
export const Z_CABINA_OUT = 800
export const Z_AFUERA = 905
/** 4 bahías cada 115 m: la parada queda lejos de las uniones y entre bolsillos hay lugar para un camión entero. */
export const BAHIAS_X = Array.from({ length: 4 }, (_, k) => 150 - k * 115)
const X_OESTE = -318

export interface Ruta {
  camino: Camino
  /** Largo s de cada parada: cabina de entrada, bahía, cabina de salida. */
  paradas: { s: number; tipo: 'porteria' | 'bahia' | 'salida'; id: string }[]
  carrilIn: number
  bahia: number
  carrilOut: number
}

const cache = new Map<string, Ruta>()

/** Ruta completa de un camión: carril de entrada g (0-3), bahía b (0-7), carril de salida o (0-1). Se arma una vez. */
export function rutaCamion(g: number, b: number, o: number): Ruta {
  const key = `${g}-${b}-${o}`
  const hit = cache.get(key)
  if (hit) return hit
  const r = armarRuta(g, b, o)
  cache.set(key, r)
  return r
}

function armarRuta(g: number, b: number, o: number): Ruta {
  const x0 = GATE_IN_X[g]
  const t = new Tortuga(x0, Z_AFUERA, N)
  t.hasta('z', 712)
  // unión de los 4 carriles en uno (S lateral hacia x = 200)
  const off = X_UNION - x0
  if (Math.abs(off) > 0.05) t.ese(off, 34)           // rumbo N: "+90°" apunta a +x
  else t.recta(34)
  t.hasta('z', Z_ENTREGA + R_GIRO)
  t.arco(R_GIRO, -Math.PI / 2)                        // N → O
  const bx = BAHIAS_X[b]
  t.hasta('x', bx + 42)
  t.ese(Z_ENTREGA - Z_BOLSILLO, 22)                    // rumbo O: "+90°" apunta a −z (hacia el bolsillo)
  t.recta(40)
  t.ese(-(Z_ENTREGA - Z_BOLSILLO), 22)
  t.hasta('x', X_OESTE)
  t.arco(R_GIRO, -Math.PI)                            // vuelta en U: O → E por el sur
  t.hasta('x', X_SALIDA - R_GIRO)
  t.arco(R_GIRO, Math.PI / 2)                         // E → S
  t.hasta('z', 712)
  const xo = GATE_OUT_X[o]
  const off2 = xo - X_SALIDA
  if (Math.abs(off2) > 0.05) t.ese(-off2, 30)         // rumbo S: "+90°" apunta a −x
  else t.recta(30)
  t.hasta('z', Z_AFUERA)
  const cam = t.camino()
  const sIn = cam.project(x0, Z_CABINA_IN, 0, 1e9, 1e9)
  const sBay = cam.project(bx - 2.0, Z_BOLSILLO, sIn, 0, 1e9)
  const sOut = cam.project(xo, Z_CABINA_OUT, sBay + 200, 0, 1e9)
  return {
    camino: cam,
    paradas: [
      { s: sIn, tipo: 'porteria', id: `G${g + 1}` },
      { s: sBay, tipo: 'bahia', id: `B${b + 1}` },
      { s: sOut, tipo: 'salida', id: `S${o + 1}` },
    ],
    carrilIn: g,
    bahia: b,
    carrilOut: o,
  }
}

/** Todas las combinaciones de carril: sirven para dibujar la señalización y detectar las zonas de conflicto. */
export function todasLasRutas(): Ruta[] {
  const out: Ruta[] = []
  for (let g = 0; g < GATE_IN_X.length; g++)
    for (let b = 0; b < BAHIAS_X.length; b++) for (let o = 0; o < GATE_OUT_X.length; o++) out.push(rutaCamion(g, b, o))
  return out
}

/** Circuito cerrado de un straddle carrier (polilínea del componente de siempre) con esquinas redondeadas. */
export function circuitoStraddle(pts: P2[]): Camino {
  return redondear(pts, 8, true)
}

/** Un camino por cada ramal distinto (carriles de portería, bahías, carriles de salida): alcanza para hallar los conflictos. */
export function rutasRepresentativas(): Ruta[] {
  const out: Ruta[] = []
  for (let g = 0; g < GATE_IN_X.length; g++) out.push(rutaCamion(g, 0, 0))
  for (let b = 1; b < BAHIAS_X.length; b++) out.push(rutaCamion(0, b, 0))
  for (let o = 1; o < GATE_OUT_X.length; o++) out.push(rutaCamion(0, 0, o))
  return out
}
