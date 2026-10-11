import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, Html } from '@react-three/drei'
import * as THREE from 'three'
import { mulberry32 } from '../sim/rng'
import type { Track } from '../sim/tracks'
import { craneRate, useStore } from '../store'
import { CONTAINER_COLORS } from './layout'
import { shipPose } from './pose'
import Tag from './Tag'

const HULL_H = 12

/** Casco visto desde arriba (proa hacia +x), extruido hacia arriba. */
export function hullGeometry(length: number, beam: number, height: number) {
  const s = new THREE.Shape()
  const bow = beam * 0.9
  s.moveTo(-length / 2, -beam / 2)
  s.lineTo(length / 2 - bow, -beam / 2)
  s.lineTo(length / 2, 0)
  s.lineTo(length / 2 - bow, beam / 2)
  s.lineTo(-length / 2, beam / 2)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  return g
}

export default function Ships() {
  const tracks = useStore((s) => s.tracks)
  const source = useStore((s) => s.source)
  if (source !== 'sim') return null
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
  const cargo = useRef<THREE.Group>(null)
  const tag = useRef<HTMLDivElement>(null)
  const { length: L, beam: B, id, name } = track.ship
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selection?.kind === 'ship' && s.selection.id === id)

  useFrame(() => {
    const { t, params } = useStore.getState()
    const pose = shipPose(track, t, craneRate(params))
    const g = group.current!
    const visible = pose.phase !== 'hidden'
    g.visible = visible
    if (tag.current) tag.current.style.display = visible ? 'block' : 'none'
    if (!visible) return
    g.position.set(pose.x, 0, pose.z)
    g.rotation.y = pose.yaw
    cargo.current!.scale.y = Math.max(0.001, pose.load)
    cargo.current!.visible = pose.load > 0.01
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

/** Modelo low-poly de un buque (proa hacia +x), con contenedores opcionales y etiqueta. */
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
  cargoRef?: React.Ref<THREE.Group>
  tagRef?: React.Ref<HTMLDivElement>
}) {
  const hull = useMemo(() => hullGeometry(L, B, HULL_H), [L, B])
  const bays = useMemo(() => {
    const rand = mulberry32(seed)
    const out: { x: number; color: string; tiers: number }[] = []
    for (let x = -L / 2 + 36; x < L / 2 - B * 0.9; x += 13.4)
      out.push({ x, color: CONTAINER_COLORS[Math.floor(rand() * CONTAINER_COLORS.length)], tiers: 4 + Math.floor(rand() * 3) })
    return out
  }, [L, B, seed])

  return (
    <>
      <mesh geometry={hull}>
        <meshStandardMaterial color="#26416b" roughness={0.8} />
      </mesh>
      <mesh geometry={hull} scale={[1.004, 0.18, 1.02]} position={[0, -0.4, 0]}>
        <meshStandardMaterial color="#c94a3d" roughness={0.8} />
      </mesh>
      {/* Superestructura en popa */}
      <mesh position={[-L / 2 + 16, HULL_H + 11, 0]}>
        <boxGeometry args={[14, 22, B * 0.8]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[-L / 2 + 18, HULL_H + 21, 0]}>
        <boxGeometry args={[9, 4, B + 2]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh position={[-L / 2 + 8, HULL_H + 18, 0]}>
        <boxGeometry args={[5, 12, 5]} />
        <meshStandardMaterial color="#c94a3d" />
      </mesh>
      {/* Contenedores sobre cubierta: bajan a medida que las grúas descargan */}
      {cargo && (
        <group ref={cargoRef} position={[0, HULL_H, 0]}>
          {bays.map((b) => (
            <mesh key={b.x} position={[b.x, b.tiers * 1.3, 0]}>
              <boxGeometry args={[12.6, b.tiers * 2.6, B * 0.82]} />
              <meshStandardMaterial color={b.color} roughness={0.8} />
            </mesh>
          ))}
        </group>
      )}
      {selected && (
        <mesh position={[0, 18, 0]}>
          <boxGeometry args={[L + 14, 36, B + 14]} />
          <meshBasicMaterial color="#2563eb" transparent opacity={0.07} depthWrite={false} />
          <Edges color="#2563eb" />
        </mesh>
      )}
      <Html position={[0, 44, 0]} center zIndexRange={[20, 0]}>
        <div ref={tagRef}>
          <Tag tone={selected ? 'accent' : 'plain'}>{label}</Tag>
        </div>
      </Html>
    </>
  )
}
