import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { useStore, type View } from '../store'
import AisShips from './AisShips'
import Cranes from './Cranes'
import { aisPoseAt } from '../ais/tracks'
import { TERMINAL, toWorld } from './layout'
import ScaleComparison, { SCALE_AT } from './ScaleComparison'
import Ships from './Ships'
import TerminalPad from './TerminalPad'
import Trucks from './Trucks'
import World from './World'
import Yard from './Yard'
import { shipPose } from './pose'
import { useZone } from './zone'
import { craneRate } from '../store'

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
    const { follow, tracks, aisTracks, source, t, params } = useStore.getState()
    if (!follow || !controls.current) return
    if (source === 'sim') {
      const tr = tracks.find((x) => x.ship.id === follow)
      const p = tr && shipPose(tr, t, craneRate(params))
      if (p && p.phase !== 'hidden') controls.current.moveTo(p.x, 10, p.z, true)
    } else {
      const tr = aisTracks.find((x) => x.ship.id === follow)
      const p = tr && aisPoseAt(tr, t)
      if (p && p.visible) controls.current.moveTo(p.x, 10, p.z, true)
    }
  })
  return null
}

export default function Scene() {
  const controls = useRef<CameraControls>(null)
  const view = useStore((s) => s.view)
  const zone = useZone('montevideo')
  const setZoneReady = useStore((s) => s.setZoneReady)
  useEffect(() => setZoneReady(zone !== null), [zone, setZoneReady])

  useEffect(() => {
    const [px, py, pz, tx, ty, tz] = VIEWS[view]
    controls.current?.setLookAt(px, py, pz, tx, ty, tz, true)
  }, [view])

  return (
    <>
      <color attach="background" args={['#dfe9f1']} />
      <fog attach="fog" args={['#dfe9f1', 9000, 30000]} />
      <hemisphereLight args={['#ffffff', '#b9c6d3', 1.8]} />
      <directionalLight position={[800, 1500, 600]} intensity={1.5} />
      <CameraControls ref={controls} minDistance={60} maxDistance={16000} maxPolarAngle={1.35} />
      <Clock />
      <Follow controls={controls} />
      {zone && <World zone={zone} />}
      <group position={[TERMINAL.x, 0, TERMINAL.z]} rotation-y={TERMINAL.yaw}>
        <TerminalPad />
        <Yard />
        <Cranes />
        <Trucks />
      </group>
      <Ships />
      <AisShips />
      <ScaleComparison />
    </>
  )
}
