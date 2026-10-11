import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { useStore } from '../store'
import { hullGeometry } from './Ships'
import Tag from './Tag'

const flat = -Math.PI / 2
const Y = 1.2
/** Centro del comparador en el mapa: agua tranquila de la bahía, lejos de las rutas de los buques. */
export const SCALE_AT: [number, number] = [-1500, -2300]

/** Comparador de escalas: siluetas a escala real flotando sobre la bahía. Medidas aproximadas. */
export default function ScaleComparison() {
  const visible = useStore((s) => s.view === 'escalas')
  const ship = useMemo(() => hullGeometry(300, 46, 1.5), [])
  if (!visible) return null
  const line = (x: number, z: number, w: number, d: number) => (
    <mesh rotation-x={flat} position={[x, Y + 0.05, z]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial color="#ffffff" />
    </mesh>
  )
  return (
    <group position={[SCALE_AT[0], 0, SCALE_AT[1]]}>
      {/* Portacontenedores de 300 m */}
      <mesh geometry={ship} position={[0, 0.6, -110]}>
        <meshStandardMaterial color="#26416b" />
      </mesh>
      <Html position={[0, 6, -110]} center zIndexRange={[10, 0]}>
        <Tag tone="accent">Portacontenedores típico · 300 m</Tag>
      </Html>

      {/* Cancha de fútbol, 105 x 68 m */}
      <mesh rotation-x={flat} position={[-97.5, Y, 0]}>
        <planeGeometry args={[105, 68]} />
        <meshStandardMaterial color="#5fae5a" />
      </mesh>
      {line(-97.5, -33.5, 105, 0.8)}
      {line(-97.5, 33.5, 105, 0.8)}
      {line(-149.6, 0, 0.8, 68)}
      {line(-45.4, 0, 0.8, 68)}
      {line(-97.5, 0, 0.8, 68)}
      <Html position={[-97.5, Y, 0]} center zIndexRange={[10, 0]}>
        <Tag>Cancha del Centenario · 105 x 68 m</Tag>
      </Html>

      {/* Una cuadra de Montevideo */}
      <mesh rotation-x={flat} position={[-100, Y, 95]}>
        <planeGeometry args={[100, 16]} />
        <meshStandardMaterial color="#b9c2cf" />
      </mesh>
      <Html position={[-100, Y, 95]} center zIndexRange={[10, 0]}>
        <Tag>Una cuadra · ≈ 100 m</Tag>
      </Html>

      {/* Torre de 100 m, la altura del Palacio Salvo */}
      <mesh position={[-260, 50, 30]}>
        <boxGeometry args={[26, 100, 26]} />
        <meshStandardMaterial color="#e9e1d0" />
      </mesh>
      <Html position={[-260, 104, 30]} center zIndexRange={[10, 0]}>
        <Tag>Palacio Salvo · ≈ 100 m de alto</Tag>
      </Html>
    </group>
  )
}
