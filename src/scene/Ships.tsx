import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, Html } from '@react-three/drei'
import * as THREE from 'three'
import { mulberry32 } from '../sim/rng'
import type { Track } from '../sim/tracks'
import { useStore } from '../store'
import { CONTAINER_COLORS } from './layout'
import { LAND_Y } from './layout'
import { getContainerTexture, getWakeTexture, strut } from './materials'
import { useGlowMaterial } from './useGlow'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
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
  const tugs = useRef<THREE.Group>(null)
  const lines = useRef<THREE.Mesh>(null)
  const wakeOpacity = useRef(0)
  const { length: L, beam: B, id, name } = track.ship
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selection?.kind === 'ship' && s.selection.id === id)
  const wake = useMemo(() => {
    const map = getWakeTexture().clone()
    // La textura empieza en la popa (u = 0) y se aleja hacia atrás (-x del buque).
    map.repeat.set(-1, 1)
    map.offset.set(1, 0)
    map.needsUpdate = true
    return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0 })
  }, [])
  const mooring = useMemo(() => mooringLines(L, B), [L, B])

  useFrame((_, delta) => {
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

    // Estela según la maniobra: navegando, fuerte; empujado por remolcadores, apenas; quieto, nada.
    const { phase, u } = pose
    const target =
      phase === 'approaching' || phase === 'leaving' ? 0.9 : phase === 'berthing' ? (u < 0.7 ? 0.75 : 0.12) : phase === 'unberthing' ? (u > 0.5 ? 0.35 : 0.1) : 0
    wakeOpacity.current += (target - wakeOpacity.current) * Math.min(1, delta * 2.5)
    wake.opacity = wakeOpacity.current
    wake.visible = wake.opacity > 0.01
    if (tugs.current) tugs.current.visible = (phase === 'berthing' && u > 0.55) || (phase === 'unberthing' && u < 0.7)
    if (lines.current) lines.current.visible = phase === 'working' || (phase === 'berthing' && u > 0.92) || (phase === 'unberthing' && u < 0.12)
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
      <mesh rotation-x={-Math.PI / 2} position={[-L / 2 - L * 1.4, 0.55, 0]} material={wake} renderOrder={2}>
        <planeGeometry args={[L * 2.8, B * 3.2]} />
      </mesh>
      <mesh ref={lines} geometry={mooring} visible={false}>
        <meshStandardMaterial color="#3a3a36" roughness={0.9} />
      </mesh>
      <group ref={tugs} visible={false}>
        <Tug position={[L * 0.3, 0, -(B / 2 + 13)]} />
        <Tug position={[-L * 0.3, 0, -(B / 2 + 13)]} />
      </group>
    </group>
  )
}

/**
 * Amarras de proa, popa y springs, desde la cubierta hasta las bitas del muelle. El muelle queda del lado +z
 * del buque (a manga/2 + 4 m) y 3 m sobre el agua.
 */
function mooringLines(L: number, B: number) {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const deckZ = B / 2 - 0.5
  const quayZ = B / 2 + 4 + 2.2
  const quayY = LAND_Y + 1
  const parts = [
    strut(v(L * 0.46, HULL_H, deckZ), v(L * 0.5 + 22, quayY, quayZ), 0.32),
    strut(v(L * 0.44, HULL_H, deckZ), v(L * 0.5 + 12, quayY, quayZ), 0.32),
    strut(v(L * 0.3, HULL_H, deckZ), v(L * 0.18, quayY, quayZ), 0.3),
    strut(v(-L * 0.46, HULL_H, deckZ), v(-L * 0.5 - 22, quayY, quayZ), 0.32),
    strut(v(-L * 0.44, HULL_H, deckZ), v(-L * 0.5 - 12, quayY, quayZ), 0.32),
    strut(v(-L * 0.3, HULL_H, deckZ), v(-L * 0.18, quayY, quayZ), 0.3),
  ]
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
}

/** Remolcador (proa hacia +x): casco rojo y negro, puente blanco, defensas de goma en la proa. */
function Tug({ position }: { position: [number, number, number] }) {
  const hull = useMemo(() => hullGeometry(28, 10, 4.5), [])
  return (
    <group position={position} rotation-y={-Math.PI / 2}>
      <mesh geometry={hull} castShadow>
        <meshStandardMaterial color="#b3261e" roughness={0.6} />
      </mesh>
      <mesh position={[0, 4.6, 0]} castShadow>
        <boxGeometry args={[27, 0.4, 9.6]} />
        <meshStandardMaterial color="#1f2328" roughness={0.8} />
      </mesh>
      <mesh position={[2, 7.5, 0]} castShadow>
        <boxGeometry args={[9, 5.5, 7]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.5} />
      </mesh>
      <mesh position={[4.3, 9, 0]}>
        <boxGeometry args={[0.4, 1.4, 6.6]} />
        <meshStandardMaterial color="#1e293b" roughness={0.15} metalness={0.5} />
      </mesh>
      <mesh position={[-2, 11.5, 0]}>
        <boxGeometry args={[1.8, 3, 1.8]} />
        <meshStandardMaterial color="#e8a33b" />
      </mesh>
      <mesh position={[14.6, 3, 0]}>
        <boxGeometry args={[1.6, 2.4, 7]} />
        <meshStandardMaterial color="#111827" roughness={0.95} />
      </mesh>
    </group>
  )
}

/** Luces de navegación: roja a babor (-z), verde a estribor (+z), blancas en el mástil y la popa. */
function NavLights({ L, B }: { L: number; B: number }) {
  const red = useGlowMaterial('#ff3b30', 0.15, 9)
  const green = useGlowMaterial('#2fe06b', 0.15, 9)
  const white = useGlowMaterial('#fff8e7', 0.1, 8)
  const deck = useGlowMaterial('#ffd99a', 0.05, 3)
  const sx = -L / 2 + 15
  return (
    <>
      <mesh position={[sx + 1, HULL_H + 26, -(B / 2 + 1.6)]} material={red}>
        <sphereGeometry args={[0.8, 8, 8]} />
      </mesh>
      <mesh position={[sx + 1, HULL_H + 26, B / 2 + 1.6]} material={green}>
        <sphereGeometry args={[0.8, 8, 8]} />
      </mesh>
      <mesh position={[sx, HULL_H + 34.8, 0]} material={white}>
        <sphereGeometry args={[0.8, 8, 8]} />
      </mesh>
      <mesh position={[L / 2 - 12, HULL_H + 3, 0]} material={white}>
        <sphereGeometry args={[0.7, 8, 8]} />
      </mesh>
      <mesh position={[-L / 2 + 0.5, HULL_H + 2, 0]} material={white}>
        <sphereGeometry args={[0.7, 8, 8]} />
      </mesh>
      {[7, 12, 17, 22].map((y) => (
        <mesh key={y} position={[sx + 8.15, HULL_H + y, 0]} material={deck}>
          <boxGeometry args={[0.2, 0.9, B * 0.7]} />
        </mesh>
      ))}
    </>
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
      <NavLights L={L} B={B} />
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
