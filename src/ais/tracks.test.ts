import { describe, expect, it } from 'vitest'
import type { AisShip } from './api'
import { STALE_H, aisPoseAt, buildAisTracks } from './tracks'

const ship: AisShip = { id: '1', mmsi: 1, name: 'X', type: 'Carga', typeCode: 70, length: 200, beam: 30, destination: null }
const ev = (t: number, x: number, heading: number | null, sog = 10) => ({ t, entity: '1', type: 'position' as const, pos: [x, 0] as [number, number], data: { sog, heading, cog: heading } })

describe('aisPoseAt', () => {
  const [tr] = buildAisTracks([ship], [ev(1, 0, 90), ev(1.1, 100, 90), ev(2, 200, null, 0)])

  it('interpola entre reportes cercanos', () => {
    const p = aisPoseAt(tr, 1.05)
    expect(p.visible).toBe(true)
    expect(p.x).toBeCloseTo(50)
    // Rumbo 90° (este) = proa hacia +x = rotación 0.
    expect(p.yaw).toBeCloseTo(0)
  })

  it('no interpola a través de un hueco largo y oculta reportes viejos', () => {
    expect(aisPoseAt(tr, 1.2).x).toBe(100)
    expect(aisPoseAt(tr, 1.1 + STALE_H + 0.01).visible).toBe(false)
    expect(aisPoseAt(tr, 0.5).visible).toBe(false)
  })

  it('un buque quieto sin rumbo conserva el último', () => {
    expect(aisPoseAt(tr, 2.05).yaw).toBeCloseTo(0)
  })
})
