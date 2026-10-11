import { describe, expect, it } from 'vitest'
import { BASE_PARAMS, SLOTS_PER_TIER, simulate } from './terminalSim'
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
    for (const s of r.samples) expect(s.yard).toBeLessThanOrEqual(SLOTS_PER_TIER * BASE_PARAMS.yardTiers + 1e-6)
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

describe('parámetros', () => {
  it('cambiar la mezcla cambia los buques pero no los horarios', () => {
    const a = simulate(BASE_PARAMS)
    const b = simulate({ ...BASE_PARAMS, mix: { feeder: 100, panamax: 0, postpanamax: 0 } })
    expect(b.events.filter((e) => e.type === 'arrive')).toEqual(a.events.filter((e) => e.type === 'arrive'))
    expect(b.ships.every((s) => s.shipClass === 'feeder')).toBe(true)
  })

  it('las llegadas programadas son regulares', () => {
    const r = simulate({ ...BASE_PARAMS, arrivals: 'scheduled' })
    const ts = r.events.filter((e) => e.type === 'arrive').map((e) => e.t)
    const gaps = ts.slice(1).map((t, i) => t - ts[i])
    const mean = 24 / BASE_PARAMS.shipsPerDay
    for (const g of gaps) expect(Math.abs(g - mean)).toBeLessThanOrEqual(2 * Math.min(3, mean * 0.2) + 1e-9)
  })

  it('con un solo turno las estadías son más largas', () => {
    const tres = simulate(BASE_PARAMS)
    const uno = simulate({ ...BASE_PARAMS, craneHoursPerDay: 8 })
    expect(uno.kpis.avgBerthH).toBeGreaterThan(tres.kpis.avgBerthH * 1.5)
  })

  it('más altura de apilado da más capacidad y menos grúas frenadas', () => {
    const bajo = simulate({ ...BASE_PARAMS, yardTiers: 3, truckMovesPerHour: 60 })
    const alto = simulate({ ...BASE_PARAMS, yardTiers: 5, truckMovesPerHour: 60 })
    expect(alto.yardCapacity).toBe(SLOTS_PER_TIER * 5)
    expect(alto.kpis.hoursYardFull).toBeLessThan(bajo.kpis.hoursYardFull)
  })
})

describe('phaseAt', () => {
  it('recorre las fases en orden', () => {
    const r = simulate(BASE_PARAMS)
    const tr = buildTracks(r).find((x) => x.arrive > 3 && x.depart !== undefined)!
    const order = ['hidden', 'approaching', 'anchored', 'berthing', 'working', 'unberthing', 'leaving', 'hidden']
    const seen: string[] = []
    for (let t = 0; t < BASE_PARAMS.days * 24; t += 0.05) {
      const p = phaseAt(tr, t, BASE_PARAMS).phase
      if (seen.at(-1) !== p) seen.push(p)
    }
    // "anchored" puede no aparecer si el buque atraca apenas llega.
    expect(seen.filter((p) => p !== 'anchored')).toEqual(order.filter((p) => p !== 'anchored'))
  })
})
