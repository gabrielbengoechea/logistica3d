import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, Html } from '@react-three/drei'
import * as THREE from 'three'
import { mulberry32 } from '../sim/rng'
import type { Track } from '../sim/tracks'
import { useStore } from '../store'
import { CONTAINER_COLORS } from './layout'
import { getContainerTexture } from './materials'
import { shipPose } from './pose'
import Tag from './Tag'

const HULL_H = 13
const FUNNEL_COLORS = ['#c94a3d', '#1f6fb5', '#e8a33b', '#2e8b57', '#f8fafc']

/** Contorno del casco visto desde arriba (proa redondeada hacia +x, popa con esquinas suaves). */
function hullShape(length: number, beam: number) {
  const s = new THREE.Shape()
  const L = length / 2
  const b = beam / 2
  const bow = Math.min(beam * 1.6, length * 0.22)
  const r = beam * 0.22
  s.moveTo(-L + r, -b)
  s.lineTo(L - bow, -b)
  s.quadraticCurveTo(L - bow * 0.2, -b, L, 0)
  s.quadraticCurveTo(L - bow * 0.2, b, L - bow, b)
  s.lineTo(-L + r, b)
  s.quadraticCurveTo(-L, b, -L, b - r)
  s.lineTo(-L, -b + r)
  s.quadraticCurveTo(-L, -b, -L + r, -b)
  return s
}

/** Casco extruido hacia arriba entre y0 e y1. */
export function hullGeometry(length: number, beam: number, height: number, y0 = 0) {
  const g = new THREE.ExtrudeGeometry(hullShape(length, beam), { depth: height, bevelEnabled: false, curveSegments: 10 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  return g
}

export default function Ships() {
  const tracks = useStore((s) => s.tracks)
  return (
    <>
      {tracks.map((tr) => (
        <Ship key={tr.ship.id} track={tr} />
      ))}
    </>
  )
}

function Ship({ track }: { track: Track }) {
  const group = useRef<THREE.Group>(null)
  const cargo = useRef<THREE.InstancedMesh>(null)
  const tag = useRef<HTMLDivElement>(null)
  const { length: L, beam: B, id, name } = track.ship
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selection?.kind === 'ship' && s.selection.id === id)

  useFrame(() => {
    const { t, params } = useStore.getState()
    const pose = shipPose(track, t, params)
    const g = group.current!
    const visible = pose.phase !== 'hidden'
    g.visible = visible
    if (tag.current) tag.current.style.display = visible ? 'block' : 'none'
    if (!visible) return
    g.position.set(pose.x, 0, pose.z)
    g.rotation.y = pose.yaw
    // Las grúas sacan primero los contenedores de arriba: las instancias van ordenadas por altura.
    const m = cargo.current
    if (m) m.count = Math.round((m.userData.total as number) * pose.load)
  })

  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation()
        select({ kind: 'ship', id })
      }}
    >
      <ShipBody length={L} beam={B} seed={track.index + 1} selected={selected} label={selected ? `${id} · ${name}` : id} cargoRef={cargo} tagRef={tag} />
    </group>
  )
}

/** Modelo de un buque portacontenedores (proa hacia +x), con contenedores opcionales y etiqueta. */
export function ShipBody({
  length: L,
  beam: B,
  seed,
  selected,
  label,
  cargo = true,
  cargoRef,
  tagRef,
}: {
  length: number
  beam: number
  seed: number
  selected: boolean
  label: string
  cargo?: boolean
  cargoRef?: React.RefObject<THREE.InstancedMesh | null>
  tagRef?: React.Ref<HTMLDivElement>
}) {
  const parts = useMemo(
    () => ({
      bottom: hullGeometry(L, B, 2.4),
      boot: hullGeometry(L * 1.001, B * 1.01, 0.7, 2.4),
      top: hullGeometry(L, B, HULL_H - 3.1, 3.1),
    }),
    [L, B],
  )
  const stack = useMemo(() => {
    const rand = mulberry32(seed)
    const bow = Math.min(B * 1.6, L * 0.22)
    const rows = Math.max(3, Math.floor((B * 0.86) / 2.55))
    const bays: { x: number; tiers: number }[] = []
    for (let x = -L / 2 + 34; x < L / 2 - bow * 0.75; x += 13.2) bays.push({ x, tiers: 3 + Math.floor(rand() * 4) })
    const items: { x: number; y: number; z: number; color: string }[] = []
    const maxTier = Math.max(...bays.map((b) => b.tiers), 0)
    // Orden por altura: con count se esconden primero los de arriba.
    for (let tier = 0; tier < maxTier; tier++)
      for (const b of bays)
        for (let r = 0; r < rows; r++)
          if (tier < b.tiers) items.push({ x: b.x, y: HULL_H + 1.3 + tier * 2.6, z: (r - (rows - 1) / 2) * 2.55, color: CONTAINER_COLORS[Math.floor(rand() * CONTAINER_COLORS.length)] })
    return { items, funnel: FUNNEL_COLORS[Math.floor(rand() * FUNNEL_COLORS.length)] }
  }, [L, B, seed])

  const ownCargo = useRef<THREE.InstancedMesh>(null)
  const mesh = cargoRef ?? ownCargo
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    stack.items.forEach((it, i) => {
      o.position.set(it.x, it.y, it.z)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, c.set(it.color))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.userData.total = stack.items.length
    m.count = stack.items.length
    m.computeBoundingSphere()
  }, [stack, mesh])

  const sx = -L / 2 + 15
  const top = HULL_H
  return (
    <>
      <mesh geometry={parts.bottom} castShadow receiveShadow>
        <meshStandardMaterial color="#b4432f" roughness={0.75} />
      </mesh>
      <mesh geometry={parts.boot}>
        <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
      </mesh>
      <mesh geometry={parts.top} castShadow receiveShadow>
        <meshStandardMaterial color="#1f3557" roughness={0.65} metalness={0.1} />
      </mesh>
      {/* Superestructura en popa: alojamiento con ventanas, puente con alerones, chimenea y mástil */}
      <group position={[sx, top, 0]}>
        <mesh position={[0, 12, 0]} castShadow>
          <boxGeometry args={[16, 24, B * 0.78]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.5} />
        </mesh>
        {[7, 12, 17, 22].map((y) => (
          <mesh key={y} position={[0.2, y, 0]}>
            <boxGeometry args={[16.2, 1.1, B * 0.79]} />
            <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.4} />
          </mesh>
        ))}
        <mesh position={[1, 25.8, 0]} castShadow>
          <boxGeometry args={[11, 3.6, B + 3]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
        </mesh>
        <mesh position={[6.6, 26, 0]}>
          <boxGeometry args={[0.3, 1.6, B + 2.6]} />
          <meshStandardMaterial color="#1e293b" roughness={0.15} metalness={0.5} />
        </mesh>
        <mesh position={[0, 31, 0]}>
          <boxGeometry args={[0.6, 7, 0.6]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
        <mesh position={[-10, 17, 0]} castShadow>
          <boxGeometry args={[6, 14, 7]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.5} />
        </mesh>
        <mesh position={[-10, 22.5, 0]}>
          <boxGeometry args={[6.1, 3, 7.1]} />
          <meshStandardMaterial color={stack.funnel} roughness={0.5} />
        </mesh>
      </group>
      {/* Contenedores sobre cubierta, uno por uno */}
      {cargo && (
        <instancedMesh ref={mesh} args={[undefined, undefined, stack.items.length]} castShadow receiveShadow>
          <boxGeometry args={[12.2, 2.5, 2.42]} />
          <meshStandardMaterial map={getContainerTexture()} roughness={0.7} />
        </instancedMesh>
      )}
      {selected && (
        <mesh position={[0, 20, 0]}>
          <boxGeometry args={[L + 14, 40, B + 14]} />
          <meshBasicMaterial color="#2563eb" transparent opacity={0.07} depthWrite={false} />
          <Edges color="#2563eb" />
        </mesh>
      )}
      <Html position={[0, 48, 0]} center zIndexRange={[20, 0]}>
        <div ref={tagRef}>
          <Tag tone={selected ? 'accent' : 'plain'}>{label}</Tag>
        </div>
      </Html>
    </>
  )
}
