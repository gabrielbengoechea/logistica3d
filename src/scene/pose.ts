import { phaseAt, type Phase, type Track } from '../sim/tracks'
import { CHANNEL, anchorageSlot, berthPos, offBerthPos } from './layout'

type P2 = [number, number]

const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u))
const lerp2 = (a: P2, b: P2, u: number): P2 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]
/** Ángulo de rotación (eje y) que apunta la proa, construida hacia +x, de a hacia b. */
const heading = (a: P2, b: P2) => Math.atan2(-(b[1] - a[1]), b[0] - a[0])
const lerpAngle = (a: number, b: number, u: number) => {
  const d = ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
  return a + d * u
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

export function shipPose(tr: Track, t: number, rate: number): Pose {
  const { phase, u } = phaseAt(tr, t, rate)
  const slot = anchorageSlot(tr.index)
  const hAnchor = heading(CHANNEL, slot)
  const pose = (p: P2, yaw: number, load: number): Pose => ({ phase, u, x: p[0], z: p[1], yaw, load })
  const b = tr.berth ?? 0
  const beam = tr.ship.beam
  const off = offBerthPos(b, beam)
  const at = berthPos(b, beam)

  switch (phase) {
    case 'hidden':
      return pose(CHANNEL, 0, 1)
    case 'approaching':
      return pose(lerp2(CHANNEL, slot, ease(u)), hAnchor, 1)
    case 'anchored':
      return pose(slot, hAnchor, 1)
    case 'berthing': {
      // Navega hasta quedar frente al muelle y los remolcadores lo empujan de costado.
      const h1 = heading(slot, off)
      if (u < 0.6) return pose(lerp2(slot, off, ease(u / 0.6)), lerpAngle(hAnchor, h1, Math.min(1, u / 0.15)), 1)
      const v = (u - 0.6) / 0.4
      return pose(lerp2(off, at, ease(v)), lerpAngle(h1, 0, ease(Math.min(1, v * 1.6))), 1)
    }
    case 'working':
      return pose(at, 0, 1 - u)
    case 'unberthing': {
      const h2 = heading(off, CHANNEL)
      return pose(lerp2(at, off, ease(u)), lerpAngle(0, h2, ease(Math.max(0, (u - 0.5) / 0.5))), 0)
    }
    case 'leaving':
      return pose(lerp2(off, CHANNEL, ease(u)), heading(off, CHANNEL), 0)
  }
}
