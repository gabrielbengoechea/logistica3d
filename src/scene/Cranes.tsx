import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cranesOnShift } from '../sim/terminalSim'
import { phaseAt } from '../sim/tracks'
import { useStore } from '../store'
import { LAND_Y, craneX } from './layout'
import { box, getContainerTexture, strut } from './materials'

/**
 * Grúa pórtico de muelle (STS), en su marco: x a lo largo del muelle, z hacia tierra, z < 0 sobre el agua.
 * Patas a 6 y 34 m del borde (trocha de 28 m), viga portal a ~44 m, pluma de 115 m que llega 60 m sobre
 * el agua, pórtico en A con tensores hacia la punta y la cola de la pluma.
 */
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

function buildFrame() {
  const parts: THREE.BufferGeometry[] = []
  for (const x of [-9, 9]) {
    for (const z of [6, 34]) parts.push(box(x, 22, z, 2.2, 44, 2.2))
    parts.push(box(x, 12, 20, 1.6, 2, 28)) // viga baja entre patas
    parts.push(box(x, 44, 20, 2.4, 3, 30)) // viga portal lateral
    parts.push(strut(v(x, 13, 6), v(x, 43, 34), 1)) // diagonal
    // Pórtico en A sobre las patas de tierra.
    parts.push(strut(v(x, 46, 34), v(x * 0.7, 72, 28), 1.6))
    parts.push(strut(v(x, 46, 12), v(x * 0.7, 72, 28), 1.3))
    // Tensores: del ápice a la punta de la pluma y a la cola.
    parts.push(strut(v(x * 0.7, 72, 28), v(x * 0.3, 49, -60), 0.6))
    parts.push(strut(v(x * 0.7, 72, 28), v(x * 0.3, 49, -20), 0.5))
    parts.push(strut(v(x * 0.7, 72, 28), v(x * 0.3, 49, 54), 0.6))
    // Pluma: dos vigas paralelas.
    parts.push(box(x * 0.3, 47.6, -4, 1.3, 2.8, 116))
  }
  for (const z of [6, 34]) parts.push(box(0, 44, z, 20, 3, 2.4)) // viga portal
  parts.push(box(0, 72, 28, 13, 1.6, 1.6)) // ápice
  for (let z = -58; z <= 50; z += 9) parts.push(box(0, 46.4, z, 6.4, 0.5, 0.6)) // travesaños de la pluma
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
}

function buildDetails() {
  const parts = [
    box(0, 51.5, 44, 14, 6, 15), // sala de máquinas
    box(0, 4, 6, 22, 2.6, 4), // bogies (ruedas) lado agua
    box(0, 4, 34, 22, 2.6, 4), // bogies lado tierra
  ]
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
}

let shared: { frame: THREE.BufferGeometry; details: THREE.BufferGeometry } | null = null
const geometries = () => (shared ??= { frame: buildFrame(), details: buildDetails() })

export default function Cranes() {
  const berths = useStore((s) => s.params.berths)
  const n = useStore((s) => s.params.cranesPerBerth)
  const items = []
  for (let b = 0; b < berths; b++)
    for (let i = 0; i < n; i++) items.push(<Crane key={`${b}-${i}`} berth={b} index={i} x={craneX(b, i, n)} />)
  return <>{items}</>
}

function Crane({ berth, index, x }: { berth: number; index: number; x: number }) {
  const trolley = useRef<THREE.Group>(null)
  const load = useRef<THREE.Group>(null)
  const clock = useRef(index * 0.37)
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selection?.kind === 'crane' && s.selection.berth === berth && s.selection.index === index)
  const { frame, details } = geometries()

  useFrame((_, delta) => {
    const { tracks, t, params, playing } = useStore.getState()
    const working = cranesOnShift(t, params.craneHoursPerDay) && tracks.some((tr) => tr.berth === berth && phaseAt(tr, t, params).phase === 'working')
    if (playing && working) clock.current += delta * 0.22
    // Ciclo: baja en el buque, sube, viaja a tierra, baja, sube y vuelve.
    const c = clock.current % 1
    const travel = c < 0.5 ? (c < 0.15 ? 0 : (c - 0.15) / 0.35) : c < 0.65 ? 1 : 1 - (c - 0.65) / 0.35
    const smooth = travel * travel * (3 - 2 * travel)
    trolley.current!.position.z = working ? -38 + smooth * 58 : 8
    const drop = working ? Math.max(0, 1 - Math.abs((c % 0.5) - 0.07) / 0.07) : 0
    load.current!.position.y = -12 - drop * 18
    load.current!.visible = working && c < 0.5
  })

  return (
    <group
      position={[x, LAND_Y, 0]}
      onClick={(e) => {
        e.stopPropagation()
        select({ kind: 'crane', berth, index })
      }}
    >
      <mesh geometry={frame} castShadow>
        <meshStandardMaterial color={selected ? '#1d4ed8' : '#3a6fd8'} roughness={0.5} metalness={0.25} emissive={selected ? '#1d4ed8' : '#000000'} emissiveIntensity={0.25} />
      </mesh>
      <mesh geometry={details} castShadow>
        <meshStandardMaterial color="#f1f5f9" roughness={0.5} />
      </mesh>
      <mesh position={[0, 73.5, 28]}>
        <sphereGeometry args={[0.9, 8, 8]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.5} />
      </mesh>
      <group ref={trolley} position={[0, 45, 8]}>
        <mesh castShadow>
          <boxGeometry args={[7, 2.5, 7]} />
          <meshStandardMaterial color="#f2c230" roughness={0.5} />
        </mesh>
        <mesh position={[3.6, -2.4, 0]}>
          <boxGeometry args={[2.4, 2.4, 2.6]} />
          <meshStandardMaterial color="#1e293b" roughness={0.15} metalness={0.5} />
        </mesh>
        <group ref={load}>
          <mesh position={[0, 6, 0]}>
            <boxGeometry args={[0.35, 12, 0.35]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[2.8, 0.6, 12.6]} />
            <meshStandardMaterial color="#f2c230" />
          </mesh>
          <mesh position={[0, -1.3, 0]} castShadow>
            <boxGeometry args={[2.44, 2.6, 12.2]} />
            <meshStandardMaterial color="#f47c3c" map={getContainerTexture()} roughness={0.7} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
