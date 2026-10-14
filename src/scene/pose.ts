import { phaseAt, type Phase, type PhaseParams, type Track } from '../sim/tracks'
import { ENTRY, MOUTH, TERMINAL, TURN, anchorageSlot, berthPos, offBerthPos, type P2 } from './layout'

const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))
const lerp2 = (a: P2, b: P2, u: number): P2 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]
/** Ángulo de rotación (eje y) que apunta la proa, construida hacia +x, de a hacia b. */
const heading = (a: P2, b: P2) => Math.atan2(-(b[1] - a[1]), b[0] - a[0])
const lerpAngle = (a: number, b: number, u: number) => {
  const d = ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
  return a + d * u
}

/** Radio de giro de los buques, en metros: las rutas redondean sus esquinas con curvas de este radio. */
const TURN_RADIUS = 260

/**
 * Redondea las esquinas de una polilínea: cada vértice interior se reemplaza por una curva (Bézier cuadrática)
 * que empieza y termina sobre los tramos vecinos. Así el rumbo cambia de a poco y la estela sale curva.
 */
function fillet(pts: P2[], radius = TURN_RADIUS): P2[] {
  if (pts.length < 3) return pts
  const out: P2[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, p, b] = [pts[i - 1], pts[i], pts[i + 1]]
    const la = Math.hypot(a[0] - p[0], a[1] - p[1])
    const lb = Math.hypot(b[0] - p[0], b[1] - p[1])
    const r = Math.min(radius, la / 2, lb / 2)
    if (r < 1) {
      out.push(p)
      continue
    }
    const p1: P2 = [p[0] + ((a[0] - p[0]) / la) * r, p[1] + ((a[1] - p[1]) / la) * r]
    const p2: P2 = [p[0] + ((b[0] - p[0]) / lb) * r, p[1] + ((b[1] - p[1]) / lb) * r]
    for (let k = 0; k <= 10; k++) {
      const t = k / 10
      const m = (1 - t) * (1 - t)
      const n = 2 * (1 - t) * t
      const o = t * t
      out.push([m * p1[0] + n * p[0] + o * p2[0], m * p1[1] + n * p[1] + o * p2[1]])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

/** Punto y rumbo a una fracción u del largo de una ruta (con las esquinas redondeadas). */
function along(route: P2[], u: number): { p: P2; yaw: number } {
  const pts = fillet(route)
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))
  let d = Math.max(0, Math.min(1, u)) * lens.reduce((a, b) => a + b, 0)
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const t = lens[i] ? Math.min(1, d / lens[i]) : 0
      return { p: lerp2(pts[i], pts[i + 1], t), yaw: heading(pts[i], pts[i + 1]) }
    }
    d -= lens[i]
  }
  return { p: pts[0], yaw: 0 }
}

export interface Pose {
  phase: Phase
  u: number
  x: number
  z: number
  yaw: number
  /** Fracción de la carga que queda a bordo (0 a 1). */
  load: number
}

/** Posición del buque en el mapa en el instante t. */
export function shipPose(tr: Track, t: number, params: PhaseParams): Pose {
  const { phase, u } = phaseAt(tr, t, params)
  const slot = anchorageSlot(tr.index)
  const hAnchor = heading(ENTRY, slot)
  const pose = (p: P2, yaw: number, load: number): Pose => ({ phase, u, x: p[0], z: p[1], yaw, load })
  const b = tr.berth ?? 0
  const beam = tr.ship.beam
  const off = offBerthPos(b, beam)
  const at = berthPos(b, beam)

  switch (phase) {
    case 'hidden':
      return pose(ENTRY, 0, 1)
    case 'approaching': {
      const a = along([ENTRY, slot], ease(u))
      return pose(a.p, a.yaw, 1)
    }
    case 'anchored':
      return pose(slot, hAnchor, 1)
    case 'berthing': {
      // Entra por la boca del puerto, gira frente al muelle y los remolcadores lo empujan de costado.
      if (u < 0.7) {
        const a = along([slot, MOUTH, TURN, off], ease(u / 0.7))
        return pose(a.p, lerpAngle(hAnchor, a.yaw, Math.min(1, u / 0.1)), 1)
      }
      const v = (u - 0.7) / 0.3
      return pose(lerp2(off, at, ease(v)), lerpAngle(heading(TURN, off), TERMINAL.yaw, ease(Math.min(1, v * 1.6))), 1)
    }
    case 'working':
      return pose(at, TERMINAL.yaw, 1 - u)
    case 'unberthing':
      return pose(lerp2(at, off, ease(u)), lerpAngle(TERMINAL.yaw, heading(off, TURN), ease(Math.max(0, (u - 0.5) / 0.5))), 0)
    case 'leaving': {
      const a = along([off, TURN, MOUTH, ENTRY], ease(u))
      return pose(a.p, a.yaw, 0)
    }
  }
}
