import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
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

const fromTerminal = (x: number, y: number, z: number): [number, number, number] => {
  const [wx, wz] = toWorld(x, z)
  return [wx, y, wz]
}

/** Cámara de cada vista: posición y punto mirado, en el marco del mapa. */
export const VIEWS: Record<View, [number, number, number, number, number, number]> = {
  terminal: [...fromTerminal(380, 360, 760), ...fromTerminal(0, 0, 40)],
  bahia: [2600, 5200, 7600, -1300, 0, 1200],
  escalas: [SCALE_AT[0] + 250, 420, SCALE_AT[1] + 560, SCALE_AT[0] - 30, 20, SCALE_AT[1]],
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
      <CameraControls ref={controls} minDistance={60} maxDistance={16000} maxPolarAngle={1.35} />
      <Clock />
      <Follow controls={controls} />
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
