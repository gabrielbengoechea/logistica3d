import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'
import { CONTAINER_COLORS, LAND_Y } from './layout'
import { getContainerTexture } from './materials'
import { useGlowMaterial } from './useGlow'

// Circuito de los camiones: calle del muelle, lateral, calle trasera y vuelta.
const PATH: [number, number][] = [
  [-330, 78],
  [330, 78],
  [330, 300],
  [-330, 300],
]
const SEGMENTS = PATH.map((a, i) => {
  const b = PATH[(i + 1) % PATH.length]
  return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) }
})
const PERIMETER = SEGMENTS.reduce((s, x) => s + x.len, 0)

function pointAt(d: number): { x: number; z: number; yaw: number } {
  let r = ((d % PERIMETER) + PERIMETER) % PERIMETER
  for (const s of SEGMENTS) {
    if (r <= s.len) {
      const u = r / s.len
      return {
        x: s.a[0] + (s.b[0] - s.a[0]) * u,
        z: s.a[1] + (s.b[1] - s.a[1]) * u,
        yaw: Math.atan2(-(s.b[1] - s.a[1]), s.b[0] - s.a[0]),
      }
    }
    r -= s.len
  }
  return { x: PATH[0][0], z: PATH[0][1], yaw: 0 }
}

/** Camiones ilustrativos: la cantidad sigue al ritmo de retiro del patio, el recorrido no es real. */
export default function Trucks() {
  const rate = useStore((s) => s.params.truckMovesPerHour)
  const count = Math.max(2, Math.min(10, Math.round(rate / 15)))
  const refs = useRef<(THREE.Group | null)[]>([])
  const dist = useRef(0)
  const head = useGlowMaterial('#fff6dc', 0.1, 7)
  const tail = useGlowMaterial('#ff3b30', 0.1, 4)
  const colors = useMemo(() => Array.from({ length: 10 }, (_, i) => CONTAINER_COLORS[(i * 3) % CONTAINER_COLORS.length]), [])

  useFrame((_, delta) => {
    if (useStore.getState().playing) dist.current += delta * 40
    refs.current.forEach((g, i) => {
      if (!g) return
      const p = pointAt(dist.current + (i * PERIMETER) / count)
      g.position.set(p.x, LAND_Y, p.z + 3)
      g.rotation.y = p.yaw
    })
  })

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)}>
          <mesh position={[0, 1.6, 0]} castShadow>
            <boxGeometry args={[15, 0.6, 2.5]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          <mesh position={[8.4, 2.6, 0]} castShadow>
            <boxGeometry args={[3.4, 3.2, 2.5]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.5} />
          </mesh>
          <mesh position={[9.9, 3.2, 0]}>
            <boxGeometry args={[0.4, 1.3, 2.3]} />
            <meshStandardMaterial color="#1e293b" roughness={0.15} metalness={0.5} />
          </mesh>
          {[-5.5, -4.2, 5.6, 8.6].map((wx) => (
            <mesh key={wx} position={[wx, 0.55, 0]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.55, 0.55, 2.6, 10]} />
              <meshStandardMaterial color="#111827" roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[10.15, 1.8, 0.85]} material={head}>
            <boxGeometry args={[0.15, 0.4, 0.5]} />
          </mesh>
          <mesh position={[10.15, 1.8, -0.85]} material={head}>
            <boxGeometry args={[0.15, 0.4, 0.5]} />
          </mesh>
          <mesh position={[-7.55, 1.6, 0]} material={tail}>
            <boxGeometry args={[0.15, 0.3, 2.2]} />
          </mesh>
          <mesh position={[-0.6, 3.2, 0]} castShadow>
            <boxGeometry args={[12.2, 2.6, 2.44]} />
            <meshStandardMaterial color={colors[i]} map={getContainerTexture()} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </>
  )
}
