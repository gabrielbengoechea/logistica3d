import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { useStore, type View } from '../store'
import Cranes from './Cranes'
import Ground from './Ground'
import ScaleComparison from './ScaleComparison'
import Ships from './Ships'
import Trucks from './Trucks'
import Yard from './Yard'

/** Cámara de cada vista: posición y punto mirado. */
export const VIEWS: Record<View, [number, number, number, number, number, number]> = {
  terminal: [430, 330, 640, 0, 0, 20],
  bahia: [1500, 3000, 2400, -500, 0, -900],
  escalas: [-540, 430, 760, -830, 30, 190],
}

function Clock() {
  const advance = useStore((s) => s.advance)
  useFrame((_, delta) => advance(Math.min(delta, 0.1)))
  return null
}

export default function Scene() {
  const controls = useRef<CameraControls>(null)
  const view = useStore((s) => s.view)

  useEffect(() => {
    const [px, py, pz, tx, ty, tz] = VIEWS[view]
    controls.current?.setLookAt(px, py, pz, tx, ty, tz, true)
  }, [view])

  return (
    <>
      <color attach="background" args={['#eef3f8']} />
      <hemisphereLight args={['#ffffff', '#b9c6d3', 1.8]} />
      <directionalLight position={[800, 1500, 600]} intensity={1.5} />
      <CameraControls ref={controls} minDistance={60} maxDistance={8000} maxPolarAngle={1.35} />
      <Clock />
      <Ground />
      <Yard />
      <Cranes />
      <Ships />
      <Trucks />
      <ScaleComparison />
    </>
  )
}
