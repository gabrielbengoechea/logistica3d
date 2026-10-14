import { useMemo } from 'react'
import { Edges, Html } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../sim/rng'
import { useStore } from '../store'
import { getConcreteTexture, getContainerTexture } from './materials'
import { ShipBody, hullGeometry } from './Ships'
import Tag from './Tag'
import { buildingMaterial } from './World'

/** Centro del comparador en el mapa: mar abierto, 2,7 km al sur de la costa y lejos del canal y del fondeadero. */
export const SCALE_AT: [number, number] = [2400, 4300]

/** Altura de la plataforma donde se apoyan los objetos de tierra. */
const BASE = 1.6
/** Popas alineadas: así los largos se comparan de un vistazo. */
const STERN_X = -430

const SHIPS = [
  { key: 'ulcv', length: 400, beam: 61, z: -345, seed: 7, label: 'Los más grandes del mundo · 400 m × 61 m' },
  { key: 'pp', length: 300, beam: 48, z: -255, seed: 3, label: 'Post-Panamax · 300 m × 48 m' },
  { key: 'feeder', length: 170, beam: 25, z: -190, seed: 5, label: 'Feeder · 170 m × 25 m' },
]

/**
 * Comparador de escalas: buques, una cancha, una manzana, contenedores y edificios conocidos de Montevideo,
 * todos a escala real sobre una plataforma en el mar. Se muestra u oculta con un interruptor. Medidas aproximadas.
 */
export default function ScaleComparison() {
  const visible = useStore((s) => s.showScale)
  if (!visible) return null
  return (
    <group position={[SCALE_AT[0], 0, SCALE_AT[1]]}>
      {SHIPS.map((s) => (
        <group key={s.key}>
          <group position={[STERN_X + s.length / 2, 0, s.z]}>
            <ShipBody length={s.length} beam={s.beam} seed={s.seed} selected={false} label={s.label} tag={false} />
          </group>
          <Label position={[STERN_X + s.length + 6, 20, s.z]}>{s.label}</Label>
          <Ruler x0={STERN_X} length={s.length} z={s.z + s.beam / 2 + 9} />
        </group>
      ))}
      <Platform />
      <Field position={[-370, BASE, -58]} />
      <Block position={[-232, BASE, -50]} />
      <Containers position={[-140, BASE, -58]} />
      <Salvo position={[-50, BASE, -55]} />
      <Antel position={[50, BASE, -55]} />
      <UprightShip position={[160, BASE, -55]} />
    </group>
  )
}

function Label({ position, children, tone }: { position: [number, number, number]; children: string; tone?: 'accent' }) {
  return (
    <Html position={position} center zIndexRange={[10, 0]}>
      <Tag tone={tone}>{children}</Tag>
    </Html>
  )
}

/** Regla sobre el agua junto a cada buque: marcas cada 50 m, más largas cada 100 m. */
function Ruler({ x0, length, z }: { x0: number; length: number; z: number }) {
  const geometry = useMemo(() => {
    const parts = [new THREE.BoxGeometry(length, 0.3, 1.4).translate(x0 + length / 2, 0, 0)]
    for (let d = 0; d <= length; d += 50) {
      const big = d % 100 === 0
      parts.push(new THREE.BoxGeometry(1.4, 0.3, big ? 9 : 5).translate(x0 + d, 0, big ? 3.8 : 1.8))
    }
    return mergeGeometries(parts)!
  }, [x0, length])
  return (
    <group position={[0, 0.9, z]}>
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  )
}

let platform: THREE.MeshStandardMaterial | null = null

/** Hormigón con juntas, la misma textura del muelle y a la misma escala. */
function platformMaterial() {
  if (platform) return platform
  const map = getConcreteTexture().clone()
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(670 / 20, 230 / 20)
  map.needsUpdate = true
  platform = new THREE.MeshStandardMaterial({ map, color: '#e4e7ea', roughness: 0.9 })
  return platform
}

/** Plataforma de exhibición: hormigón claro con borde, como una maqueta apoyada en la bahía. */
function Platform() {
  return (
    <group>
      <mesh position={[-110, BASE / 2 - 0.4, -18]} receiveShadow castShadow material={platformMaterial()}>
        <boxGeometry args={[670, BASE + 0.8, 230]} />
      </mesh>
      <mesh position={[-110, BASE + 0.05, 86]} receiveShadow>
        <boxGeometry args={[670, 0.1, 6]} />
        <meshStandardMaterial color="#9aa3ad" roughness={0.9} />
      </mesh>
    </group>
  )
}

// ---------- Cancha de fútbol (medidas reglamentarias del Centenario: 105 x 68 m) ----------

let fieldTexture: THREE.CanvasTexture | null = null

/** Pasto con franjas y todas las líneas de la cancha, dibujado a 8 píxeles por metro. */
function getFieldTexture() {
  if (fieldTexture) return fieldTexture
  const S = 8
  const W = 115
  const H = 78
  const c = document.createElement('canvas')
  c.width = W * S
  c.height = H * S
  const g = c.getContext('2d')!
  for (let i = 0; i < 23; i++) {
    g.fillStyle = i % 2 ? '#4f9a4a' : '#5aa953'
    g.fillRect(i * 5 * S, 0, 5 * S, H * S)
  }
  g.strokeStyle = '#ffffff'
  g.lineWidth = 0.14 * S
  const ox = 5 * S
  const oy = 5 * S
  const L = 105 * S
  const A = 68 * S
  g.strokeRect(ox, oy, L, A)
  g.beginPath()
  g.moveTo(ox + L / 2, oy)
  g.lineTo(ox + L / 2, oy + A)
  g.stroke()
  g.beginPath()
  g.arc(ox + L / 2, oy + A / 2, 9.15 * S, 0, Math.PI * 2)
  g.stroke()
  for (const side of [0, 1]) {
    const x = side ? ox + L : ox
    const dir = side ? -1 : 1
    // Área grande (16,5 m), área chica (5,5 m), punto penal y medialuna.
    g.strokeRect(side ? x - 16.5 * S : x, oy + A / 2 - 20.16 * S, 16.5 * S, 40.32 * S)
    g.strokeRect(side ? x - 5.5 * S : x, oy + A / 2 - 9.16 * S, 5.5 * S, 18.32 * S)
    const px = x + dir * 11 * S
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(px, oy + A / 2, 0.3 * S, 0, Math.PI * 2)
    g.fill()
    const a = Math.acos(5.5 / 9.15)
    g.beginPath()
    if (side) g.arc(px, oy + A / 2, 9.15 * S, Math.PI - a, Math.PI + a)
    else g.arc(px, oy + A / 2, 9.15 * S, -a, a)
    g.stroke()
  }
  fieldTexture = new THREE.CanvasTexture(c)
  fieldTexture.colorSpace = THREE.SRGBColorSpace
  fieldTexture.anisotropy = 8
  return fieldTexture
}

function Field({ position }: { position: [number, number, number] }) {
  const goals = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (const x of [-52.5, 52.5]) {
      const back = x + Math.sign(x) * 2
      for (const z of [-3.66, 3.66]) parts.push(new THREE.BoxGeometry(0.15, 2.44, 0.15).translate(x, 1.22, z))
      parts.push(new THREE.BoxGeometry(0.15, 0.15, 7.47).translate(x, 2.44, 0))
      parts.push(new THREE.BoxGeometry(2, 0.1, 7.47).translate((x + back) / 2, 2.2, 0))
    }
    return mergeGeometries(parts)!
  }, [])
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]} receiveShadow>
        <planeGeometry args={[115, 78]} />
        <meshStandardMaterial map={getFieldTexture()} roughness={0.95} />
      </mesh>
      <mesh geometry={goals} castShadow>
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <Label position={[0, 4, 0]}>Cancha del Centenario · 105 × 68 m</Label>
    </group>
  )
}

// ---------- Edificios: cajas con color de fachada, con las ventanas del material de la ciudad ----------

type Part = THREE.BufferGeometry

function colored(g: Part, color: string): Part {
  const c = new THREE.Color(color)
  const flat = g.index ? g.toNonIndexed() : g
  flat.deleteAttribute('uv')
  const colors = new Float32Array(flat.attributes.position.count * 3)
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i)
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return flat
}

const boxAt = (x: number, y0: number, z: number, sx: number, h: number, sz: number, color: string) =>
  colored(new THREE.BoxGeometry(sx, h, sz).translate(x, y0 + h / 2, z), color)

const cylAt = (x: number, y0: number, z: number, rTop: number, rBottom: number, h: number, sides: number, color: string) =>
  colored(new THREE.CylinderGeometry(rTop, rBottom, h, sides).translate(x, y0 + h / 2, z), color)

function Building({ parts, position }: { parts: Part[]; position: [number, number, number] }) {
  const geometry = useMemo(() => {
    const g = mergeGeometries(parts)!
    g.computeVertexNormals()
    return g
  }, [parts])
  const material = useMemo(() => buildingMaterial(), [])
  return <mesh geometry={geometry} material={material} position={position} castShadow receiveShadow />
}

/** Palacio Salvo: cuerpo bajo, torre escalonada con torrecillas, corona octogonal y faro. Unos 100 m. */
function Salvo({ position }: { position: [number, number, number] }) {
  const parts = useMemo(() => {
    const stone = '#e3d4b8'
    const dark = '#cbb894'
    const p: Part[] = [
      boxAt(0, 0, 0, 50, 34, 38, stone),
      boxAt(0, 34, 0, 51, 1.2, 39, dark),
      boxAt(0, 35, 0, 34, 28, 26, stone),
      boxAt(0, 63, 0, 35, 1, 27, dark),
      boxAt(0, 64, 0, 22, 14, 18, stone),
    ]
    for (const [x, z] of [
      [-10, -8],
      [10, -8],
      [-10, 8],
      [10, 8],
    ])
      p.push(cylAt(x, 64, z, 2.2, 2.2, 19, 8, stone), cylAt(x, 83, z, 0.2, 2.4, 4, 8, dark))
    p.push(cylAt(0, 78, 0, 8, 8.5, 12, 8, stone), cylAt(0, 90, 0, 3.5, 8, 6, 8, dark), cylAt(0, 96, 0, 2.2, 2.2, 5, 8, stone), cylAt(0, 101, 0, 0.3, 2.4, 4, 8, dark))
    return p
  }, [])
  return (
    <group position={position}>
      <Building parts={parts} position={[0, 0, 0]} />
      <Label position={[0, 112, 0]}>Palacio Salvo · ≈ 100 m</Label>
    </group>
  )
}

/** Torre de las Telecomunicaciones (Antel): torre de vidrio que se afina y termina en punta. Unos 158 m. */
function Antel({ position }: { position: [number, number, number] }) {
  const parts = useMemo(() => {
    const glass = '#8ea6bf'
    const p: Part[] = [boxAt(0, 0, 0, 52, 12, 40, '#b8c3cf')]
    // Cuerpo elíptico que se afina hacia arriba, en tramos.
    for (let i = 0; i < 6; i++) {
      const g = new THREE.CylinderGeometry(15 - i * 1.4 - 1.4, 15 - i * 1.4, 22, 28).scale(1, 1, 0.62).translate(0, 12 + i * 22 + 11, 0)
      p.push(colored(g, glass))
    }
    p.push(cylAt(0, 144, 0, 0.8, 6.6, 6, 16, glass), cylAt(0, 150, 0, 0.25, 0.6, 8, 6, '#e2e8f0'))
    return p
  }, [])
  return (
    <group position={position}>
      <Building parts={parts} position={[0, 0, 0]} />
      <Label position={[0, 168, 0]}>Torre Antel · ≈ 158 m</Label>
    </group>
  )
}

/** Una manzana del Centro: unos 85 m por lado, casas y edificios de 2 a 10 pisos sobre la vereda y el fondo libre. */
function Block({ position }: { position: [number, number, number] }) {
  const parts = useMemo(() => {
    const rand = mulberry32(21)
    const colors = ['#e9dcc6', '#dccbb0', '#efe7da', '#d4c2a8', '#c9d0d6', '#e2d2c4', '#d9b9a3', '#f2ece2']
    const side = 85
    const p: Part[] = []
    // Cuatro frentes: cada lote tiene su ancho, fondo y altura.
    for (let s = 0; s < 4; s++) {
      let t = 0
      while (t < side - 6) {
        const w = Math.min(side - t, 8 + rand() * 9)
        const depth = 14 + rand() * 9
        const floors = rand() < 0.2 ? 6 + Math.floor(rand() * 5) : 2 + Math.floor(rand() * 3)
        const h = floors * 3.2 + 0.6
        const along = -side / 2 + t + w / 2
        const inward = side / 2 - depth / 2
        const [x, z, sx, sz] = s === 0 ? [along, -inward, w, depth] : s === 1 ? [inward, along, depth, w] : s === 2 ? [-along, inward, w, depth] : [-inward, -along, depth, w]
        p.push(boxAt(x, 0, z, sx - 0.3, h, sz - 0.3, colors[Math.floor(rand() * colors.length)]))
        t += w
      }
    }
    return p
  }, [])
  return (
    <group position={position}>
      {/* Calle alrededor y vereda */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} receiveShadow>
        <planeGeometry args={[115, 115]} />
        <meshStandardMaterial color="#5b6168" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.15, 0]} receiveShadow>
        <boxGeometry args={[91, 0.3, 91]} />
        <meshStandardMaterial color="#cfc8bd" roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.32, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#7f9a6a" roughness={1} />
      </mesh>
      <Building parts={parts} position={[0, 0.3, 0]} />
      <Label position={[0, 40, 0]}>Una manzana · ≈ 85 m por lado</Label>
    </group>
  )
}

/** Contenedores de 20 y 40 pies y un camión con su contenedor: la unidad de todo el puerto. */
function Containers({ position }: { position: [number, number, number] }) {
  const tex = getContainerTexture()
  const box = (key: string, x: number, y: number, z: number, len: number, color: string) => (
    <mesh key={key} position={[x, y + 1.3, z]} castShadow>
      <boxGeometry args={[len, 2.59, 2.44]} />
      <meshStandardMaterial color={color} map={tex} roughness={0.7} />
    </mesh>
  )
  return (
    <group position={position}>
      {box('40a', 0, 0, -8, 12.19, '#d9534f')}
      {box('40b', 0, 2.59, -8, 12.19, '#3b7dd8')}
      {box('20a', -3.05, 0, -4, 6.06, '#f0ad4e')}
      {box('20b', 3.05, 0, -4, 6.06, '#4cae6e')}
      {/* Camión con un contenedor de 40 pies */}
      <group position={[0, 0, 5]}>
        <mesh position={[7.6, 1.8, 0]} castShadow>
          <boxGeometry args={[2.6, 2.8, 2.5]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
        <mesh position={[-0.6, 0.9, 0]}>
          <boxGeometry args={[13.6, 0.4, 2.4]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
        {[-6, -4.6, 3.6, 7.6].map((x) => (
          <mesh key={x} position={[x, 0.5, 0]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.5, 0.5, 2.5, 10]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
        ))}
        {box('camion', -0.6, 1.1, 0, 12.19, '#8e6cc8')}
      </group>
      <Label position={[0, 12, 0]}>Contenedores de 20 y 40 pies · 6 y 12 m</Label>
    </group>
  )
}

/** Un Post-Panamax puesto de pie, en silueta transparente, junto a los edificios. */
function UprightShip({ position }: { position: [number, number, number] }) {
  const geometry = useMemo(() => {
    const g = hullGeometry(300, 48, 20)
    g.rotateZ(Math.PI / 2)
    g.translate(10, 150, 0)
    return g
  }, [])
  return (
    <group position={position}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#2563eb" transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
        <Edges color="#1d4ed8" threshold={20} />
      </mesh>
      <Label position={[0, 314, 0]} tone="accent">
        El mismo Post-Panamax, de pie · 300 m
      </Label>
    </group>
  )
}
