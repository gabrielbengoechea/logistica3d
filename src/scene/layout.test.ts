import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TERMINAL, toTerminal, toWorld } from './layout'

describe('layout', () => {
  it('la terminal coincide con la de zone.json (la usa también el servicio AIS)', () => {
    const zone = JSON.parse(readFileSync(new URL('../../public/zones/montevideo/zone.json', import.meta.url), 'utf8'))
    expect(zone.terminal).toMatchObject({ x: TERMINAL.x, z: TERMINAL.z, yaw: TERMINAL.yaw })
  })

  it('toTerminal deshace toWorld', () => {
    const [x, z] = toTerminal(...toWorld(120, -40))
    expect(x).toBeCloseTo(120)
    expect(z).toBeCloseTo(-40)
  })
})
