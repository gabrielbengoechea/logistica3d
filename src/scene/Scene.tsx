import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CameraControls } from '@react-three/drei'
import { useStore, type View } from '../store'
import FeedShips from './FeedShips'
import Lighting from './Lighting'
import Water from './Water'
import Cranes from './Cranes'
import Effects from './Effects'
import { poseAt } from '../feeds/positions'
import { TERMINAL, toWorld } from './layout'
import ScaleComparison, { SCALE_AT } from './ScaleComparison'
import Ships from './Ships'
import TerminalPad from './TerminalPad'
import Trucks from './Trucks'
import World from './World'
import Yard from './Yard'
import Rtgs from './Rtgs'
import Tractors from './Tractors'
import { shipPose } from './pose'
import { useZone } from './zone'
import { TOURS } from '../didactic/tours'
import { listenKeyboard, nav } from './navInput'

const fromTerminal = (x: number, y: number, z: number): [number, number, number] => {
  const [wx, wz] = toWorld(x, z)
  return [wx, y, wz]
}

/** Cámara de cada vista: posición y punto mirado, en el marco del mapa. */
export const VIEWS: Record<View, [number, number, number, number, number, number]> = {
  terminal: [...fromTerminal(380, 360, 760), ...fromTerminal(0, 0, 40)],
  bahia: [2600, 5200, 7600, -1300, 0, 1200],
  escalas: [SCALE_AT[0] + 220, 600, SCALE_AT[1] + 480, SCALE_AT[0] - 140, 30, SCALE_AT[1] - 160],
}

function Clock() {
  const advance = useStore((s) => s.advance)
  useFrame((_, delta) => advance(Math.min(delta, 0.1)))
  return null
}

/** Mientras hay un buque seguido, la cámara mantiene su ángulo y desplaza el punto mirado hasta el buque. */
function Follow({ controls }: { controls: React.RefObject<CameraControls | null> }) {
  useFrame(() => {
    const { follow, tracks, feedTracks, t, params } = useStore.getState()
    if (!follow || !controls.current) return
    const tr = tracks.find((x) => x.ship.id === follow)
    if (tr) {
      const p = shipPose(tr, t, params)
      if (p.phase !== 'hidden') controls.current.moveTo(p.x, 10, p.z, true)
      return
    }
    const ft = feedTracks.find((x) => x.ship.id === follow)
    const p = ft && poseAt(ft, t)
    if (p && p.visible) controls.current.moveTo(p.x, 10, p.z, true)
  })
  return null
}

/**
 * Movimiento libre: teclado y botones de pantalla (navInput), plano cercano según la distancia para poder
 * acercarse mucho sin perder precisión de profundidad, y doble clic para ir a un punto.
 */
function FreeNav({ controls }: { controls: React.RefObject<CameraControls | null> }) {
  const { gl, camera, scene } = useThree()
  useEffect(() => listenKeyboard(() => useStore.getState().tour === null), [])

  useEffect(() => {
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const onDouble = (e: MouseEvent) => {
      const c = controls.current
      if (!c || useStore.getState().tour) return
      const r = gl.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const hit = ray
        .intersectObjects(scene.children, true)
        .find((h) => (h.object as THREE.Mesh).isMesh && !('isSky' in h.object) && h.distance < 30000)
      if (!hit) return
      useStore.getState().setFollow(null)
      c.moveTo(hit.point.x, Math.max(0, hit.point.y), hit.point.z, true)
      if (c.distance > 700) c.dollyTo(700, true)
    }
    gl.domElement.addEventListener('dblclick', onDouble)
    return () => gl.domElement.removeEventListener('dblclick', onDouble)
  }, [gl, camera, scene, controls])

  const target = useRef(new THREE.Vector3())
  useFrame((_, delta) => {
    const c = controls.current
    if (!c) return
    const dt = Math.min(delta, 0.1)
    if (nav.forward || nav.right || nav.up || nav.turn || nav.tilt || nav.zoom) {
      if (useStore.getState().follow) useStore.getState().setFollow(null)
      // La velocidad crece con la distancia: lento cerca de una grúa, rápido sobre la bahía.
      const speed = Math.max(25, c.distance * 0.8) * (nav.fast ? 3 : 1) * dt
      if (nav.forward) c.forward(nav.forward * speed, false)
      if (nav.right) c.truck(nav.right * speed, 0, false)
      if (nav.up) c.elevate(nav.up * speed * 0.6, false)
      if (nav.turn) c.rotate(nav.turn * 1.2 * dt, 0, false)
      if (nav.tilt) c.rotate(0, nav.tilt * 0.8 * dt, false)
      if (nav.zoom) c.dolly(nav.zoom * speed, false)
      // El punto mirado no baja del nivel del agua.
      c.getTarget(target.current)
      if (target.current.y < 0) c.setTarget(target.current.x, 0, target.current.z, false)
    }
    const near = THREE.MathUtils.clamp(c.distance * 0.04, 0.6, 5)
    const cam = camera as THREE.PerspectiveCamera
    if (Math.abs(cam.near - near) / near > 0.05) {
      cam.near = near
      cam.updateProjectionMatrix()
    }
  })
  return null
}

export default function Scene() {
  const controls = useRef<CameraControls>(null)
  const view = useStore((s) => s.view)
  const tour = useStore((s) => s.tour)
  const zone = useZone('montevideo')
  const setZoneReady = useStore((s) => s.setZoneReady)
  useEffect(() => setZoneReady(zone !== null), [zone, setZoneReady])

  // Entrada: la cámara arranca sobre la bahía y, cuando el mapa está listo, vuela despacio hasta la vista elegida.
  const intro = useRef(true)
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const [px, py, pz, tx, ty, tz] = VIEWS[view]
    if (intro.current) {
      if (!zone) {
        const [bx, by, bz, btx, bty, btz] = VIEWS.bahia
        c.setLookAt(bx, by, bz, btx, bty, btz, false)
        return
      }
      intro.current = false
      c.smoothTime = 1.8
      const timer = setTimeout(() => (c.smoothTime = 0.25), 4000)
      c.setLookAt(px, py, pz, tx, ty, tz, true)
      return () => {
        clearTimeout(timer)
        c.smoothTime = 0.25
      }
    }
    c.setLookAt(px, py, pz, tx, ty, tz, true)
  }, [view, zone])

  // Recorrido guiado: vuelo lento entre encuadres; al terminar, vuelve a la vista elegida.
  const touring = useRef(false)
  useEffect(() => {
    const c = controls.current
    if (!c || !zone) return
    const shot = tour && TOURS.find((x) => x.key === tour.key)?.steps[tour.step]?.shot
    if (shot) {
      touring.current = true
      c.smoothTime = 1.4
      c.setLookAt(...shot, true)
    } else if (touring.current) {
      touring.current = false
      c.smoothTime = 0.25
      const [px, py, pz, tx, ty, tz] = VIEWS[useStore.getState().view]
      c.setLookAt(px, py, pz, tx, ty, tz, true)
    }
  }, [tour, zone])

  return (
    <>
      <Lighting />
      <Water />
      <CameraControls ref={controls} minDistance={15} maxDistance={24000} maxPolarAngle={1.5} dollyToCursor infinityDolly />
      <Clock />
      <Follow controls={controls} />
      <FreeNav controls={controls} />
      {zone && <World zone={zone} />}
      <group position={[TERMINAL.x, 0, TERMINAL.z]} rotation-y={TERMINAL.yaw}>
        <TerminalPad />
        <Yard />
        <Rtgs />
        <Cranes />
        <Trucks />
        <Tractors />
      </group>
      <Ships />
      <FeedShips />
      <ScaleComparison />
      <Effects />
    </>
  )
}
