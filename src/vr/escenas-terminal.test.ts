// Las escenas guiadas dejan la simulación en el momento justo y llevan al estudiante cerca de lo que hay que ver.
import { describe, expect, it } from 'vitest'
import { shipPose } from '../scene/pose'
import { phaseAt } from '../sim/tracks'
import { useStore } from '../store'
import type { ContextoEscena, Lugar } from './escenas'
import { menuTerminal, tiempoTerminal } from './escenas-terminal'

const menu = menuTerminal(() => null)
const escena = (id: string) => menu.escenas!.find((e) => e.id === id)!
const st = () => useStore.getState()
const distancia = (l: Lugar, x: number, z: number) => Math.hypot(l.pos.x - x, l.pos.z - z)

function recorrer(id: string) {
  const lugares: Lugar[] = []
  const ctx: ContextoEscena = { irA: (l) => lugares.push(l), tiempo: menu.tiempo }
  const e = escena(id)
  lugares.push(e.preparar(ctx))
  const fases: string[] = []
  for (const p of e.pasos) {
    p.al?.(ctx)
    expect(p.texto.length).toBeGreaterThan(40)
    const tr = st().tracks.find((x) => st().selection?.kind === 'ship' && 'id' in st().selection! && x.ship.id === (st().selection as { id: string }).id)
    fases.push(tr ? phaseAt(tr, st().t, st().params).phase : '-')
  }
  for (const l of lugares) {
    expect(Number.isFinite(l.pos.x + l.pos.y + l.pos.z + l.yaw)).toBe(true)
  }
  return { lugares, fases }
}

describe('escenas guiadas de la terminal', () => {
  it('atraque: el buque está atracando frente al mirador', () => {
    const { lugares, fases } = recorrer('atraque')
    expect(fases.slice(0, 3).every((f) => f === 'berthing')).toBe(true)
    const sel = st().selection as { id: string }
    const tr = st().tracks.find((x) => x.ship.id === sel.id)!
    const p = shipPose(tr, st().t, st().params)
    expect(distancia(lugares[0], p.x, p.z)).toBeLessThan(700)
    expect(st().speed).toBeCloseTo(1 / 60)
  })

  it('descarga: el buque está operando y el mirador está junto a su puesto', () => {
    const { lugares, fases } = recorrer('descarga')
    expect(fases[0]).toBe('working')
    const sel = st().selection as { id: string }
    const tr = st().tracks.find((x) => x.ship.id === sel.id)!
    const p = shipPose(tr, st().t, st().params)
    expect(distancia(lugares[0], p.x, p.z)).toBeLessThan(250)
    expect(lugares[0].alto).toBe(true)
  })

  it('desatraque: termina la operación, se separa y sale por la boca', () => {
    const { lugares, fases } = recorrer('desatraque')
    expect(fases[0]).toBe('working')
    expect(fases[1]).toBe('unberthing')
    expect(fases[2]).toBe('leaving')
    const sel = st().selection as { id: string }
    const tr = st().tracks.find((x) => x.ship.id === sel.id)!
    // A 3 minutos del punto más cercano a la boca, el buque está a menos de 1 km del mirador.
    const p = shipPose(tr, st().t, st().params)
    expect(distancia(lugares[lugares.length - 1], p.x, p.z)).toBeLessThan(1000)
  })

  it('llegada: el buque está entrando cerca de la boca', () => {
    const { lugares, fases } = recorrer('llegada')
    expect(fases[0]).toBe('berthing')
    expect(lugares[0].titulo).toBe('Boca del puerto')
  })

  it('patio y comparación de tamaños', () => {
    recorrer('patio')
    const { lugares } = recorrer('tamanos')
    expect(st().showScale).toBe(true)
    expect(lugares).toHaveLength(2)
  })

  it('el tiempo se maneja desde el menú', () => {
    st().setT(10)
    tiempoTerminal.saltar(1)
    expect(st().t).toBeCloseTo(11)
    tiempoTerminal.saltar(-12)
    expect(st().t).toBeCloseTo(st().params.days * 24 - 1)
    tiempoTerminal.fijarVelocidad(6)
    expect(tiempoTerminal.velocidad()).toBe(6)
    const antes = tiempoTerminal.pausado()
    tiempoTerminal.alternarPausa()
    expect(tiempoTerminal.pausado()).toBe(!antes)
    expect(tiempoTerminal.reloj()).toMatch(/^Día \d+ · \d\d:\d\d$/)
    expect(tiempoTerminal.detalle!()).toContain('En muelle')
    expect(menu.lugares!.length).toBeGreaterThanOrEqual(6)
  })
})
