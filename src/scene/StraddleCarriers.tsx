import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cranesOnShift } from '../sim/terminalSim'
import { phaseAt } from '../sim/tracks'
import { useStore } from '../store'
import { CONTAINER_COLORS, LAND_Y, YARD, berthToTerminal, craneLocalX, type P2 } from './layout'
import { box, getContainerTexture } from './materials'
import { useGlowMaterial } from './useGlow'

/**
 * Straddle carriers: la máquina con la que TCP mueve los contenedores entre el muelle y el patio. Pasa a caballo
 * sobre una fila de contenedores, levanta uno entre sus patas y lo lleva colgando. En su marco: avanza hacia +x,
 * 9,6 m de largo, 5 m de ancho y 14 m de alto (apila de a 1 sobre 3).
 */
const L = 9.6
const HALF_W = 2.5
const H = 14
/** Velocidad visual, en metros por segundo real. */
const SPEED = 14

const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!

function buildFrame() {
  const p: THREE.BufferGeometry[] = []
  for (const z of [-HALF_W, HALF_W]) {
    p.push(box(0, 1.5, z, L, 0.9, 0.7)) // viga baja con las ruedas
    for (const x of [-L / 2 + 0.6, L / 2 - 0.6]) p.push(box(x, H / 2, z, 0.8, H - 1, 0.8)) // patas
    p.push(box(0, H - 0.4, z, L + 0.4, 1.1, 0.9)) // viga alta
    p.push(box(0, H * 0.55, z, L - 1.2, 0.5, 0.5)) // riostra
  }
  for (const x of [-L / 2 + 0.6, L / 2 - 0.6]) p.push(box(x, H - 0.3, 0, 0.9, 1, 2 * HALF_W + 0.8)) // travesaños
  p.push(box(-1.2, H + 0.9, 0, 4.6, 1.8, 3.4)) // motor arriba
  return merge(p)
}

function buildWheels() {
  const p: THREE.BufferGeometry[] = []
  for (const z of [-HALF_W, HALF_W]) for (const x of [-3.6, -1.2, 1.2, 3.6]) p.push(new THREE.CylinderGeometry(0.75, 0.75, 0.7, 12).rotateX(Math.PI / 2).translate(x, 0.75, z))
  return merge(p)
}

function buildCab() {
  // Cabina arriba y adelante, a un costado: el conductor mira hacia abajo, entre las patas.
  return merge([box(L / 2 - 0.4, H - 2.2, -HALF_W + 0.4, 2.2, 2.4, 2.2)])
}

let shared: { frame: THREE.BufferGeometry; wheels: THREE.BufferGeometry; cab: THREE.BufferGeometry } | null = null
const geometries = () => (shared ??= { frame: buildFrame(), wheels: buildWheels(), cab: buildCab() })

function measure(path: P2[]) {
  const lens = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]))
  return { lens, total: lens.reduce((a, b) => a + b, 0) }
}

function at(path: P2[], lens: number[], d: number): { x: number; z: number; yaw: number } {
  let r = d
  for (let i = 0; i < lens.length; i++) {
    if (r <= lens[i]) {
      const a = path[i]
      const b = path[i + 1]
      const u = lens[i] ? r / lens[i] : 0
      return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, yaw: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) }
    }
    r -= lens[i]
  }
  return { x: path[0][0], z: path[0][1], yaw: 0 }
}

const ROAD_N = 118 // calle entre el muelle y el patio
const ROAD_W = -356 // calle del lado oeste
const blockTop = (bz: number) => bz - (YARD.bays * YARD.bay) / 2 - 8
const blockBottom = (bz: number) => bz + (YARD.bays * YARD.bay) / 2 + 8
const rowX = (bx: number, r: number) => bx + (r - (YARD.rows - 1) / 2) * YARD.rowPitch
const laneX = (bx: number) => bx + (YARD.rows * YARD.rowPitch) / 2 + 10

/**
 * Ciclo de un straddle carrier al servicio de una grúa: toma el contenedor bajo la grúa, sube a la calle,
 * entra a una fila del patio, lo deja a mitad de la fila, sale por el otro extremo y vuelve vacío por la calle
 * entre bloques. Devuelve el recorrido y la distancia hasta donde va cargado.
 */
function craneCircuit(berth: number, crane: P2, bx: number, bz: number, r: number): { path: P2[]; drop: number } {
  const x = rowX(bx, r)
  const lane = laneX(bx)
  const top = blockTop(bz)
  const bottom = blockBottom(bz)
  const mid = bz + ((r % 5) - 2) * YARD.bay
  let path: P2[]
  if (berth < 2) {
    const [cx] = crane
    path = [[cx, 24], [cx, ROAD_N], [x, ROAD_N], [x, top], [x, mid], [x, bottom], [lane, bottom], [lane, ROAD_N + 8], [cx + 6, ROAD_N + 8], [cx + 6, 24], [cx, 24]]
  } else {
    // Ampliación: la grúa está sobre la cara oeste; se entra al patio por la calle del oeste.
    const inland = berthToTerminal(2, crane[0], 70)
    const pick = berthToTerminal(2, crane[0], 24)
    path = [pick, inland, [ROAD_W, inland[1]], [ROAD_W, ROAD_N], [x, ROAD_N], [x, top], [x, mid], [x, bottom], [lane, bottom], [lane, ROAD_N + 8], [ROAD_W + 6, ROAD_N + 8], [ROAD_W + 6, inland[1] + 6], [inland[0], inland[1] + 6], pick]
  }
  const { lens } = measure(path)
  // Va cargado hasta el punto medio de la fila (índice del tramo que termina en `mid`).
  const iMid = path.findIndex((p) => p[0] === x && p[1] === mid)
  return { path, drop: lens.slice(0, iMid).reduce((a, b) => a + b, 0) }
}

/** Ciclo de patio: lleva contenedores entre los bloques y la zona de camiones, cerca de la portería. */
function yardCircuit(bx: number, bz: number, r: number): { path: P2[]; drop: number } {
  const x = rowX(bx, r)
  const lane = laneX(bx)
  const bottom = blockBottom(YARD.blocksZ[YARD.blocksZ.length - 1])
  const path: P2[] = [[x, blockTop(bz)], [x, bz], [x, bottom + 30], [lane, bottom + 30], [lane, blockTop(bz) - 2], [x, blockTop(bz)]]
  const { lens } = measure(path)
  return { path, drop: lens[0] + lens[1] + lens[2] }
}

interface Spec {
  key: string
  berth: number | null
  path: P2[]
  drop: number
  color: string
  offset: number
}

export default function StraddleCarriers() {
  const berths = useStore((s) => s.params.berths)
  const n = useStore((s) => s.params.cranesPerBerth)
  const specs = useMemo(() => {
    const out: Spec[] = []
    for (let b = 0; b < berths; b++)
      for (let i = 0; i < n; i++) {
        const local = craneLocalX(i, n)
        const crane = b < 2 ? berthToTerminal(b, local, 24) : ([local, 24] as P2)
        // Bloque más cercano a la grúa (para la ampliación, los de la primera columna).
        const bi = b < 2 ? YARD.blocksX.reduce((best, bx, k) => (Math.abs(bx - crane[0]) < Math.abs(YARD.blocksX[best] - crane[0]) ? k : best), 0) : i % 2
        for (const k of [0, 1]) {
          const bz = YARD.blocksZ[(i + k) % YARD.blocksZ.length]
          const { path, drop } = craneCircuit(b, crane, YARD.blocksX[bi], bz, (b * 3 + i * 4 + k * 5) % YARD.rows)
          out.push({ key: `c${b}-${i}-${k}`, berth: b, path, drop, color: CONTAINER_COLORS[(b * 3 + i * 5 + k) % CONTAINER_COLORS.length], offset: k * 0.5 + i * 0.13 })
        }
      }
    for (let k = 0; k < 4; k++) {
      const bx = YARD.blocksX[1 + k * 2]
      const { path, drop } = yardCircuit(bx, YARD.blocksZ[k % 3], (k * 3) % YARD.rows)
      out.push({ key: `y${k}`, berth: null, path, drop, color: CONTAINER_COLORS[(k * 2 + 1) % CONTAINER_COLORS.length], offset: k * 0.31 })
    }
    return out
  }, [berths, n])
  return (
    <>
      {specs.map((s) => (
        <Carrier key={s.key} spec={s} />
      ))}
    </>
  )
}

function Carrier({ spec }: { spec: Spec }) {
  const group = useRef<THREE.Group>(null)
  const load = useRef<THREE.Mesh>(null)
  const { lens, total } = useMemo(() => measure(spec.path), [spec.path])
  const dist = useRef(spec.offset * total)
  const { frame, wheels, cab } = geometries()
  const beacon = useGlowMaterial('#ffb020', 0.6, 8)

  useFrame((_, delta) => {
    const { tracks, t, params, playing } = useStore.getState()
    const onShift = cranesOnShift(t, params.craneHoursPerDay)
    const working = spec.berth === null ? true : onShift && tracks.some((tr) => tr.berth === spec.berth && phaseAt(tr, t, params).phase === 'working')
    if (playing && working) dist.current = (dist.current + delta * SPEED) % total
    const p = at(spec.path, lens, dist.current)
    group.current!.position.set(p.x, LAND_Y, p.z)
    group.current!.rotation.y = p.yaw
    load.current!.visible = working && dist.current < spec.drop
  })

  return (
    <group ref={group}>
      <mesh geometry={frame} castShadow>
        <meshStandardMaterial color="#e8b23a" roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh geometry={wheels}>
        <meshStandardMaterial color="#15181d" roughness={0.9} />
      </mesh>
      <mesh geometry={cab}>
        <meshStandardMaterial color="#1e293b" roughness={0.15} metalness={0.5} />
      </mesh>
      <mesh position={[-1.2, H + 2, 0]} material={beacon}>
        <sphereGeometry args={[0.35, 8, 8]} />
      </mesh>
      <mesh ref={load} position={[0, 3.4, 0]} castShadow>
        <boxGeometry args={[12.2, 2.6, 2.44]} />
        <meshStandardMaterial color={spec.color} map={getContainerTexture()} roughness={0.7} />
      </mesh>
    </group>
  )
}
