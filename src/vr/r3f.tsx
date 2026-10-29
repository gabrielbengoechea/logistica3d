// Integración con React Three Fiber: sesión WebXR (@react-three/xr), recorrido en el visor con colisiones y
// caminata a pie en la pantalla. La app declara dónde se empieza, qué se puede tocar y el tutorial.
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { XROrigin, createXRStore } from '@react-three/xr'
import * as THREE from 'three'
import { create, useStore } from 'zustand'
import { CaminataEscritorio } from './escritorio'
import { fichaDesdeDOM } from './ficha'
import { Jugador } from './jugador'
import { MundoColision } from './mundo'
import { RecorridoVR, type ConfigRecorrido } from './recorrido'
import type { Tarjeta } from './tarjetas'
import { mostrarPortada } from './tutorial'

/** Sesión WebXR: 72 Hz (el Quest 2 tiene margen), renderizado foveado y controles con rayo (sin manos). */
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
const emular = params.get('emular') === '1'
/** ?debug=1 deja el jugador y el mundo de colisión en window.__vr (para pruebas). */
const depurar = params.get('debug') === '1'
// El emulador no se instala si el navegador ya trae WebXR (aunque no tenga visor): con ?emular=1 se oculta el nativo.
if (emular && typeof navigator !== 'undefined' && navigator.xr) {
  Object.defineProperty(navigator, 'xr', { value: undefined, configurable: true, writable: true })
}

export const xrStore = createXRStore({
  offerSession: false,
  // ?emular=1 simula un Meta Quest en la computadora (para probar sin visor).
  emulate: emular ? { type: 'metaQuest2', inject: true } : false,
  hand: false,
  foveation: 1,
  frameRate: (tasas) => (Array.from(tasas).includes(72) ? 72 : false),
  controller: { teleportPointer: false },
})

/** Estado de los modos inmersivos, visible desde la interfaz (fuera del Canvas). */
export const modoVR = create<{ aPie: boolean; soportaVR: boolean; estado: 'fuera' | 'tutorial' | 'recorriendo' }>(() => ({
  aPie: false,
  soportaVR: false,
  estado: 'fuera',
}))

/** Se resuelve cuando se sabe si el navegador puede entrar en VR (inmediato si no hay WebXR). */
export const listoVR: Promise<boolean> = (async () => {
  if (typeof navigator === 'undefined') return false
  // Con el emulador, navigator.xr se reemplaza recién cuando termina de cargar.
  for (let i = 0; emular && !(xrStore.getState() as { emulator?: unknown }).emulator && i < 80; i++) await new Promise((r) => setTimeout(r, 100))
  const ok = (await navigator.xr?.isSessionSupported('immersive-vr').catch(() => false)) ?? false
  modoVR.setState({ soportaVR: ok })
  return ok
})()

export const useEnXR = () => useStore(xrStore, (s) => s.session != null)
export const entrarVR = () => {
  modoVR.setState({ aPie: false })
  return xrStore.enterVR()
}

/** Muestra la portada con el tutorial al abrir la app. */
export function abrirPortada(titulo: string, tarjetas: Tarjeta[]) {
  return mostrarPortada({
    titulo,
    tarjetas,
    entrarVR: modoVR.getState().soportaVR ? () => void entrarVR() : undefined,
    textoPantalla: 'Explorar en la pantalla',
  })
}

export interface PropsRecorrido {
  config: () => ConfigRecorrido
  /** Plano cercano y lejano de la cámara mientras se camina (m). */
  cerca?: number
  lejos?: number
  /** Al entrar o salir (por ejemplo para bajar la calidad y apagar efectos). */
  alEntrar?: () => void
  alSalir?: () => void
}

/**
 * Va dentro de <XR>. En el visor maneja el recorrido completo; en la pantalla, la caminata a pie cuando
 * `modoVR.aPie` está activo. La ficha de lo seleccionado se lee de un elemento `[data-vr-ficha]` de la página.
 */
export function Recorrido({ config, cerca = 0.08, lejos = 9000, alEntrar, alSalir }: PropsRecorrido) {
  const origen = useRef<THREE.Group>(null)
  const sesion = useStore(xrStore, (s) => s.session)
  const aPie = modoVR((s) => s.aPie)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const rec = useRef<RecorridoVR | null>(null)
  const caminata = useRef<{ c: CaminataEscritorio; j: Jugador } | null>(null)
  const relojFicha = useRef(0)
  const entrar = useRef(alEntrar)
  const salir = useRef(alSalir)
  entrar.current = alEntrar
  salir.current = alSalir

  // Visor
  useEffect(() => {
    if (!sesion || !origen.current) return
    entrar.current?.()
    const cam = gl.xr.getCamera()
    cam.near = cerca
    cam.far = lejos
    const cfg = config()
    const r = new RecorridoVR(gl, scene, origen.current, cam, {
      ...cfg,
      alCambiar: (e) => {
        modoVR.setState({ estado: e })
        cfg.alCambiar?.(e)
      },
    })
    rec.current = r
    if (depurar) Object.assign(window, { __vr: { recorrido: r, jugador: r.jugador, mundo: r.mundo, gl, escena: scene } })
    // Un cuadro de margen: la escena termina de montarse con la calidad del visor antes de armar las colisiones.
    const t = setTimeout(() => r.iniciar(), 50)
    return () => {
      clearTimeout(t)
      r.terminar()
      r.ficha.dispose()
      rec.current = null
      origen.current?.position.set(0, 0, 0)
      origen.current?.rotation.set(0, 0, 0)
      salir.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion])

  // A pie en la pantalla
  useEffect(() => {
    if (!aPie || sesion) return
    entrar.current?.()
    const cfg = config()
    const mundo = new MundoColision()
    const persp = camera as THREE.PerspectiveCamera
    const antes = { near: persp.near, far: persp.far, fov: persp.fov }
    let c: CaminataEscritorio | null = null
    const t = setTimeout(() => {
      mundo.construir(cfg.colisionables(), { limites: cfg.limites, excluir: cfg.excluir })
      console.info(`[vr] colisiones (a pie): ${mundo.triangulos} triángulos en ${mundo.msConstruccion.toFixed(0)} ms`)
      const j = new Jugador(mundo, cfg.jugador)
      j.ubicar(cfg.inicio.pos)
      c = new CaminataEscritorio(j, camera, gl.domElement)
      c.yaw = cfg.inicio.yaw
      c.velocidad = cfg.velocidad ?? 2.4
      c.conectar()
      persp.near = cerca
      persp.far = lejos
      persp.fov = 70
      persp.updateProjectionMatrix()
      caminata.current = { c, j }
      if (depurar) Object.assign(window, { __vr: { jugador: j, caminata: c, mundo, gl, escena: scene } })
    }, 50)
    return () => {
      clearTimeout(t)
      c?.desconectar()
      caminata.current = null
      persp.near = antes.near
      persp.far = antes.far
      persp.fov = antes.fov
      persp.updateProjectionMatrix()
      salir.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aPie, sesion])

  useFrame((_, dt) => {
    const r = rec.current
    if (r) {
      r.actualizar(dt)
      relojFicha.current -= dt
      if (relojFicha.current <= 0 && !r.enTutorial) {
        relojFicha.current = 0.25
        const f = fichaDesdeDOM(document.querySelector('[data-vr-ficha]'))
        if (f) r.ficha.mostrar(gl.xr.getCamera(), f.titulo, f.lineas, f.etiqueta)
        else r.ficha.ocultar()
      }
      return
    }
    caminata.current?.c.actualizar(dt)
  })

  return <XROrigin ref={origen} />
}
