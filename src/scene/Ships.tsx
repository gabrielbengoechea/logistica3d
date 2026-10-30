import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Edges, Html } from '@react-three/drei'
import * as THREE from 'three'
import { mulberry32 } from '../sim/rng'
import type { Track } from '../sim/tracks'
import { useStore } from '../store'
import { LAND_Y } from './layout'
import { strut } from './materials'
import { KIT_URL, LIBREAS, Lods, clonar, mallaContenedores, usePaquete } from './kit/kit'
import { useGlowMaterial } from './useGlow'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { shipPose } from './pose'
import Tag from './Tag'
import Wake from './Wake'
import { lejosEnVR } from '../vr/estado'
import { useEnXR } from '../vr/r3f'

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
      {tracks.map((tr) => (
        <Wake key={tr.ship.id} track={tr} />
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
  const { length: L, beam: B, id, name } = track.ship
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selection?.kind === 'ship' && s.selection.id === id)
  const mooring = useMemo(() => mooringLines(L, B, cubiertaDe(B)), [L, B])
  const enXR = useEnXR()

  useFrame(() => {
    const { t, params } = useStore.getState()
    const pose = shipPose(track, t, params)
    const g = group.current!
    // En el visor los buques muy lejanos (fondeadero, mar abierto) no se dibujan: son puntos de pocos píxeles.
    const visible = pose.phase !== 'hidden' && !lejosEnVR(pose.x, pose.z, 3200)
    g.visible = visible
    if (tag.current) tag.current.style.display = visible ? 'block' : 'none'
    if (!visible) return
    g.position.set(pose.x, 0, pose.z)
    g.rotation.y = pose.yaw
    // Las grúas sacan primero los contenedores de arriba: las instancias van ordenadas por altura.
    const m = cargo.current
    if (m) m.count = Math.round((m.userData.total as number) * pose.load)

    const { phase, u } = pose
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
      <ShipBody length={L} beam={B} seed={track.index + 1} selected={selected} label={selected ? `${id} · ${name}` : id} cargoRef={cargo} tagRef={tag} tag={!enXR} />
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
function mooringLines(L: number, B: number, HULL_H: number) {
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
function NavLights({ L, B, sx, puente }: { L: number; B: number; sx: number; puente: number }) {
  const red = useGlowMaterial('#ff3b30', 0.15, 9)
  const green = useGlowMaterial('#2fe06b', 0.15, 9)
  const white = useGlowMaterial('#fff8e7', 0.1, 8)
  return (
    <>
      <mesh position={[sx, puente + 2.2, -(B / 2 + 0.6)]} material={red}>
        <sphereGeometry args={[0.6, 8, 8]} />
      </mesh>
      <mesh position={[sx, puente + 2.2, B / 2 + 0.6]} material={green}>
        <sphereGeometry args={[0.6, 8, 8]} />
      </mesh>
      <mesh position={[sx, puente + 11.5, 0]} material={white}>
        <sphereGeometry args={[0.6, 8, 8]} />
      </mesh>
      <mesh position={[L / 2 - 12, puente * 0.6, 0]} material={white}>
        <sphereGeometry args={[0.6, 8, 8]} />
      </mesh>
    </>
  )
}

const VARIANTES = ['Feeder', 'Panamax', 'PostPanamax'] as const
type Variante = (typeof VARIANTES)[number]
/** Clase del modelo según la manga (las 3 clases del simulador; los buques reales del AIS toman la más parecida). */
export const varianteDe = (beam: number): Variante => (beam <= 29 ? 'Feeder' : beam <= 38 ? 'Panamax' : 'PostPanamax')

interface DatosVariante {
  eslora_m: number
  manga_m: number
  puntal_m: number
  bahias_x: number[]
  filas: number
  paso_fila_m: number
  carga_z: number
  casa_x0: number
  casa_largo: number
  puente_z: number
  lod_distancias_m: number[]
}

/** Altura de la cubierta de un buque del kit (para amarras y comparaciones). */
export function cubiertaDe(beam: number) {
  return { Feeder: 14.5, Panamax: 19.5, PostPanamax: 24.5 }[varianteDe(beam)]
}

/** Nombre pintado en proa y popa: canvas con letras blancas sobre transparente. */
function nombreTextura(nombre: string) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#f4f4f0'
  g.font = '700 92px "Inter", "Helvetica Neue", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(nombre.toUpperCase().slice(0, 22), 512, 68)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Modelo de un buque portacontenedores del kit (proa hacia +x), con contenedores opcionales y etiqueta. */
export function ShipBody(props: Parameters<typeof ShipBodyKit>[0]) {
  return (
    <Suspense fallback={null}>
      <ShipBodyKit {...props} />
    </Suspense>
  )
}

function ShipBodyKit({
  length: L,
  beam: B,
  seed,
  selected,
  label,
  cargo = true,
  tag = true,
  cargoRef,
  tagRef,
}: {
  length: number
  beam: number
  seed: number
  selected: boolean
  label: string
  cargo?: boolean
  /** Mostrar la etiqueta sobre el buque (el comparador de escalas pone las suyas). */
  tag?: boolean
  cargoRef?: React.RefObject<THREE.InstancedMesh | null>
  tagRef?: React.Ref<HTMLDivElement>
}) {
  const kit = usePaquete(KIT_URL.buques)
  const cont = usePaquete(KIT_URL.contenedores)
  const { camera } = useThree()
  const variante = varianteDe(B)
  const modelo = useMemo(() => {
    const raiz = clonar(kit.scene, `Ship_${variante}`)
    const d = raiz.userData as DatosVariante
    const sx = L / d.eslora_m
    const sz = B / d.manga_m
    raiz.scale.set(sx, 1, sz)
    const rand = mulberry32(seed)
    // franja de la chimenea con el color de la naviera y nombre del buque
    const banda = FUNNEL_COLORS[Math.floor(rand() * FUNNEL_COLORS.length)]
    const nombre = nombreTextura(label.split(' · ').pop() ?? label)
    raiz.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      if (m.name.startsWith('Funnel_Band')) m.material = new THREE.MeshStandardMaterial({ color: banda, roughness: 0.45 })
      if (m.name.startsWith('Ship_Name')) m.material = new THREE.MeshStandardMaterial({ map: nombre, transparent: true, alphaTest: 0.4, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 })
      o.layers.enable(1)
    })
    return { raiz, d, sx, sz, lods: new Lods(raiz, d.lod_distancias_m ?? [0, 450, 1800]), nombre }
  }, [kit.scene, variante, L, B, seed, label])
  useEffect(() => () => modelo.nombre.dispose(), [modelo])

  // contenedores sobre las tapas de bodega: bahías del modelo (escaladas a la eslora) × filas × niveles al azar
  const stack = useMemo(() => {
    const rand = mulberry32(seed * 31 + 7)
    const { d, sx, sz } = modelo
    const bays = d.bahias_x.map((x) => ({ x: x * sx, tiers: 3 + Math.floor(rand() * 4) }))
    const rows = d.filas
    const items: { x: number; y: number; z: number; livery: number }[] = []
    const maxTier = Math.max(...bays.map((b) => b.tiers), 0)
    // Orden por altura: con count se esconden primero los de arriba.
    for (let tier = 0; tier < maxTier; tier++)
      for (const b of bays)
        for (let r = 0; r < rows; r++)
          if (tier < b.tiers) items.push({ x: b.x, y: d.carga_z + tier * 2.591, z: (r - (rows - 1) / 2) * d.paso_fila_m * sz, livery: Math.floor(rand() * LIBREAS) })
    return items
  }, [modelo, seed])

  const ownCargo = useRef<THREE.InstancedMesh>(null)
  const mesh = cargoRef ?? ownCargo
  const instanced = useMemo(() => (cargo ? mallaContenedores(cont.scene, '40', Math.max(1, stack.length)) : null), [cont.scene, stack.length, cargo])
  useLayoutEffect(() => {
    const m = instanced
    if (!m) return
    const o = new THREE.Object3D()
    const lib = m.geometry.getAttribute('aLibrea') as THREE.InstancedBufferAttribute
    stack.forEach((it, i) => {
      o.position.set(it.x, it.y, it.z)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      lib.setX(i, it.livery)
    })
    lib.needsUpdate = true
    m.instanceMatrix.needsUpdate = true
    m.userData.total = stack.length
    m.count = stack.length
    m.computeBoundingSphere()
    m.layers.enable(1)
    if (mesh && 'current' in mesh) (mesh as React.MutableRefObject<THREE.InstancedMesh | null>).current = m
  }, [stack, instanced, mesh])

  useFrame(() => {
    modelo.lods.actualizar(camera)
  })

  const { d, sx } = modelo
  const casaX = (d.casa_x0 + d.casa_largo * 0.75) * sx
  return (
    <>
      <primitive object={modelo.raiz} />
      <NavLights L={L} B={B} sx={casaX} puente={d.puente_z} />
      {instanced && <primitive object={instanced} />}
      {selected && (
        <mesh position={[0, 20, 0]}>
          <boxGeometry args={[L + 14, 40, B + 14]} />
          <meshBasicMaterial color="#2563eb" transparent opacity={0.07} depthWrite={false} />
          <Edges color="#2563eb" />
        </mesh>
      )}
      {tag && (
        <Html position={[0, d.puente_z + 22, 0]} center zIndexRange={[20, 0]}>
          <div ref={tagRef}>
            <Tag tone={selected ? 'accent' : 'plain'}>{label}</Tag>
          </div>
        </Html>
      )}
    </>
  )
}
