import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Jugador } from './jugador'
import { MundoColision } from './mundo'

/** Nave de prueba: piso 40×40, pared en z = -5 con una puerta de 2 m en x ∈ [-1, 1], un andén de 1,2 m y un escalón de 0,2 m. */
function escenario() {
  const raiz = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial()
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), mat)
  raiz.add(piso)
  // Pared plana de una sola cara (como las de la nave de logi), con hueco de puerta
  const forma = new THREE.Shape([new THREE.Vector2(-10, 0), new THREE.Vector2(10, 0), new THREE.Vector2(10, 4), new THREE.Vector2(-10, 4)])
  forma.holes.push(new THREE.Path([new THREE.Vector2(-1, 0.001), new THREE.Vector2(-1, 3), new THREE.Vector2(1, 3), new THREE.Vector2(1, 0.001)]))
  const pared = new THREE.Mesh(new THREE.ShapeGeometry(forma), mat)
  pared.position.z = -5
  raiz.add(pared)
  const anden = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 4), mat)
  anden.position.set(8, 0.6, 5)
  raiz.add(anden)
  const escalon = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 4), mat)
  escalon.position.set(-8, 0.1, 5)
  raiz.add(escalon)
  // Pallets instanciados (cajas de 1,2 m)
  const pallets = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat, 2)
  pallets.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0.6, 8))
  pallets.setMatrixAt(1, new THREE.Matrix4().makeTranslation(3, 0.6, 8))
  raiz.add(pallets)
  // Algo marcado sin colisión
  const vidrio = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.1), mat)
  vidrio.position.set(0, 1.5, 2)
  vidrio.userData.sinColision = true
  raiz.add(vidrio)
  return raiz
}

function caminar(j: Jugador, deseo: THREE.Vector3, segundos: number) {
  for (let t = 0; t < segundos; t += 1 / 72) j.paso(1 / 72, deseo)
}

describe('mundo y jugador', () => {
  const mundo = new MundoColision().construir([escenario()])
  it('junta triángulos de mallas comunes e instanciadas', () => {
    expect(mundo.triangulos).toBeGreaterThan(20)
  })

  it('se apoya en el piso', () => {
    const j = new Jugador(mundo)
    j.ubicar(new THREE.Vector3(0, 3, 0))
    expect(j.pos.y).toBeCloseTo(0, 2)
    caminar(j, new THREE.Vector3(), 1)
    expect(j.pos.y).toBeCloseTo(0, 1)
    expect(j.enSuelo).toBe(true)
  })

  it('una pared de una sola cara frena desde los dos lados', () => {
    const j = new Jugador(mundo)
    j.ubicar(new THREE.Vector3(5, 0, 0))
    caminar(j, new THREE.Vector3(0, 0, -3), 4)
    expect(j.pos.z).toBeGreaterThan(-5 + j.radio * 0.8)
    const k = new Jugador(mundo)
    k.ubicar(new THREE.Vector3(5, 0, -10))
    caminar(k, new THREE.Vector3(0, 0, 3), 4)
    expect(k.pos.z).toBeLessThan(-5 - k.radio * 0.8)
  })

  it('pasa por la puerta', () => {
    const j = new Jugador(mundo)
    j.ubicar(new THREE.Vector3(0, 0, 0))
    caminar(j, new THREE.Vector3(0, 0, -2), 5)
    expect(j.pos.z).toBeLessThan(-8)
  })

  it('sube un escalón de 20 cm pero no un andén de 1,2 m', () => {
    const j = new Jugador(mundo)
    j.ubicar(new THREE.Vector3(-8, 0, 0))
    caminar(j, new THREE.Vector3(0, 0, 2), 2.5)
    expect(j.pos.y).toBeCloseTo(0.2, 1)
    const k = new Jugador(mundo)
    k.ubicar(new THREE.Vector3(8, 0, 0))
    caminar(k, new THREE.Vector3(0, 0, 2), 3)
    expect(k.pos.y).toBeLessThan(0.1)
    expect(k.pos.z).toBeLessThan(3)
  })

  it('choca con los pallets instanciados y atraviesa lo marcado sin colisión', () => {
    const j = new Jugador(mundo)
    j.ubicar(new THREE.Vector3(0, 0, 12))
    caminar(j, new THREE.Vector3(0, 0, -2), 3)
    expect(j.pos.z).toBeGreaterThan(8.6)
    const k = new Jugador(mundo)
    k.ubicar(new THREE.Vector3(-3, 0, 4))
    caminar(k, new THREE.Vector3(0, 0, -2), 2)
    expect(k.pos.z).toBeLessThan(1)
  })

  it('al caer al vacío vuelve al último lugar firme', () => {
    const j = new Jugador(mundo)
    j.ubicar(new THREE.Vector3(18, 0, 0))
    caminar(j, new THREE.Vector3(), 1)
    caminar(j, new THREE.Vector3(3, 0, 0), 3)
    caminar(j, new THREE.Vector3(), 3)
    expect(j.pos.y).toBeGreaterThan(-1)
    expect(Math.abs(j.pos.x)).toBeLessThan(20.5)
  })

  it('no queda en un bucle de caídas al volver desde el borde', () => {
    const j = new Jugador(mundo)
    j.ubicar(new THREE.Vector3(10, 0, -15))
    caminar(j, new THREE.Vector3(), 0.5)
    // Camina hasta el borde (x = 20) y sigue: cae, vuelve y queda quieto.
    caminar(j, new THREE.Vector3(2, 0, 0), 8)
    caminar(j, new THREE.Vector3(), 4)
    expect(j.pos.y).toBeGreaterThan(-0.5)
    expect(j.pos.x).toBeLessThanOrEqual(20)
    // Quieto, no se mueve ni se vuelve a caer.
    const quieto = j.pos.clone()
    caminar(j, new THREE.Vector3(), 4)
    expect(j.pos.distanceTo(quieto)).toBeLessThan(0.05)
  })

  it('valida destinos de teletransporte', () => {
    expect(mundo.cabe(new THREE.Vector3(5, 0, 0), 0.25, 1.6)).toBe(true)
    expect(mundo.cabe(new THREE.Vector3(0, 0, 8), 0.25, 1.6)).toBe(false)
    expect(mundo.rayo(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0))?.point.y).toBeCloseTo(0, 3)
  })

  it('los límites dejan afuera lo lejano', () => {
    const chico = new MundoColision().construir([escenario()], { limites: new THREE.Box3(new THREE.Vector3(-2, -1, -2), new THREE.Vector3(2, 3, 2)) })
    expect(chico.triangulos).toBeLessThan(mundo.triangulos)
    expect(chico.triangulos).toBeGreaterThan(0)
  })
})
