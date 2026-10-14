import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { cranesOnShift } from '../sim/terminalSim'
import { phaseAt } from '../sim/tracks'
import { useStore } from '../store'
import { CONTAINER_COLORS, LAND_Y, craneX } from './layout'
import { getContainerTexture } from './materials'
import { useGlowMaterial } from './useGlow'

type P2 = [number, number]

const BLOCKS_X = [-240, -80, 80, 240]
const LANES_Z = [162, 217]
/** Velocidad visual de los tractores, en metros por segundo real. */
const SPEED = 16

/**
 * Circuito de un tractor de terminal: carga bajo la grúa, sube a la calle del muelle, entra al pasillo del
 * bloque donde descarga la RTG y vuelve vacío por un carril paralelo.
 */
function circuit(cx: number, tx: number, lane: number): P2[] {
  return [
    [cx, 18],
    [cx, 72],
    [tx - 45, 72],
    [tx - 45, lane],
    [tx + 45, lane],
    [tx + 45, 86],
    [cx + 5, 86],
    [cx + 5, 18],
    [cx, 18],
  ]
}

function measure(path: P2[]) {
  const lens = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]))
  return { lens, total: lens.reduce((a, b) => a + b, 0) }
}

/** Posición, rumbo y si va cargado, a una distancia d del inicio del circuito. */
function at(path: P2[], lens: number[], d: number, loadedUntil: number): { x: number; z: number; yaw: number; loaded: boolean } {
  let r = d
  for (let i = 0; i < lens.length; i++) {
    if (r <= lens[i]) {
      const a = path[i]
      const b = path[i + 1]
      const u = lens[i] ? r / lens[i] : 0
      return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, yaw: Math.atan2(-(b[1] - a[1]), b[0] - a[0]), loaded: d < loadedUntil }
    }
    r -= lens[i]
  }
  return { x: path[0][0], z: path[0][1], yaw: 0, loaded: false }
}

export default function Tractors() {
  const berths = useStore((s) => s.params.berths)
  const n = useStore((s) => s.params.cranesPerBerth)
  const items = []
  for (let b = 0; b < berths; b++)
    for (let i = 0; i < n; i++) {
      const cx = craneX(b, i, n)
      const tx = BLOCKS_X[(b * 2 + i) % BLOCKS_X.length]
      items.push(<Tractor key={`${b}-${i}`} berth={b} path={circuit(cx, tx, LANES_Z[(b + i) % 2])} color={CONTAINER_COLORS[(b * 3 + i * 5) % CONTAINER_COLORS.length]} offset={i * 0.37} />)
    }
  return <>{items}</>
}

function Tractor({ berth, path, color, offset }: { berth: number; path: P2[]; color: string; offset: number }) {
  const group = useRef<THREE.Group>(null)
  const box = useRef<THREE.Mesh>(null)
  const { lens, total } = useMemo(() => measure(path), [path])
  // Va cargado desde la grúa hasta el final del pasillo del bloque (4 primeros tramos).
  const loadedUntil = useMemo(() => lens.slice(0, 4).reduce((a, b) => a + b, 0), [lens])
  const dist = useRef(offset * total)
  const head = useGlowMaterial('#fff6dc', 0.1, 6)

  useFrame((_, delta) => {
    const { tracks, t, params, playing } = useStore.getState()
    const working = cranesOnShift(t, params.craneHoursPerDay) && tracks.some((tr) => tr.berth === berth && phaseAt(tr, t, params).phase === 'working')
    if (playing && working) dist.current = (dist.current + delta * SPEED) % total
    const p = at(path, lens, dist.current, loadedUntil)
    group.current!.position.set(p.x, LAND_Y, p.z)
    group.current!.rotation.y = p.yaw
    box.current!.visible = p.loaded && working
  })

  return (
    <group ref={group}>
      <mesh position={[5.2, 1.9, 0]} castShadow>
        <boxGeometry args={[2.6, 2.6, 2.4]} />
        <meshStandardMaterial color="#e8a33b" roughness={0.5} />
      </mesh>
      <mesh position={[6.45, 2.4, 0]}>
        <boxGeometry args={[0.15, 1, 2.1]} />
        <meshStandardMaterial color="#1e293b" roughness={0.15} metalness={0.5} />
      </mesh>
      <mesh position={[6.55, 1.2, 0]} material={head}>
        <boxGeometry args={[0.1, 0.35, 1.8]} />
      </mesh>
      <mesh position={[-1.5, 1.1, 0]} castShadow>
        <boxGeometry args={[12.8, 0.5, 2.4]} />
        <meshStandardMaterial color="#334155" roughness={0.7} />
      </mesh>
      {[-6, -4.6, 4.6].map((x) => (
        <mesh key={x} position={[x, 0.5, 0]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.5, 0.5, 2.5, 10]} />
          <meshStandardMaterial color="#111827" roughness={0.9} />
        </mesh>
      ))}
      <mesh ref={box} position={[-1.5, 2.65, 0]} castShadow>
        <boxGeometry args={[12.2, 2.6, 2.44]} />
        <meshStandardMaterial color={color} map={getContainerTexture()} roughness={0.7} />
      </mesh>
    </group>
  )
}
