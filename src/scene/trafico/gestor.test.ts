import { describe, expect, it } from 'vitest'
import { Gestor } from './gestor'
import { todasLasRutas } from './red'
import { TIPOS, chocan, type OBB } from './trafico'

describe('red de tránsito', () => {
  it('todas las curvas de los camiones respetan el radio mínimo de 12 m', () => {
    for (const r of todasLasRutas()) expect(r.camino.minRadius()).toBeGreaterThan(11.5)
  })
})

describe('simulación de tránsito', () => {
  it('diez minutos sin superposiciones, sin bloqueos y con camiones que entran y salen', () => {
    const SEG = Number(process.env.SEG ?? 600)
    const g = new Gestor()
    g.configurar(2, 3, 10)
    const dt = 0.25
    let maxErr = 0
    const progreso = new Map<number, { s: number; t: number }>()
    let quietoMax = 0
    for (let t = 0; t < SEG; t += dt) {
      g.update(dt, { gruaTrabaja: () => true })
      const vs = g.trafico.vehiculos
      const cajas: { id: number; o: OBB }[] = []
      for (const v of vs) for (const o of v.obbs([])) cajas.push({ id: v.id, o })
      for (let i = 0; i < cajas.length; i++)
        for (let j = i + 1; j < cajas.length; j++)
          if (cajas[i].id !== cajas[j].id && chocan(cajas[i].o, cajas[j].o, -0.1)) {
            throw new Error(`choque en t=${t.toFixed(1)} entre ${cajas[i].id} y ${cajas[j].id}`)
          }
      for (const v of vs) {
        if (v.tipo === TIPOS.camion) {
          const p = v.camino.at(v.s)
          maxErr = Math.max(maxErr, Math.hypot(p.x - v.x, p.z - v.z))
        }
        const pr = progreso.get(v.id)
        if (!pr || v.s > pr.s + 0.5 || v.enParada) progreso.set(v.id, { s: v.s, t })
        else quietoMax = Math.max(quietoMax, t - pr.t)
      }
    }
    console.log(`viajes: ${g.viajes}, error lateral máx: ${maxErr.toFixed(2)} m, máximo tiempo quieto: ${quietoMax.toFixed(0)} s, zonas: ${g.trafico.zonas.length}`)
    expect(g.viajes).toBeGreaterThan(10)
    expect(maxErr).toBeLessThan(1.0)
    expect(quietoMax).toBeLessThan(240)
  }, 120000)
})
