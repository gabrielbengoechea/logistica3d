import { useEffect, useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ENTRY, MOUTH, PAD, anchorageSlot, toTerminal } from './layout'
import { SHARED } from './environment'
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

  const material = useMemo(() => {
    if (!texture) return null
    const m = new THREE.MeshStandardMaterial({ map: texture, roughness: 1 })
    // De noche, las zonas urbanas de la imagen (claras) se encienden con puntos de luz cálida.
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = SHARED.uNight
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uNight;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          float urban = smoothstep(0.16, 0.42, lum) * step(1.0, vWPos.y);
          // Faroles: puntos redondos sueltos en una grilla de 12 m, solo en algunas celdas.
          vec2 cellId = floor(vWPos.xz / 12.0);
          vec2 inCell = fract(vWPos.xz / 12.0) - 0.5;
          float pick = fract(sin(dot(cellId, vec2(12.9898, 78.233))) * 43758.5453);
          float lamp = step(0.74, pick) * smoothstep(0.32, 0.04, length(inCell));
          totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * urban * (0.05 + lamp * 1.4) * uNight;`,
        )
    }
    m.customProgramCacheKey = () => 'terreno-noche'
    return m
  }, [texture])

  if (!material) return null
  return <mesh geometry={geometry} material={material} receiveShadow />
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
      const flat = g.index ? g.toNonIndexed() : g
      // Un color de fachada por edificio, sorteado según su posición.
      const color = FACADES[Math.abs(Math.floor(x0 * 7.13 + z0 * 3.71)) % FACADES.length]
      const colors = new Float32Array(flat.attributes.position.count * 3)
      for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i)
      flat.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      flat.deleteAttribute('uv')
      parts.push(flat)
    }
    const merged = mergeGeometries(parts)
    parts.forEach((p) => p.dispose())
    merged?.computeVertexNormals()
    return merged
  }, [zone])
  const material = useMemo(() => buildingMaterial(), [])
  if (!geometry) return null
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />
}

const FACADES = ['#efe9df', '#e6dfd2', '#dcd6cc', '#f4f0e9', '#d8cfbf', '#e9dcc8', '#cfd4da', '#eadfcf', '#d4c6b1', '#f0ebe3'].map(
  (c) => new THREE.Color(c),
)

/** Material de los edificios: ventanas dibujadas en las fachadas y, de noche, algunas encendidas. */
export function buildingMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = SHARED.uNight
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\nuniform float uNight;\nfloat winMask;\nvec2 winCell;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wall = 1.0 - step(0.6, abs(vWNormal.y));
        vec2 wc = vec2(abs(vWNormal.x) > abs(vWNormal.z) ? vWPos.z : vWPos.x, vWPos.y);
        winCell = floor(wc / vec2(3.6, 3.2));
        vec2 f = fract(wc / vec2(3.6, 3.2));
        winMask = wall * step(0.22, f.x) * step(f.x, 0.78) * step(0.32, f.y) * step(f.y, 0.78);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.42 + vec3(0.03, 0.05, 0.08), winMask * 0.8);
        diffuseColor.rgb *= mix(1.0, 0.86, step(0.6, vWNormal.y));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float lit = step(0.5, fract(sin(dot(winCell, vec2(12.9898, 78.233)) + floor(vWPos.x * 0.02) * 1.7) * 43758.5453));
        totalEmissiveRadiance += vec3(1.0, 0.8, 0.5) * winMask * lit * 1.8 * uNight;`,
      )
  }
  m.customProgramCacheKey = () => 'edificios-ventanas'
  return m
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
