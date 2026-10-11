import { Html } from '@react-three/drei'
import { useStore } from '../store'
import { CHANNEL, LAND_Y, MAX_BERTHS, berthX } from './layout'
import Tag from './Tag'

const flat = -Math.PI / 2

function Strip({ x, z, w, d, color, y = LAND_Y + 0.02 }: { x: number; z: number; w: number; d: number; color: string; y?: number }) {
  return (
    <mesh rotation-x={flat} position={[x, y, z]}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  )
}

export default function Ground() {
  const berths = useStore((s) => s.params.berths)
  const select = useStore((s) => s.select)

  // Canal de acceso: desde la entrada hasta frente a los muelles.
  const end: [number, number] = [0, -420]
  const len = Math.hypot(end[0] - CHANNEL[0], end[1] - CHANNEL[1])
  const yaw = Math.atan2(-(end[1] - CHANNEL[1]), end[0] - CHANNEL[0])
  const mid: [number, number] = [(end[0] + CHANNEL[0]) / 2, (end[1] + CHANNEL[1]) / 2]

  return (
    <group>
      {/* Agua */}
      <Strip x={0} z={0} w={16000} d={16000} color="#a9d6ea" y={0} />
      <group position={[mid[0], 0.3, mid[1]]} rotation-y={yaw}>
        <mesh rotation-x={flat}>
          <planeGeometry args={[len, 220]} />
          <meshStandardMaterial color="#95cbe2" roughness={1} />
        </mesh>
      </group>

      {/* Tierra: explanada, muelle, patio y calles */}
      <mesh position={[-200, LAND_Y / 2, 220]}>
        <boxGeometry args={[2000, LAND_Y, 440]} />
        <meshStandardMaterial color="#e3e7ed" roughness={1} />
      </mesh>
      <mesh position={[0, LAND_Y / 2, -0.8]}>
        <boxGeometry args={[1100, LAND_Y + 0.4, 1.6]} />
        <meshStandardMaterial color="#8e99a8" roughness={1} />
      </mesh>
      <Strip x={0} z={35} w={1100} d={70} color="#f4f5f7" />
      <Strip x={0} z={52} w={1100} d={1.2} color="#f2c230" y={LAND_Y + 0.04} />
      <Strip x={0} z={78} w={1100} d={12} color="#cdd3dc" />
      <Strip x={0} z={240} w={1100} d={12} color="#cdd3dc" />
      <Strip x={-545} z={159} w={12} d={170} color="#cdd3dc" />
      <Strip x={545} z={159} w={12} d={170} color="#cdd3dc" />
      <Strip x={0} z={290} w={14} d={100} color="#cdd3dc" />
      <mesh
        rotation-x={flat}
        position={[0, LAND_Y + 0.03, 158]}
        onClick={(e) => {
          e.stopPropagation()
          select({ kind: 'yard' })
        }}
      >
        <planeGeometry args={[1000, 110]} />
        <meshStandardMaterial color="#d6dce5" roughness={1} />
      </mesh>

      {/* Edificios: portería, oficinas y taller */}
      <mesh position={[0, LAND_Y + 4, 330]}>
        <boxGeometry args={[80, 8, 14]} />
        <meshStandardMaterial color="#cfd8e3" />
      </mesh>
      <mesh position={[640, LAND_Y + 9, 150]}>
        <boxGeometry args={[60, 18, 40]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[640, LAND_Y + 6, 230]}>
        <boxGeometry args={[70, 12, 50]} />
        <meshStandardMaterial color="#dbe3ee" />
      </mesh>

      {Array.from({ length: MAX_BERTHS }, (_, b) => (
        <Html key={b} position={[berthX(b), LAND_Y + 1, 62]} center zIndexRange={[10, 0]}>
          <Tag tone={b < berths ? 'plain' : 'muted'}>{b < berths ? `Muelle ${b + 1}` : `Muelle ${b + 1} · cerrado`}</Tag>
        </Html>
      ))}
      <Html position={[0, 0, -1700]} center zIndexRange={[10, 0]}>
        <Tag tone="muted">Fondeadero</Tag>
      </Html>
      <Html position={[mid[0], 0, mid[1]]} center zIndexRange={[10, 0]}>
        <Tag tone="muted">Canal de acceso</Tag>
      </Html>
      <Html position={[0, LAND_Y, 158]} center zIndexRange={[10, 0]}>
        <Tag tone="muted">Patio de contenedores</Tag>
      </Html>
    </group>
  )
}
