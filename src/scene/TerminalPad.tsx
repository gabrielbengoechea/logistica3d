import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStore } from '../store'
import FarLabel from './FarLabel'
import { BERTH_LEN, LAND_Y, MAX_BERTHS, PAD, berthX } from './layout'
import { box, getConcreteTexture, getHaloTexture } from './materials'
import Tag from './Tag'
import { useGlowMaterial, useHaloMaterial } from './useGlow'

const flat = -Math.PI / 2
/** Capas del piso, separadas en altura para que no titilen a distancia. */
const LAYER = { slab: LAND_Y + 0.06, road: LAND_Y + 0.1, line: LAND_Y + 0.16, halo: LAND_Y + 0.2 }

/** Hormigón con juntas a escala real (la textura cubre 20 x 20 m). */
function useConcrete(w: number, d: number, tint: string) {
  return useMemo(() => {
    const map = getConcreteTexture().clone()
    map.repeat.set(w / 20, d / 20)
    map.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map, color: tint, roughness: 0.95 })
  }, [w, d, tint])
}

function Slab({ x, z, w, d, tint, y = LAYER.slab, onClick }: { x: number; z: number; w: number; d: number; tint: string; y?: number; onClick?: () => void }) {
  const material = useConcrete(w, d, tint)
  return (
    <mesh
      rotation-x={flat}
      position={[x, y, z]}
      receiveShadow
      material={material}
      onClick={
        onClick &&
        ((e) => {
          e.stopPropagation()
          onClick()
        })
      }
    >
      <planeGeometry args={[w, d]} />
    </mesh>
  )
}

function Asphalt({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  return (
    <mesh rotation-x={flat} position={[x, LAYER.road, z]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color="#8d96a2" roughness={0.9} />
    </mesh>
  )
}

/** Superficie de la terminal (en su propio marco): explanada, calles, patio, borde de muelle y edificios. */
export default function TerminalPad() {
  const berths = useStore((s) => s.params.berths)
  const select = useStore((s) => s.select)
  const [x0, x1, z0, z1] = PAD
  const w = x1 - x0
  const ext = berthX(2)
  const base = useConcrete(w, z1 - z0, '#e4e7eb')

  return (
    <group>
      <mesh position={[(x0 + x1) / 2, LAND_Y / 2 - 1, (z0 + z1) / 2]} receiveShadow material={base}>
        <boxGeometry args={[w, LAND_Y + 2, z1 - z0]} />
      </mesh>
      {/* Ampliación hipotética del muelle 3: relleno sobre el agua */}
      <mesh position={[ext, LAND_Y / 2 - 1, 60]} receiveShadow>
        <boxGeometry args={[BERTH_LEN, LAND_Y + 2, 120]} />
        <meshStandardMaterial color="#e3e7ed" roughness={1} transparent opacity={berths >= 3 ? 1 : 0.35} />
      </mesh>
      <Slab x={0} z={35} w={w} d={70} tint="#f5f6f7" />
      <Slab x={0} z={185} w={620} d={170} tint="#d4dae2" onClick={() => select({ kind: 'yard' })} />
      <Asphalt x={0} z={78} w={w} d={12} />
      <Asphalt x={0} z={300} w={w} d={12} />
      <Asphalt x={-330} z={189} w={12} d={222} />
      <Asphalt x={330} z={189} w={12} d={222} />
      <Asphalt x={0} z={345} w={14} d={70} />
      <Details />
      <Buildings />

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

const flatBox = (cx: number, cz: number, sx: number, sz: number, y = LAYER.line) => box(cx, y, cz, sx, 0.02, sz)
const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
const MASTS: [number, number][] = []
for (const x of [-320, -160, 0, 160, 320]) for (const z of [157.5, 212.5]) MASTS.push([x, z])
for (const x of [-240, 0, 240]) MASTS.push([x, 60])

/** Marcas de piso, borde del muelle (defensas y bitas), rieles de las grúas y torres de iluminación. */
function Details() {
  const geo = useMemo(() => {
    const marks: THREE.BufferGeometry[] = []
    for (let x = -320; x < 320; x += 14) marks.push(flatBox(x, 78, 7, 0.35), flatBox(x, 300, 7, 0.35))
    for (let z = 90; z < 290; z += 14) marks.push(flatBox(-330, z, 0.35, 7), flatBox(330, z, 0.35, 7))
    // Contorno de cada bloque del patio (mismo trazado que yardSlots).
    for (const bx of [-240, -80, 80, 240])
      for (const bz of [130, 185, 240]) {
        marks.push(flatBox(bx, bz - 9.6, 128, 0.4), flatBox(bx, bz + 9.6, 128, 0.4))
        marks.push(flatBox(bx - 64, bz, 0.4, 19.6), flatBox(bx + 64, bz, 0.4, 19.6))
      }
    // Pasos peatonales y flechas de circulación en la calle del muelle.
    for (const x of [-200, 0, 200]) for (let k = 0; k < 6; k++) marks.push(flatBox(x - 6 + k * 2.4, 78, 1.2, 10))
    const yellow = merge([flatBox(0, 52, 680, 1.2), flatBox(0, 2.2, 680, 0.6)])
    const rails = merge([flatBox(0, 6, 680, 0.8), flatBox(0, 34, 680, 0.8)])
    // Borde del muelle: viga de coronamiento, defensas de goma sobre el agua y bitas para las amarras.
    const edge: THREE.BufferGeometry[] = [box(0, LAND_Y - 0.4, -0.9, 680, LAND_Y + 1.2, 1.8)]
    const fenders: THREE.BufferGeometry[] = []
    const bollards: THREE.BufferGeometry[] = []
    for (let x = -332; x <= 332; x += 16) {
      fenders.push(box(x, 0.6, -2.1, 3, 3.2, 1.2))
      bollards.push(new THREE.CylinderGeometry(0.45, 0.55, 1.1, 10).translate(x + 8, LAND_Y + 0.55, 2.2))
    }
    const masts: THREE.BufferGeometry[] = []
    const lamps: THREE.BufferGeometry[] = []
    for (const [x, z] of MASTS) {
      masts.push(new THREE.CylinderGeometry(0.35, 0.6, 35, 8).translate(x, LAND_Y + 17.5, z))
      masts.push(box(x, LAND_Y + 34.6, z, 5, 0.5, 1.2))
      lamps.push(box(x - 1.6, LAND_Y + 34.1, z, 1.2, 0.5, 0.9), box(x + 1.6, LAND_Y + 34.1, z, 1.2, 0.5, 0.9))
    }
    return { marks: merge(marks), yellow, rails, edge: merge(edge), fenders: merge(fenders), bollards: merge(bollards), masts: merge(masts), lamps: merge(lamps) }
  }, [])
  const lamp = useGlowMaterial('#ffe1a8', 0.2, 9)
  const halo = useHaloMaterial(getHaloTexture(), 0.55)
  return (
    <>
      <mesh geometry={geo.marks}>
        <meshStandardMaterial color="#ffffff" roughness={0.8} />
      </mesh>
      <mesh geometry={geo.yellow}>
        <meshStandardMaterial color="#f2c230" roughness={0.8} />
      </mesh>
      <mesh geometry={geo.rails}>
        <meshStandardMaterial color="#5b6472" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh geometry={geo.edge} receiveShadow castShadow>
        <meshStandardMaterial color="#b9c0c9" roughness={0.9} />
      </mesh>
      <mesh geometry={geo.fenders}>
        <meshStandardMaterial color="#1f2328" roughness={0.9} />
      </mesh>
      <mesh geometry={geo.bollards} castShadow>
        <meshStandardMaterial color="#2b3038" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh geometry={geo.masts} castShadow>
        <meshStandardMaterial color="#9aa5b4" roughness={0.45} metalness={0.5} />
      </mesh>
      <mesh geometry={geo.lamps} material={lamp} />
      {MASTS.map(([x, z]) => (
        <mesh key={`${x},${z}`} rotation-x={flat} position={[x, LAYER.halo, z]} material={halo}>
          <planeGeometry args={[70, 70]} />
        </mesh>
      ))}
    </>
  )
}

/** Portería con techo y oficinas de la terminal; de noche, ventanas encendidas. */
function Buildings() {
  const windows = useGlowMaterial('#ffd79a', 0.05, 2.2)
  return (
    <>
      <mesh position={[0, LAND_Y + 7.5, 345]} castShadow receiveShadow>
        <boxGeometry args={[90, 1.2, 24]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.5} />
      </mesh>
      {[-36, -12, 12, 36].map((x) => (
        <mesh key={x} position={[x, LAND_Y + 3.5, 345]} castShadow>
          <boxGeometry args={[3, 7, 3]} />
          <meshStandardMaterial color="#cfd8e3" />
        </mesh>
      ))}
      <mesh position={[250, LAND_Y + 8, 345]} castShadow receiveShadow>
        <boxGeometry args={[60, 16, 30]} />
        <meshStandardMaterial color="#f1f4f8" roughness={0.6} />
      </mesh>
      {[4, 8.5, 13].map((y) => (
        <mesh key={y} position={[250, LAND_Y + y, 329.9]} material={windows}>
          <boxGeometry args={[56, 1.6, 0.4]} />
        </mesh>
      ))}
      <mesh position={[-250, LAND_Y + 6, 345]} castShadow receiveShadow>
        <boxGeometry args={[70, 12, 34]} />
        <meshStandardMaterial color="#c9d3df" roughness={0.7} metalness={0.2} />
      </mesh>
    </>
  )
}
