import { useMemo } from 'react'
import * as THREE from 'three'
import FarLabel from './FarLabel'
import { LAND_Y } from './layout'
import { getConcreteTexture } from './materials'
import Tag from './Tag'
import type { Zone } from './zone'

type Ring = [number, number][]

/** ¿El punto (x, z) está dentro del anillo? (regla par-impar) */
export function inRing(ring: Ring, x: number, z: number) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]
    const [xj, zj] = ring[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Contorno del recinto portuario (OpenStreetMap, vía Overture): 153 ha, como informa la ANP (145 ha de superficie terrestre). */
export function portRing(zone: Zone): Ring | null {
  return zone.vectors.areas?.find((a) => a.name === 'Puerto de Montevideo')?.ring ?? null
}

/** Losa extruida desde el agua hasta `top`, con tapa de hormigón y muro de muelle oscuro. */
function slab(ring: Ring, top: number, bottom: number) {
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false, curveSegments: 1 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, bottom, 0)
  return g
}

let materials: { top: THREE.MeshStandardMaterial; wall: THREE.MeshStandardMaterial; rock: THREE.MeshStandardMaterial } | null = null
function getMaterials() {
  if (materials) return materials
  // Las tapas de ExtrudeGeometry usan las coordenadas de la forma (metros) como UV: 1/20 = una baldosa cada 20 m.
  const map = getConcreteTexture().clone()
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(1 / 20, 1 / 20)
  map.needsUpdate = true
  materials = {
    top: new THREE.MeshStandardMaterial({ map, color: '#d9dde2', roughness: 0.95 }),
    wall: new THREE.MeshStandardMaterial({ color: '#6f757c', roughness: 0.9 }),
    rock: new THREE.MeshStandardMaterial({ color: '#8b8d88', roughness: 1, flatShading: true }),
  }
  return materials
}

/**
 * Recinto portuario real: explanada a la cota de los muelles con su borde de muelle. Dentro van la terminal de
 * contenedores (modelada aparte) y el resto del puerto; los edificios reales salen de Overture.
 */
export function PortLand({ zone }: { zone: Zone }) {
  const ring = portRing(zone)
  const geometry = useMemo(() => (ring ? slab(ring, LAND_Y - 0.04, -4) : null), [ring])
  if (!geometry) return null
  const m = getMaterials()
  return <mesh geometry={geometry} material={[m.top, m.wall]} receiveShadow />
}

/** Escolleras y dique de cintura: muros de piedra que asoman unos 4 m sobre el agua. */
export function Breakwaters({ zone }: { zone: Zone }) {
  const geometry = useMemo(() => {
    const parts = (zone.vectors.piers ?? []).filter((p) => p.class === 'breakwater' && p.ring && p.ring.length > 3)
    if (!parts.length) return null
    const gs = parts.map((p) => slab(p.ring!, 4.2, -3))
    const merged = new THREE.BufferGeometry()
    // Unión simple (todas las piezas comparten atributos de ExtrudeGeometry).
    const pos: number[] = []
    for (const g of gs) {
      const ng = g.index ? g.toNonIndexed() : g
      pos.push(...(ng.attributes.position.array as Float32Array))
      g.dispose()
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    merged.computeVertexNormals()
    return merged
  }, [zone])
  if (!geometry) return null
  return <mesh geometry={geometry} material={getMaterials().rock} castShadow receiveShadow />
}

/** Partes del puerto según el plano de la ANP ("Muelles y Terminales"), en metros locales. */
const PLACES: { at: [number, number]; text: string; tone?: 'plain' | 'muted' }[] = [
  { at: [-90, 170], text: 'Muelle A' },
  { at: [-265, 120], text: 'Dársena Fluvial', tone: 'muted' },
  { at: [-150, 300], text: 'Terminal de pasajeros' },
  { at: [-330, 330], text: 'Base Naval', tone: 'muted' },
  { at: [220, -40], text: 'Dársena I', tone: 'muted' },
  { at: [540, -120], text: 'Muelle B' },
  { at: [880, -380], text: 'Dársena II', tone: 'muted' },
  { at: [1250, -520], text: 'Muelle C' },
  { at: [1150, -960], text: 'Dársena III', tone: 'muted' },
  { at: [1420, -820], text: 'Terminal de celulosa (UPM)' },
  { at: [1230, -1330], text: 'Terminal de graneles (TGM)' },
]

export function PortLabels({ zone }: { zone: Zone }) {
  const breakwaters = useMemo(() => {
    const out: { at: [number, number]; text: string }[] = []
    for (const p of zone.vectors.piers ?? []) {
      if (p.class !== 'breakwater' || !p.ring || p.ring.length < 4) continue
      const cx = p.ring.reduce((s, q) => s + q[0], 0) / p.ring.length
      const cz = p.ring.reduce((s, q) => s + q[1], 0) / p.ring.length
      // Sarandí ya tiene nombre en los datos; las otras dos se reconocen por dónde están.
      const text = p.name ?? (cx < -800 ? 'Escollera Oeste' : 'Dique de cintura')
      out.push({ at: [cx, cz], text })
    }
    return out
  }, [zone])
  return (
    <>
      {PLACES.map((p) => (
        <FarLabel key={p.text} position={[p.at[0], LAND_Y + 8, p.at[1]]} maxDistance={4200}>
          <Tag tone={p.tone ?? 'plain'}>{p.text}</Tag>
        </FarLabel>
      ))}
      {breakwaters.map((b) => (
        <FarLabel key={b.text} position={[b.at[0], 10, b.at[1]]} maxDistance={6000}>
          <Tag tone="muted">{b.text}</Tag>
        </FarLabel>
      ))}
    </>
  )
}
