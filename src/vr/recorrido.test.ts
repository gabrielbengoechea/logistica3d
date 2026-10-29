// Simula una sesión WebXR completa (cabeza, dos controles con sticks y botones, cuadros) para probar el recorrido:
// tutorial, caminata con colisiones, giro por pasos, teletransporte y los botones Y y B.
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { RecorridoVR as TipoRecorrido } from './recorrido'

// Canvas mínimo: el tutorial y la ficha dibujan en 2D, acá no importa el resultado visual.
beforeAll(() => {
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k) =>
      k in t ? t[k as string] : k === 'measureText' ? (s: string) => ({ width: String(s).length * 14 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => undefined,
    set: (t, k, v) => ((t[k as string] = v), true),
  })
  ;(globalThis as Record<string, unknown>).document = {
    createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }),
  }
})

interface Pad { axes: number[]; buttons: { pressed: boolean }[] }
const pad = (): Pad => ({ axes: [0, 0, 0, 0], buttons: Array.from({ length: 7 }, () => ({ pressed: false })) })

function escenario() {
  const raiz = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial()
  raiz.add(new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), mat))
  const pared = new THREE.Mesh(new THREE.BoxGeometry(20, 4, 0.3), mat)
  pared.position.set(0, 2, -6)
  raiz.add(pared)
  return raiz
}

async function armar(menu?: import('./escenas').ConfigMenu) {
  const { RecorridoVR } = await import('./recorrido')
  const escena = new THREE.Scene()
  const raiz = escenario()
  escena.add(raiz)
  const rig = new THREE.Group()
  const cabeza = new THREE.PerspectiveCamera()
  cabeza.position.set(0, 1.6, 0)
  rig.add(cabeza)
  escena.add(rig)
  const izq = pad()
  const der = pad()
  const fuentes = [
    { handedness: 'left', gamepad: izq, targetRaySpace: 'rayoIzq' },
    { handedness: 'right', gamepad: der, targetRaySpace: 'rayoDer' },
  ]
  // El control derecho apunta 35° hacia abajo, hacia adelante (-Z), desde la mano.
  const poseDer = new THREE.Matrix4().compose(new THREE.Vector3(0.2, 1.2, -0.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.6, 0, 0)), new THREE.Vector3(1, 1, 1))
  const frame = { getPose: (s: string) => (s === 'rayoDer' ? { transform: { matrix: poseDer.toArray() } } : null) }
  const sesion = { inputSources: fuentes }
  const renderer = { xr: { getSession: () => sesion, getFrame: () => frame, getReferenceSpace: () => ({}) } } as unknown as THREE.WebGLRenderer
  const rec: TipoRecorrido = new RecorridoVR(renderer, escena, rig, cabeza, {
    tarjetas: [{ titulo: 'Portada', texto: '', portada: true }, { titulo: 'Caminar', texto: '' }, { titulo: 'Resumen', texto: '' }],
    inicio: { pos: new THREE.Vector3(0, 0, 4), yaw: 0 },
    limites: new THREE.Box3(new THREE.Vector3(-30, -5, -30), new THREE.Vector3(30, 10, 30)),
    colisionables: () => [raiz],
    menu,
  })
  const cuadros = (n: number, antes?: () => void) => {
    for (let i = 0; i < n; i++) {
      antes?.()
      rec.actualizar(1 / 72)
      rig.updateMatrixWorld(true)
    }
  }
  /** Aprieta y suelta un botón (dos cuadros). */
  const tocar = (p: Pad, b: number) => {
    p.buttons[b].pressed = true
    cuadros(1)
    p.buttons[b].pressed = false
    cuadros(1)
  }
  /** Apunta el control derecho hacia un punto del mundo. */
  const apuntar = (punto: THREE.Vector3) => {
    const desde = new THREE.Vector3(0.2, 1.2, -0.2).applyMatrix4(rig.matrixWorld)
    const m = new THREE.Matrix4().lookAt(desde, punto, new THREE.Vector3(0, 1, 0))
    const local = new THREE.Matrix4().copy(rig.matrixWorld).invert().multiply(m.setPosition(desde))
    poseDer.copy(local)
  }
  return { rec, rig, cabeza, izq, der, cuadros, tocar, escena, apuntar }
}

const yaw = (o: THREE.Object3D) => o.rotation.y

describe('recorrido en el visor (sesión simulada)', () => {
  it('ubica al jugador, muestra el tutorial y lo recorre con el gatillo', async () => {
    const { rec, rig, der, cuadros, tocar } = await armar()
    rec.iniciar()
    expect(rec.enTutorial).toBe(false) // espera el primer cuadro con pose
    cuadros(1)
    expect(rec.enTutorial).toBe(true)
    expect(rec.tutorial.indice).toBe(0)
    expect(rig.position.z).toBeCloseTo(4, 1)
    // Durante el tutorial el stick no mueve
    der.axes[3] = 0
    tocar(der, 0)
    expect(rec.tutorial.indice).toBe(1)
    tocar(der, 1) // grip: anterior
    expect(rec.tutorial.indice).toBe(0)
    tocar(der, 0)
    tocar(der, 4) // A también avanza
    expect(rec.tutorial.indice).toBe(2)
    tocar(der, 0) // última: comenzar
    expect(rec.enTutorial).toBe(false)
  })

  it('camina con el stick izquierdo hacia donde mira y la pared lo frena', async () => {
    const { rec, izq, der, cuadros, tocar } = await armar()
    rec.iniciar()
    cuadros(1)
    for (let i = 0; i < 3; i++) tocar(der, 0)
    expect(rec.enTutorial).toBe(false)
    const z0 = rec.jugador.pos.z
    cuadros(72, () => (izq.axes[3] = -1)) // 1 s hacia adelante
    expect(z0 - rec.jugador.pos.z).toBeGreaterThan(1.8)
    cuadros(72 * 5, () => (izq.axes[3] = -1))
    izq.axes[3] = 0
    expect(rec.jugador.pos.z).toBeGreaterThan(-6 + 0.15 + 0.2) // no atravesó la pared (cara en z = -5,85)
    expect(rec.jugador.pos.z).toBeLessThan(-5)
  })

  it('gira de a 30° con el stick derecho y no repite mientras se mantiene', async () => {
    const { rec, rig, der, cuadros, tocar } = await armar()
    rec.iniciar()
    cuadros(1)
    for (let i = 0; i < 3; i++) tocar(der, 0)
    const y0 = yaw(rig)
    cuadros(30, () => (der.axes[2] = 1))
    der.axes[2] = 0
    cuadros(2)
    expect(yaw(rig) - y0).toBeCloseTo(-Math.PI / 6, 3)
  })

  it('teletransporta con el arco al soltar el stick derecho', async () => {
    const { rec, der, cuadros, tocar } = await armar()
    rec.iniciar()
    cuadros(1)
    for (let i = 0; i < 3; i++) tocar(der, 0)
    const antes = rec.jugador.pos.clone()
    cuadros(5, () => (der.axes[3] = -1))
    expect(rec.locomocion.arco.visible).toBe(true)
    expect(rec.locomocion.aro.visible).toBe(true)
    der.axes[3] = 0
    cuadros(2)
    const salto = antes.distanceTo(rec.jugador.pos)
    expect(salto).toBeGreaterThan(1.5)
    expect(rec.jugador.pos.z).toBeLessThan(antes.z)
    expect(rec.jugador.pos.y).toBeCloseTo(0, 1)
  })

  it('Y vuelve al punto de partida y B abre el tutorial', async () => {
    const { rec, izq, der, cuadros, tocar } = await armar()
    rec.iniciar()
    cuadros(1)
    for (let i = 0; i < 3; i++) tocar(der, 0)
    cuadros(72, () => (izq.axes[2] = 1)) // al costado
    izq.axes[2] = 0
    expect(Math.abs(rec.jugador.pos.x)).toBeGreaterThan(1)
    tocar(izq, 5) // Y
    expect(rec.jugador.pos.x).toBeCloseTo(0, 1)
    expect(rec.jugador.pos.z).toBeCloseTo(4, 1)
    tocar(der, 5) // B
    expect(rec.enTutorial).toBe(true)
    expect(rec.tutorial.indice).toBe(0)
  })

  it('el cuerpo sigue a la cabeza al caminar en la habitación, sin entrar en la pared', async () => {
    const { rec, rig, cabeza, der, cuadros, tocar } = await armar()
    rec.iniciar()
    cuadros(1)
    for (let i = 0; i < 3; i++) tocar(der, 0)
    // El jugador camina físicamente 12 m hacia adelante (la pared está a 9,85 m)
    for (let k = 0; k < 120; k++) {
      cabeza.position.z -= 0.1
      cuadros(1)
    }
    const cabezaMundo = cabeza.getWorldPosition(new THREE.Vector3())
    expect(cabezaMundo.z).toBeGreaterThan(-5.85)
    expect(rig.position.z).toBeGreaterThan(cabeza.position.z * -1 - 10) // el rig retrocedió para compensar
  })

  it('el gatillo izquierdo abre el menú, maneja el tiempo y lanza una escena guiada', async () => {
    const registro: string[] = []
    let vel = 1
    let pausa = false
    const lugar = { titulo: 'Mirador', pos: new THREE.Vector3(10, 12, 10), yaw: 0, alto: true }
    const menu: import('./escenas').ConfigMenu = {
      tiempo: {
        reloj: () => 'Día 1 · 10:00',
        pausado: () => pausa,
        alternarPausa: () => (pausa = !pausa),
        velocidades: [{ etiqueta: 'Lento', valor: 0.1 }, { etiqueta: 'Rápido', valor: 1 }],
        velocidad: () => vel,
        fijarVelocidad: (v) => (vel = v),
        saltos: [{ etiqueta: '+1 h', horas: 1 }],
        saltar: (h) => registro.push(`salto ${h}`),
      },
      escenas: [
        {
          id: 'demo',
          titulo: 'Demo',
          resumen: 'Escena de prueba',
          preparar: () => (registro.push('preparar'), lugar),
          pasos: [{ texto: 'Uno' }, { texto: 'Dos', al: () => registro.push('paso 2') }],
        },
      ],
    }
    const { rec, izq, der, cuadros, tocar, apuntar } = await armar(menu)
    rec.opciones.narracion = false
    rec.iniciar()
    cuadros(1)
    for (let i = 0; i < 3; i++) tocar(der, 0)
    tocar(izq, 0)
    expect(rec.menu.abierto).toBe(true)
    // El menú no sigue al control izquierdo (sin pose en la simulación): se lo deja frente al jugador.
    rec.menu.malla.position.set(0, 1.5, 3.4)
    rec.menu.malla.lookAt(0, 1.5, 4)
    cuadros(1)
    const apretar = (panel: { centroDe(id: string): THREE.Vector3 | null }, id: string) => {
      const c = panel.centroDe(id)
      expect(c, id).not.toBeNull()
      apuntar(c!)
      cuadros(1)
      der.buttons[0].pressed = true
      cuadros(1)
      const consumido = rec.gatilloConsumido
      der.buttons[0].pressed = false
      cuadros(1)
      return consumido
    }
    expect(apretar(rec.menu, 'vel:0')).toBe(true)
    expect(vel).toBe(0.1)
    apretar(rec.menu, 'tiempo:pausa')
    expect(pausa).toBe(true)
    apretar(rec.menu, 'salto:0')
    expect(registro).toContain('salto 1')
    apretar(rec.menu, 'pestana:escenas')
    expect(rec.menu.pestana).toBe('escenas')
    apretar(rec.menu, 'escena:demo')
    expect(registro).toContain('preparar')
    expect(rec.menu.abierto).toBe(false)
    expect(rec.guia.activa).toBe(true)
    // Llevado al mirador: parado sobre la plataforma de observación, a 12 m.
    cuadros(10)
    expect(rec.jugador.pos.y).toBeCloseTo(12, 0)
    expect(rec.jugador.pos.distanceTo(new THREE.Vector3(10, 12, 10))).toBeLessThan(0.5)
    apretar(rec.guia, 'guia:siguiente')
    expect(rec.guia.paso).toBe(1)
    expect(registro).toContain('paso 2')
    apretar(rec.guia, 'guia:siguiente') // Terminar
    expect(rec.guia.activa).toBe(false)
    // Sigue parado en la plataforma (no se cae).
    cuadros(72)
    expect(rec.jugador.pos.y).toBeCloseTo(12, 0)
  })
})
