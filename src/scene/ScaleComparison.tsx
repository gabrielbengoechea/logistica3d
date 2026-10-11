import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import { useStore } from '../store'
import { LAND_Y } from './layout'
import { hullGeometry } from './Ships'
import Tag from './Tag'

const flat = -Math.PI / 2
const Y = LAND_Y + 0.06

/** Comparador de escalas en tierra libre al oeste de la terminal. Medidas aproximadas. */
export default function ScaleComparison() {
  const visible = useStore((s) => s.view === 'escalas')
  const ship = useMemo(() => hullGeometry(300, 46, 1.5), [])
  if (!visible) return null
  const line = (x: number, z: number, w: number, d: number) => (
    <mesh rotation-x={flat} position={[x, Y + 0.02, z]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial color="#ffffff" />
    </mesh>
  )
  return (
    <group>
      {/* Portacontenedores de 300 m, a escala */}
      <mesh geometry={ship} position={[-950, LAND_Y, 105]}>
        <meshStandardMaterial color="#26416b" />
      </mesh>
      <Html position={[-950, LAND_Y + 4, 105]} center zIndexRange={[10, 0]}>
        <Tag tone="accent">Portacontenedores típico · 300 m</Tag>
      </Html>

      {/* Cancha de fútbol, 105 x 68 m */}
      <mesh rotation-x={flat} position={[-1047.5, Y, 210]}>
        <planeGeometry args={[105, 68]} />
        <meshStandardMaterial color="#5fae5a" />
      </mesh>
      {line(-1047.5, 176.5, 105, 0.8)}
      {line(-1047.5, 243.5, 105, 0.8)}
      {line(-1099.6, 210, 0.8, 68)}
      {line(-995.4, 210, 0.8, 68)}
      {line(-1047.5, 210, 0.8, 68)}
      <Html position={[-1047.5, Y, 210]} center zIndexRange={[10, 0]}>
        <Tag>Cancha del Centenario · 105 x 68 m</Tag>
      </Html>

      {/* Una cuadra de Montevideo */}
      <mesh rotation-x={flat} position={[-1050, Y, 300]}>
        <planeGeometry args={[100, 16]} />
        <meshStandardMaterial color="#b9c2cf" />
      </mesh>
      <Html position={[-1050, Y, 300]} center zIndexRange={[10, 0]}>
        <Tag>Una cuadra · ≈ 100 m</Tag>
      </Html>

      {/* Palacio Salvo: la referencia es la altura */}
      <mesh position={[-760, LAND_Y + 50, 215]}>
        <boxGeometry args={[26, 100, 26]} />
        <meshStandardMaterial color="#e9e1d0" />
      </mesh>
      <Html position={[-760, LAND_Y + 104, 215]} center zIndexRange={[10, 0]}>
        <Tag>Palacio Salvo · ≈ 100 m de alto</Tag>
      </Html>
    </group>
  )
}
