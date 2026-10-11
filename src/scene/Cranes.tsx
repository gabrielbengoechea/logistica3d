import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { phaseAt } from '../sim/tracks'
import { craneRate, useStore } from '../store'
import { LAND_Y, craneX } from './layout'

const FRAME = '#3d6fd6'

export default function Cranes() {
  const berths = useStore((s) => s.params.berths)
  const n = useStore((s) => s.params.cranesPerBerth)
  const items = []
  for (let b = 0; b < berths; b++)
    for (let i = 0; i < n; i++) items.push(<Crane key={`${b}-${i}`} berth={b} index={i} x={craneX(b, i, n)} />)
  return <>{items}</>
}

function Box({ args, position, color }: { args: [number, number, number]; position: [number, number, number]; color: string }) {
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  )
}

/** Grúa pórtico de muelle (STS): ~50 m de alto, pluma que llega ~55 m sobre el agua. */
function Crane({ berth, index, x }: { berth: number; index: number; x: number }) {
  const trolley = useRef<THREE.Group>(null)
  const load = useRef<THREE.Group>(null)
  const clock = useRef(index * 0.37)
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selection?.kind === 'crane' && s.selection.berth === berth && s.selection.index === index)
  const frame = selected ? '#1d4ed8' : FRAME

  useFrame((_, delta) => {
    const { tracks, t, params, playing, source } = useStore.getState()
    const rate = craneRate(params)
    // Con datos AIS no se conoce la operación de las grúas: quedan quietas.
    const working = source === 'sim' && tracks.some((tr) => tr.berth === berth && phaseAt(tr, t, rate).phase === 'working')
    if (playing && working) clock.current += delta * 0.22
    // Ciclo: baja en el buque, sube, viaja a tierra, baja, sube y vuelve.
    const c = clock.current % 1
    const travel = c < 0.5 ? (c < 0.15 ? 0 : (c - 0.15) / 0.35) : c < 0.65 ? 1 : 1 - (c - 0.65) / 0.35
    const smooth = travel * travel * (3 - 2 * travel)
    const z = working ? -36 + smooth * 58 : 8
    const drop = working ? Math.max(0, 1 - Math.abs((c % 0.5) - 0.07) / 0.07) : 0
    trolley.current!.position.z = z
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
      {[-9, 9].map((lx) =>
        [6, 34].map((lz) => <Box key={`${lx}${lz}`} args={[2, 44, 2]} position={[lx, 22, lz]} color={frame} />),
      )}
      <Box args={[20, 3, 2.4]} position={[0, 44, 6]} color={frame} />
      <Box args={[20, 3, 2.4]} position={[0, 44, 34]} color={frame} />
      <Box args={[2.4, 3, 30]} position={[-9, 44, 20]} color={frame} />
      <Box args={[2.4, 3, 30]} position={[9, 44, 20]} color={frame} />
      <Box args={[6, 3, 112]} position={[0, 47.5, -4]} color={frame} />
      <Box args={[14, 7, 14]} position={[0, 52.5, 32]} color="#f8fafc" />
      <group ref={trolley} position={[0, 45, 8]}>
        <Box args={[7, 2.5, 7]} position={[0, 0, 0]} color="#f2c230" />
        <group ref={load}>
          <Box args={[0.4, 12, 0.4]} position={[0, 6, 0]} color="#475569" />
          <Box args={[2.6, 2.6, 12.2]} position={[0, -1.3, 0]} color="#f47c3c" />
        </group>
      </group>
    </group>
  )
}
