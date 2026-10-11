import { useStore } from '../store'
import { BERTH_LEN, LAND_Y, MAX_BERTHS, PAD, berthX } from './layout'
import FarLabel from './FarLabel'
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

/** Superficie de la terminal (en su propio marco): explanada, calles, patio y edificios. */
export default function TerminalPad() {
  const berths = useStore((s) => s.params.berths)
  const select = useStore((s) => s.select)
  const [x0, x1, z0, z1] = PAD
  const w = x1 - x0
  const ext = berthX(2)

  return (
    <group>
      <mesh position={[(x0 + x1) / 2, LAND_Y / 2 - 1, (z0 + z1) / 2]}>
        <boxGeometry args={[w, LAND_Y + 2, z1 - z0]} />
        <meshStandardMaterial color="#e3e7ed" roughness={1} />
      </mesh>
      {/* Ampliación hipotética del muelle 3: relleno sobre el agua */}
      <mesh position={[ext, LAND_Y / 2 - 1, 60]}>
        <boxGeometry args={[BERTH_LEN, LAND_Y + 2, 120]} />
        <meshStandardMaterial color="#e3e7ed" roughness={1} transparent opacity={berths >= 3 ? 1 : 0.35} />
      </mesh>
      <mesh position={[(x0 + x1) / 2, LAND_Y / 2, -0.8]}>
        <boxGeometry args={[w, LAND_Y + 0.4, 1.6]} />
        <meshStandardMaterial color="#8e99a8" roughness={1} />
      </mesh>
      <Strip x={0} z={35} w={w} d={70} color="#f4f5f7" />
      <Strip x={0} z={52} w={w} d={1.2} color="#f2c230" y={LAND_Y + 0.04} />
      <Strip x={0} z={78} w={w} d={12} color="#cdd3dc" />
      <Strip x={0} z={300} w={w} d={12} color="#cdd3dc" />
      <Strip x={-330} z={189} w={12} d={222} color="#cdd3dc" />
      <Strip x={330} z={189} w={12} d={222} color="#cdd3dc" />
      <mesh
        rotation-x={flat}
        position={[0, LAND_Y + 0.03, 185]}
        onClick={(e) => {
          e.stopPropagation()
          select({ kind: 'yard' })
        }}
      >
        <planeGeometry args={[620, 170]} />
        <meshStandardMaterial color="#d6dce5" roughness={1} />
      </mesh>
      <mesh position={[0, LAND_Y + 4, 345]}>
        <boxGeometry args={[80, 8, 14]} />
        <meshStandardMaterial color="#cfd8e3" />
      </mesh>
      <mesh position={[250, LAND_Y + 8, 345]}>
        <boxGeometry args={[60, 16, 30]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>

      {Array.from({ length: MAX_BERTHS }, (_, b) => (
        <FarLabel key={b} position={[berthX(b), LAND_Y + 1, 62]} maxDistance={2500}>
          <Tag tone={b < berths ? 'plain' : 'muted'}>
            {b < berths ? `Muelle ${b + 1}` : b === 2 ? 'Muelle 3 · ampliación hipotética' : `Muelle ${b + 1} · cerrado`}
          </Tag>
        </FarLabel>
      ))}
      <FarLabel position={[0, LAND_Y, 185]} maxDistance={2500}>
        <Tag tone="muted">Patio de contenedores</Tag>
      </FarLabel>
    </group>
  )
}
