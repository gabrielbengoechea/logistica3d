import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { PRESUPUESTO_FONDO, edificios, terreno } from './fondo'
import { PAD, TERMINAL, toTerminal } from './layout'
import type { Zone } from './zone'

const dir = new URL('../../public/zones/montevideo/', import.meta.url)
const meta = JSON.parse(readFileSync(new URL('zone.json', dir), 'utf8'))
const vectors = JSON.parse(readFileSync(new URL('vectors.json', dir), 'utf8'))
const zone = { meta, vectors, heights: new Float32Array(meta.terrain.cols * meta.terrain.rows), imageUrl: '' } as unknown as Zone
const insidePad = (x: number, z: number, m: number) => {
  const [tx, tz] = toTerminal(x, z)
  return tx > PAD[0] - m && tx < PAD[1] + m && tz > PAD[2] - m && tz < PAD[3] + m
}

describe('fondo liviano', () => {
  it('relieve + edificios de Montevideo por debajo de 15.000 triángulos', () => {
    const t = terreno(zone, [TERMINAL.x, TERMINAL.z], (x, z) => insidePad(x, z, 60))
    const tT = (t.index!.count) / 3
    const b = edificios(zone, (x, z) => insidePad(x, z, 20), () => 0, [new THREE.Color('#eeeeee')], PRESUPUESTO_FONDO - 6200)
    console.log(`relieve ${tT} tris, edificios ${b.tris} tris (${b.hitos} hitos, ${b.bloques} manzanas de ${b.celda.toFixed(0)} m), total ${tT + b.tris}; antes: ${vectors.buildings.length} edificios`)
    expect(tT + b.tris).toBeLessThan(PRESUPUESTO_FONDO)
    expect(b.hitos).toBeGreaterThan(20)
  })
})
