import { useEffect, useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ENTRY, MOUTH, PAD, anchorageSlot, toTerminal } from './layout'
import Tag from './Tag'
import { heightAt, type Zone } from './zone'

const insidePad = (x: number, z: number, margin: number) => {
  const [tx, tz] = toTerminal(x, z)
  return tx > PAD[0] - margin && tx < PAD[1] + margin && tz > PAD[2] - margin && tz < PAD[3] + margin
}

/** Relieve real con la imagen satelital. Bajo la terminal se aplana: ahí va el modelo de la terminal. */
function Terrain({ zone }: { zone: Zone }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    new THREE.TextureLoader().load(zone.imageUrl, (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      setTexture(t)
    })
  }, [zone.imageUrl])

  const geometry = useMemo(() => {
    const { extent, terrain } = zone.meta
    const g = new THREE.PlaneGeometry(extent.xmax - extent.xmin, extent.zmax - extent.zmin, terrain.cols - 1, terrain.rows - 1)
    g.rotateX(-Math.PI / 2)
    g.translate((extent.xmin + extent.xmax) / 2, 0, (extent.zmin + extent.zmax) / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      let h = zone.heights[i]
      if (insidePad(x, z, 60)) h = Math.min(h, 1)
      pos.setY(i, h)
    }
    g.computeVertexNormals()
    return g
  }, [zone])

  if (!texture) return null
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial map={texture} roughness={1} />
    </mesh>
  )
}

/** Edificios reales (Overture / OpenStreetMap) extruidos a su altura, en un solo mesh. */
function Buildings({ zone }: { zone: Zone }) {
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (const b of zone.vectors.buildings) {
      const [x0, z0] = b.ring[0]
      if (insidePad(x0, z0, 20)) continue
      const shape = new THREE.Shape(b.ring.map(([x, z]) => new THREE.Vector2(x, -z)))
      const g = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false })
      g.rotateX(-Math.PI / 2)
      g.translate(0, Math.max(0, heightAt(zone, x0, z0)), 0)
      parts.push(g.index ? g.toNonIndexed() : g)
    }
    const merged = mergeGeometries(parts)
    parts.forEach((p) => p.dispose())
    merged?.computeVertexNormals()
    return merged
  }, [zone])
  if (!geometry) return null
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#eef1f5" roughness={0.9} />
    </mesh>
  )
}

function Label({ at, children, y = 20 }: { at: [number, number]; children: string; y?: number }) {
  return (
    <Html position={[at[0], y, at[1]]} center zIndexRange={[10, 0]}>
      <Tag tone="muted">{children}</Tag>
    </Html>
  )
}

export default function World({ zone }: { zone: Zone }) {
  const slots = Array.from({ length: 12 }, (_, i) => anchorageSlot(i))
  const anchorage: [number, number] = [slots.reduce((s, p) => s + p[0], 0) / 12, slots.reduce((s, p) => s + p[1], 0) / 12 + 420]
  const channel: [number, number] = [(ENTRY[0] + MOUTH[0]) / 2 + 160, (ENTRY[1] + MOUTH[1]) / 2]
  return (
    <group>
      <Terrain zone={zone} />
      <Buildings zone={zone} />
      <Label at={[-4119, -1440]} y={140}>Cerro de Montevideo · 134 m</Label>
      <Label at={[589, 559]} y={40}>Ciudad Vieja</Label>
      <Label at={[1261, 576]} y={110}>Palacio Salvo</Label>
      <Label at={[-1585, -1842]}>Bahía de Montevideo</Label>
      <Label at={[-560, 1250]}>Escollera Sarandí</Label>
      <Label at={channel}>Canal de acceso</Label>
      <Label at={anchorage}>Fondeadero</Label>
      <Label at={[-500, 6200]}>Río de la Plata</Label>
    </group>
  )
}
