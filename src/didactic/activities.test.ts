import { describe, expect, test } from 'vitest'
import { simulate } from '../sim/terminalSim'
import { ACTIVITIES, activityBase, activityParams, correctOption } from './activities'

/** Lo que cada actividad quiere mostrar tiene que cumplirse en cualquier semana, no solo en la que elegimos. */
const LESSON: Record<string, (v: number) => boolean> = {
  alta: (v) => v >= 1.5,
  paro: (v) => v >= 2,
  turno: (v) => v >= 2.2,
  itinerario: (v) => v < 0.8,
}
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 42, 123, 500, 999]

describe('actividades', () => {
  test('cada actividad cambia un solo parámetro y tiene su lección', () => {
    for (const a of ACTIVITIES) {
      expect(Object.keys(a.change)).toHaveLength(1)
      expect(LESSON[a.key]).toBeDefined()
    }
  })

  for (const a of ACTIVITIES)
    test(`${a.title}: la lección se cumple en todas las semanas y siempre hay una sola opción correcta`, () => {
      for (const seed of SEEDS) {
        const base = simulate(activityBase(seed))
        const now = simulate(activityParams(a, seed))
        const v = a.measure(base, now)
        expect(LESSON[a.key](v), `semana ${seed}: ${v.toFixed(2)}`).toBe(true)
        expect(a.options.filter((o) => o.matches(v))).toHaveLength(1)
        expect(correctOption(a, v)).toBeGreaterThanOrEqual(0)
        expect(a.explain(base, now)).not.toMatch(/NaN|undefined/)
      }
    })
})
