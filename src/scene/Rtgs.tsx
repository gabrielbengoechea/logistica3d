import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cranesOnShift } from '../sim/terminalSim'
import { useStore } from '../store'
import { LAND_Y } from './layout'
import { box, getContainerTexture } from './materials'
import { useGlowMaterial } from './useGlow'

/**
 * Grúas de patio sobre neumáticos (RTG): una por bloque, montada a caballo de las 6 filas de contenedores.
 * Ancho entre patas ~26 m, altura ~22 m (alcanza para apilar 5 de alto). Ilustrativas: se mueven a lo largo
 * del bloque mientras hay turno, no siguen a contenedores concretos.
 */
const BLOCKS: [number, number][] = []
for (const bx of [-240, -80, 80, 240]) for (const bz of [130, 185, 240]) BLOCKS.push([bx, bz])

const HALF_SPAN = 13
const H = 22

function buildFrame() {
  const p: THREE.BufferGeometry[] = []
  for (const x of [-5, 5])
    for (const z of [-HALF_SPAN, HALF_SPAN]) {
      p.push(box(x, H / 2, z, 1.4, H, 1.4))
    }
  for (const z of [-HALF_SPAN, HALF_SPAN]) {
    p.push(box(0, 2.2, z, 12, 1.2, 1.6)) // viga baja con las ruedas
    p.push(box(0, H, z, 12, 1.6, 1.6)) // viga superior
  }
  for (const x of [-5, 5]) p.push(box(x, H + 0.4, 0, 1.6, 2, 2 * HALF_SPAN + 1.6)) // vigas del carro
  return mergeGeometries(p.map((g) => (g.index ? g.toNonIndexed() : g)))!
}

function buildDetails() {
  const p: THREE.BufferGeometry[] = [box(0, H + 2.4, HALF_SPAN - 2, 9, 3, 5)] // sala de máquinas
  for (const x of [-4.5, 4.5]) for (const z of [-HALF_SPAN, HALF_SPAN]) p.push(new THREE.CylinderGeometry(0.9, 0.9, 1, 12).rotateX(Math.PI / 2).translate(x, 0.9, z))
  return mergeGeometries(p.map((g) => (g.index ? g.toNonIndexed() : g)))!
}

let shared: { frame: THREE.BufferGeometry; details: THREE.BufferGeometry } | null = null
const geometries = () => (shared ??= { frame: buildFrame(), details: buildDetails() })

export default function Rtgs() {
  return (
    <>
      {BLOCKS.map(([bx, bz], i) => (
        <Rtg key={i} bx={bx} bz={bz} phase={i * 0.618} />
      ))}
    </>
  )
}

function Rtg({ bx, bz, phase }: { bx: number; bz: number; phase: number }) {
  const group = useRef<THREE.Group>(null)
  const trolley = useRef<THREE.Group>(null)
  const clock = useRef(phase * 10)
  const { frame, details } = geometries()
  const light = useGlowMaterial('#ffe7b8', 0.1, 6)

  useFrame((_, delta) => {
    const { t, params, playing } = useStore.getState()
    if (playing && cranesOnShift(t, params.craneHoursPerDay)) clock.current += delta * 0.18
    const c = clock.current
    group.current!.position.x = bx + Math.sin(c * 0.35 + phase) * 48
    trolley.current!.position.z = Math.sin(c * 1.3 + phase * 2) * (HALF_SPAN - 3)
  })

  return (
    <group ref={group} position={[bx, LAND_Y, bz]}>
      <mesh geometry={frame} castShadow>
        <meshStandardMaterial color="#f2b632" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh geometry={details} castShadow>
        <meshStandardMaterial color="#2b2f36" roughness={0.8} />
      </mesh>
      <mesh position={[0, H - 0.6, HALF_SPAN - 1]} material={light}>
        <boxGeometry args={[6, 0.4, 0.6]} />
      </mesh>
      <group ref={trolley} position={[0, H + 1.6, 0]}>
        <mesh castShadow>
          <boxGeometry args={[11, 1.6, 3.2]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.5} />
        </mesh>
        <mesh position={[0, -3.4, 0]}>
          <boxGeometry args={[0.25, 5.6, 0.25]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
        <mesh position={[0, -7.5, 0]} castShadow>
          <boxGeometry args={[12.2, 2.6, 2.44]} />
          <meshStandardMaterial color="#3b7dd8" map={getContainerTexture()} roughness={0.7} />
        </mesh>
      </group>
    </group>
  )
}
