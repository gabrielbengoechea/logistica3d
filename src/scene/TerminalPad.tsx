import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStore } from '../store'
import { box } from './materials'
import { BERTH_LEN, LAND_Y, MAX_BERTHS, PAD, berthX } from './layout'
import FarLabel from './FarLabel'
import Tag from './Tag'

const flat = -Math.PI / 2

function Strip({ x, z, w, d, color, y = LAND_Y + 0.02 }: { x: number; z: number; w: number; d: number; color: string; y?: number }) {
  return (
    <mesh rotation-x={flat} position={[x, y, z]} receiveShadow>
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
      <mesh position={[(x0 + x1) / 2, LAND_Y / 2 - 1, (z0 + z1) / 2]} receiveShadow>
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
        receiveShadow
        position={[0, LAND_Y + 0.03, 185]}
        onClick={(e) => {
          e.stopPropagation()
          select({ kind: 'yard' })
        }}
      >
        <planeGeometry args={[620, 170]} />
        <meshStandardMaterial color="#d6dce5" roughness={1} />
      </mesh>
      <Details />
      <mesh position={[0, LAND_Y + 4, 345]} castShadow>
        <boxGeometry args={[80, 8, 14]} />
        <meshStandardMaterial color="#cfd8e3" />
      </mesh>
      <mesh position={[250, LAND_Y + 8, 345]} castShadow>
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

const Y = LAND_Y + 0.05
const flatBox = (cx: number, cz: number, sx: number, sz: number) => box(cx, Y, cz, sx, 0.02, sz)
const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!

/** Marcas de piso, rieles de las grúas y torres de iluminación del patio. */
function Details() {
  const geo = useMemo(() => {
    const marks: THREE.BufferGeometry[] = []
    // Líneas discontinuas al centro de las calles.
    for (let x = -320; x < 320; x += 14) marks.push(flatBox(x, 78, 7, 0.35), flatBox(x, 300, 7, 0.35))
    for (let z = 90; z < 290; z += 14) marks.push(flatBox(-330, z, 0.35, 7), flatBox(330, z, 0.35, 7))
    // Contorno de cada bloque del patio (mismo trazado que yardSlots).
    for (const bx of [-240, -80, 80, 240])
      for (const bz of [130, 185, 240]) {
        marks.push(flatBox(bx, bz - 9.6, 128, 0.4), flatBox(bx, bz + 9.6, 128, 0.4))
        marks.push(flatBox(bx - 64, bz, 0.4, 19.6), flatBox(bx + 64, bz, 0.4, 19.6))
      }
    const rails = merge([flatBox(0, 6, 680, 0.8), flatBox(0, 34, 680, 0.8)])
    const masts: THREE.BufferGeometry[] = []
    const lamps: THREE.BufferGeometry[] = []
    for (const x of [-320, -160, 0, 160, 320])
      for (const z of [157.5, 212.5]) {
        masts.push(box(x, LAND_Y + 17.5, z, 0.9, 35, 0.9))
        lamps.push(box(x, LAND_Y + 35.5, z, 4, 1.2, 4))
      }
    return { marks: merge(marks), rails, masts: merge(masts), lamps: merge(lamps) }
  }, [])
  return (
    <>
      <mesh geometry={geo.marks}>
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </mesh>
      <mesh geometry={geo.rails}>
        <meshStandardMaterial color="#5b6472" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh geometry={geo.masts} castShadow>
        <meshStandardMaterial color="#9aa5b4" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh geometry={geo.lamps}>
        <meshStandardMaterial color="#fff7d6" emissive="#fff1b8" emissiveIntensity={0.8} />
      </mesh>
    </>
  )
}
