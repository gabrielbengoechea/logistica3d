import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStore } from '../store'
import FarLabel from './FarLabel'
import { AMP, AMP_QUAY, BERTHS, LAND_Y, MAX_BERTHS, QUAY, YARD, berthToTerminal } from './layout'
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

const QUAY_LEN = QUAY[1] - QUAY[0]
const QUAY_MID = (QUAY[0] + QUAY[1]) / 2
const YARD_X: [number, number] = [YARD.blocksX[0] - 26, YARD.blocksX[YARD.blocksX.length - 1] + 26]
const YARD_Z: [number, number] = [YARD.blocksZ[0] - 75, YARD.blocksZ[YARD.blocksZ.length - 1] + 75]

/**
 * Terminal de contenedores (TCP), en su propio marco: muelle de Escala, explanada de las grúas, patio de
 * straddle carriers, zona de camiones, portería y la ampliación sobre la cara oeste. La explanada general del
 * puerto (el piso) la dibuja Port.tsx a partir del contorno real.
 */
export default function TerminalPad() {
  const berths = useStore((s) => s.params.berths)
  const select = useStore((s) => s.select)

  return (
    <group>
      <Amplification active={berths >= 3} />
      <Slab x={QUAY_MID} z={45} w={QUAY_LEN} d={90} tint="#f3f4f6" />
      <Slab
        x={(YARD_X[0] + YARD_X[1]) / 2}
        z={(YARD_Z[0] + YARD_Z[1]) / 2}
        w={YARD_X[1] - YARD_X[0]}
        d={YARD_Z[1] - YARD_Z[0]}
        tint="#d4dae2"
        onClick={() => select({ kind: 'yard' })}
      />
      <Asphalt x={-75} z={118} w={570} d={14} />
      <Asphalt x={-356} z={380} w={14} d={540} />
      <Asphalt x={205} z={400} w={14} d={560} />
      <Asphalt x={-62} z={644} w={545} d={46} />
      <QuayEdge length={QUAY_LEN} x={QUAY_MID} z={0} a={0} />
      <YardMarks />
      <Masts />
      <Buildings />

      {BERTHS.slice(0, 2).map((b, i) => (
        <FarLabel key={i} position={[b.x, LAND_Y + 1, 66]} maxDistance={2500}>
          <Tag tone={i < berths ? 'plain' : 'muted'}>{i < berths ? b.name : `${b.name} · cerrado`}</Tag>
        </FarLabel>
      ))}
      <FarLabel position={[...offset(BERTHS[2], 0, 60)]} maxDistance={2800}>
        <Tag tone={berths >= MAX_BERTHS ? 'plain' : 'muted'}>{berths >= MAX_BERTHS ? 'Muelle 3 · ampliación de TCP' : 'Ampliación de TCP · en obra'}</Tag>
      </FarLabel>
      <FarLabel position={[-60, LAND_Y + 4, 360]} maxDistance={3500}>
        <Tag tone="muted">Terminal de contenedores (TCP)</Tag>
      </FarLabel>
    </group>
  )
}

function offset(b: (typeof BERTHS)[number], lx: number, lz: number): [number, number, number] {
  const [x, z] = berthToTerminal(BERTHS.indexOf(b), lx, lz)
  return [x, LAND_Y + 1, z]
}

const flatBox = (cx: number, cz: number, sx: number, sz: number, y = LAYER.line) => box(cx, y, cz, sx, 0.02, sz)
const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!

/**
 * Borde de un muelle de largo `length`, centrado en (x, z) y girado `a`: viga de coronamiento, defensas sobre el
 * agua, bitas, rieles de las grúas y la línea amarilla de seguridad.
 */
function QuayEdge({ length, x, z, a, dim = false }: { length: number; x: number; z: number; a: number; dim?: boolean }) {
  const geo = useMemo(() => {
    const half = length / 2
    const edge = [box(0, LAND_Y - 0.4, -0.9, length, LAND_Y + 1.2, 1.8)]
    const fenders: THREE.BufferGeometry[] = []
    const bollards: THREE.BufferGeometry[] = []
    for (let lx = -half + 8; lx <= half - 8; lx += 16) {
      fenders.push(box(lx, 0.6, -2.1, 3, 3.2, 1.2))
      bollards.push(new THREE.CylinderGeometry(0.45, 0.55, 1.1, 10).translate(lx + 8, LAND_Y + 0.55, 2.2))
    }
    return {
      edge: merge(edge),
      fenders: merge(fenders),
      bollards: merge(bollards),
      rails: merge([flatBox(0, 6, length, 0.8), flatBox(0, 34, length, 0.8)]),
      yellow: merge([flatBox(0, 52, length, 1.2), flatBox(0, 2.2, length, 0.6)]),
    }
  }, [length])
  return (
    <group position={[x, 0, z]} rotation-y={a}>
      <mesh geometry={geo.edge} receiveShadow castShadow>
        <meshStandardMaterial color="#b9c0c9" roughness={0.9} />
      </mesh>
      <mesh geometry={geo.fenders}>
        <meshStandardMaterial color="#1f2328" roughness={0.9} />
      </mesh>
      {!dim && (
        <>
          <mesh geometry={geo.bollards} castShadow>
            <meshStandardMaterial color="#2b3038" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh geometry={geo.rails}>
            <meshStandardMaterial color="#5b6472" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh geometry={geo.yellow}>
            <meshStandardMaterial color="#f2c230" roughness={0.8} />
          </mesh>
        </>
      )}
    </group>
  )
}

/**
 * Ampliación de TCP sobre la cara oeste (muelle de 730 m, en construcción). El relleno se dibuja un poco más
 * bajo que la explanada del puerto, así donde ya hay tierra manda el contorno real. En obra se ve como relleno
 * de arena; habilitado como tercer muelle, como hormigón con su borde de muelle.
 */
function Amplification({ active }: { active: boolean }) {
  const geometry = useMemo(() => {
    const ring: [number, number][] = [[QUAY[0], 0], AMP_QUAY[0], AMP_QUAY[1], [-378, 780], [-300, 300]]
    const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)))
    const g = new THREE.ExtrudeGeometry(shape, { depth: LAND_Y + 3.9, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    g.translate(0, -4, 0)
    return g
  }, [])
  const mid: [number, number] = [(AMP_QUAY[0][0] + AMP_QUAY[1][0]) / 2, (AMP_QUAY[0][1] + AMP_QUAY[1][1]) / 2]
  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial color={active ? '#d9dde2' : '#cdbf9f'} roughness={1} />
      </mesh>
      <QuayEdge length={AMP.len} x={mid[0]} z={mid[1]} a={AMP.a} dim={!active} />
    </>
  )
}

/** Contorno de cada bloque, líneas de cada fila y flechas de circulación en las calles. */
function YardMarks() {
  const geo = useMemo(() => {
    const marks: THREE.BufferGeometry[] = []
    const w = YARD.rows * YARD.rowPitch
    const d = YARD.bays * YARD.bay
    for (const bx of YARD.blocksX)
      for (const bz of YARD.blocksZ) {
        marks.push(flatBox(bx, bz - d / 2 - 1, w + 2, 0.4), flatBox(bx, bz + d / 2 + 1, w + 2, 0.4))
        for (let r = 0; r <= YARD.rows; r++) marks.push(flatBox(bx - w / 2 + r * YARD.rowPitch, bz, 0.25, d))
      }
    for (let x = -340; x < 200; x += 14) marks.push(flatBox(x, 118, 7, 0.35))
    for (let z = 130; z < 640; z += 14) marks.push(flatBox(-356, z, 0.35, 7), flatBox(205, z, 0.35, 7))
    return merge(marks)
  }, [])
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#ffffff" roughness={0.8} />
    </mesh>
  )
}

const MASTS: [number, number][] = []
for (const x of [-330, -200, -70, 60, 185]) for (const z of [125, 277, 431, 600]) MASTS.push([x, z])
for (const x of [-250, -50, 150]) MASTS.push([x, 70])

/** Torres de iluminación de 35 m sobre el patio y la explanada, con su mancha de luz de noche. */
function Masts() {
  const geo = useMemo(() => {
    const masts: THREE.BufferGeometry[] = []
    const lamps: THREE.BufferGeometry[] = []
    for (const [x, z] of MASTS) {
      masts.push(new THREE.CylinderGeometry(0.35, 0.6, 35, 8).translate(x, LAND_Y + 17.5, z))
      masts.push(box(x, LAND_Y + 34.6, z, 5, 0.5, 1.2))
      lamps.push(box(x - 1.6, LAND_Y + 34.1, z, 1.2, 0.5, 0.9), box(x + 1.6, LAND_Y + 34.1, z, 1.2, 0.5, 0.9))
    }
    return { masts: merge(masts), lamps: merge(lamps) }
  }, [])
  const lamp = useGlowMaterial('#ffe1a8', 0.2, 9)
  const halo = useHaloMaterial(getHaloTexture(), 0.55)
  return (
    <>
      <mesh geometry={geo.masts} castShadow>
        <meshStandardMaterial color="#9aa5b4" roughness={0.45} metalness={0.5} />
      </mesh>
      <mesh geometry={geo.lamps} material={lamp} />
      {MASTS.map(([x, z]) => (
        <mesh key={`${x},${z}`} rotation-x={flat} position={[x, LAYER.halo, z]} material={halo}>
          <planeGeometry args={[80, 80]} />
        </mesh>
      ))}
    </>
  )
}

/** Portería sobre el Acceso Washington, oficinas, taller y depósito; de noche, ventanas encendidas. */
function Buildings() {
  const windows = useGlowMaterial('#ffd79a', 0.05, 2.2)
  return (
    <>
      {/* Portería: techo sobre los carriles de entrada y salida */}
      <mesh position={[205, LAND_Y + 7.5, 700]} castShadow receiveShadow>
        <boxGeometry args={[30, 1.2, 70]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.5} />
      </mesh>
      {[675, 692, 708, 725].map((z) => (
        <mesh key={z} position={[205, LAND_Y + 3.5, z]} castShadow>
          <boxGeometry args={[3, 7, 3]} />
          <meshStandardMaterial color="#cfd8e3" />
        </mesh>
      ))}
      {/* Oficinas */}
      <mesh position={[100, LAND_Y + 8, 735]} castShadow receiveShadow>
        <boxGeometry args={[70, 16, 30]} />
        <meshStandardMaterial color="#f1f4f8" roughness={0.6} />
      </mesh>
      {[4, 8.5, 13].map((y) => (
        <mesh key={y} position={[100, LAND_Y + y, 719.9]} material={windows}>
          <boxGeometry args={[66, 1.6, 0.4]} />
        </mesh>
      ))}
      {/* Depósito logístico (7.000 m²) y taller de mantenimiento */}
      <mesh position={[-120, LAND_Y + 7, 730]} castShadow receiveShadow>
        <boxGeometry args={[140, 14, 50]} />
        <meshStandardMaterial color="#c9d3df" roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position={[-290, LAND_Y + 6, 700]} castShadow receiveShadow>
        <boxGeometry args={[60, 12, 40]} />
        <meshStandardMaterial color="#b8c4d2" roughness={0.7} metalness={0.2} />
      </mesh>
    </>
  )
}
