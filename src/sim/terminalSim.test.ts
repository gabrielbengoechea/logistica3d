import { describe, expect, it } from 'vitest'
import { BASE_PARAMS, YARD_CAPACITY, simulate } from './terminalSim'
import { buildTracks, phaseAt } from './tracks'

describe('simulate', () => {
  it('es determinista con la misma semilla', () => {
    expect(simulate(BASE_PARAMS)).toEqual(simulate(BASE_PARAMS))
  })

  it('cambiar grúas no cambia qué buques llegan', () => {
    const a = simulate(BASE_PARAMS)
    const b = simulate({ ...BASE_PARAMS, cranesPerBerth: 1 })
    expect(b.ships).toEqual(a.ships)
  })

  it('más grúas reducen la espera', () => {
    const pocas = simulate({ ...BASE_PARAMS, cranesPerBerth: 1 })
    const muchas = simulate({ ...BASE_PARAMS, cranesPerBerth: 4 })
    expect(muchas.kpis.avgWaitH).toBeLessThan(pocas.kpis.avgWaitH)
  })

  it('cerrar un muelle aumenta la espera', () => {
    const dos = simulate(BASE_PARAMS)
    const uno = simulate({ ...BASE_PARAMS, berths: 1 })
    expect(uno.kpis.avgWaitH).toBeGreaterThan(dos.kpis.avgWaitH)
  })

  it('el patio nunca supera su capacidad', () => {
    const r = simulate({ ...BASE_PARAMS, shipsPerDay: 5, truckMovesPerHour: 40 })
    for (const s of r.samples) expect(s.yard).toBeLessThanOrEqual(YARD_CAPACITY + 1e-6)
    expect(r.kpis.hoursYardFull).toBeGreaterThan(0)
  })

  it('los eventos de cada buque van en orden', () => {
    const r = simulate(BASE_PARAMS)
    for (const tr of buildTracks(r)) {
      const times = [tr.arrive, tr.berthAt, tr.workStart, tr.workEnd, tr.depart].filter((x) => x !== undefined)
      expect([...times].sort((a, b) => a - b)).toEqual(times)
    }
  })
})

describe('phaseAt', () => {
  it('recorre las fases en orden', () => {
    const r = simulate(BASE_PARAMS)
    const rate = BASE_PARAMS.cranesPerBerth * BASE_PARAMS.movesPerCraneHour
    const tr = buildTracks(r).find((x) => x.arrive > 3 && x.depart !== undefined)!
    const order = ['hidden', 'approaching', 'anchored', 'berthing', 'working', 'unberthing', 'leaving', 'hidden']
    const seen: string[] = []
    for (let t = 0; t < BASE_PARAMS.days * 24; t += 0.05) {
      const p = phaseAt(tr, t, rate).phase
      if (seen.at(-1) !== p) seen.push(p)
    }
    // "anchored" puede no aparecer si el buque atraca apenas llega.
    expect(seen.filter((p) => p !== 'anchored')).toEqual(order.filter((p) => p !== 'anchored'))
  })
})
