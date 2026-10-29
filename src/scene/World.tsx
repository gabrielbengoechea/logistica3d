import { useEffect, useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEnXR } from '../vr/r3f'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ENTRY, LAND_Y, MOUTH, PAD, anchorageSlot, toTerminal } from './layout'
import { SHARED } from './environment'
import { GROUND_COLORS, groundTexture } from './ground'
import Tag from './Tag'
import { Breakwaters, PortLabels, PortLand, inRing, portRing } from './Port'
import { heightAt, type Zone } from './zone'

const insidePad = (x: number, z: number, margin: number) => {
  const [tx, tz] = toTerminal(x, z)
  return tx > PAD[0] - margin && tx < PAD[1] + margin && tz > PAD[2] - margin && tz < PAD[3] + margin
}

/**
 * Relieve real con la imagen satelital. En la ciudad, encima de la imagen va el suelo dibujado con el mapa (calles,
 * plazas y parques), que se ve nítido de cerca. Bajo la terminal se aplana: ahí va el modelo de la terminal.
 */
function Terrain({ zone }: { zone: Zone }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const maxTextureSize = useThree((s) => s.gl.capabilities.maxTextureSize)
  const ground = useMemo(() => groundTexture(zone.vectors, Math.min(4096, maxTextureSize)), [zone, maxTextureSize])
  useEffect(() => () => ground?.dispose(), [ground])
  useEffect(() => {
    new THREE.TextureLoader().load(zone.imageUrl, (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      setTexture(t)
    })
  }, [zone.imageUrl])

  // En el visor el relieve va con un vértice de cada tres (≈9 veces menos triángulos): de cerca se camina sobre
  // la terminal, que es otro modelo, y la ciudad se ve desde lejos.
  const enXR = useEnXR()
  const geometry = useMemo(() => {
    const { extent, terrain } = zone.meta
    const port = portRing(zone)
    const [pxmin, pxmax, pzmin, pzmax] = port
      ? [Math.min(...port.map((p) => p[0])), Math.max(...port.map((p) => p[0])), Math.min(...port.map((p) => p[1])), Math.max(...port.map((p) => p[1]))]
      : [0, 0, 0, 0]
    const inPort = (x: number, z: number) => !!port && x > pxmin && x < pxmax && z > pzmin && z < pzmax && inRing(port, x, z)
    const paso = enXR ? 3 : 1
    const sc = Math.ceil((terrain.cols - 1) / paso)
    const sr = Math.ceil((terrain.rows - 1) / paso)
    const W = extent.xmax - extent.xmin
    const H = extent.zmax - extent.zmin
    const g = new THREE.PlaneGeometry(W, H, sc, sr)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    const uv = g.attributes.uv as THREE.BufferAttribute
    // Cada vértice toma la muestra real de la grilla del relieve (fila r, columna c; las últimas quedan en el borde).
    for (let r = 0; r <= sr; r++)
      for (let c = 0; c <= sc; c++) {
        const i = r * (sc + 1) + c
        const fc = Math.min(c * paso, terrain.cols - 1)
        const fr = Math.min(r * paso, terrain.rows - 1)
        const x = extent.xmin + (fc / (terrain.cols - 1)) * W
        const z = extent.zmin + (fr / (terrain.rows - 1)) * H
        let h = zone.heights[fr * terrain.cols + fc]
        // Bajo el recinto portuario el relieve queda por debajo de la explanada de los muelles.
        if (insidePad(x, z, 60) || inPort(x, z)) h = Math.min(h, 1)
        pos.setXYZ(i, x, h, z)
        uv.setXY(i, (x - extent.xmin) / W, 1 - (z - extent.zmin) / H)
      }
    g.computeVertexNormals()
    g.computeBoundingBox()
    g.computeBoundingSphere()
    return g
  }, [zone, enXR])

  const material = useMemo(() => {
    if (!texture) return null
    const m = new THREE.MeshStandardMaterial({ map: texture, roughness: 1 })
    const rect = zone.vectors.ground
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = SHARED.uNight
      shader.uniforms.uGround = { value: ground }
      shader.uniforms.uGroundRect = { value: rect ? new THREE.Vector4(rect.xmin, rect.zmin, rect.xmax - rect.xmin, rect.zmax - rect.zmin) : new THREE.Vector4(0, 0, 1, 1) }
      shader.uniforms.uHasGround = { value: ground ? 1 : 0 }
      shader.uniforms.uBlock = { value: new THREE.Color(GROUND_COLORS.block) }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vWPos;\nuniform float uNight;\nuniform sampler2D uGround;\nuniform vec4 uGroundRect;\nuniform float uHasGround;\nuniform vec3 uBlock;\nfloat street;\nfloat cityGround;\nfloat satLum;',
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          // La imagen satelital se aclara y se desatura en tierra firme, para que combine con la interfaz y con el suelo dibujado.
          float onLand = smoothstep(0.4, 1.4, vWPos.y);
          satLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          vec3 washed = mix(mix(vec3(satLum), diffuseColor.rgb, 0.6), uBlock, 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb, washed, onLand);
          // Suelo de la ciudad: se funde con la imagen en los últimos 300 m del rectángulo y solo sobre tierra firme.
          vec2 gm = vWPos.xz - uGroundRect.xy;
          vec2 gUv = gm / uGroundRect.zw;
          vec2 toEdge = min(gm, uGroundRect.zw - gm);
          cityGround = uHasGround * smoothstep(0.0, 500.0, min(toEdge.x, toEdge.y)) * onLand;
          vec4 g = texture2D(uGround, vec2(gUv.x, 1.0 - gUv.y));
          street = cityGround * smoothstep(0.93, 0.98, min(g.r, min(g.g, g.b)));
          diffuseColor.rgb = mix(diffuseColor.rgb, g.rgb, cityGround);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          // Fuera del suelo dibujado, las zonas claras de la imagen original; dentro, las calles.
          float urban = mix(smoothstep(0.16, 0.42, satLum) * step(1.0, vWPos.y), street, cityGround);
          // Faroles: puntos redondos sueltos en una grilla de 12 m, solo en algunas celdas.
          vec2 cellId = floor(vWPos.xz / 12.0);
          vec2 inCell = fract(vWPos.xz / 12.0) - 0.5;
          float pick = fract(sin(dot(cellId, vec2(12.9898, 78.233))) * 43758.5453);
          float lamp = step(0.74, pick) * smoothstep(0.32, 0.04, length(inCell));
          totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * urban * (0.05 + lamp * 1.4) * uNight;`,
        )
    }
    m.customProgramCacheKey = () => 'terreno-ciudad'
    return m
  }, [texture, ground, zone])

  if (!material) return null
  return <mesh geometry={geometry} material={material} receiveShadow />
}

/** Edificios reales (Overture / OpenStreetMap) extruidos a su altura, en un solo mesh. */
function Buildings({ zone }: { zone: Zone }) {
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const port = portRing(zone)
    for (const b of zone.vectors.buildings) {
      const [x0, z0] = b.ring[0]
      if (insidePad(x0, z0, 20)) continue
      const shape = new THREE.Shape(b.ring.map(([x, z]) => new THREE.Vector2(x, -z)))
      const g = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false })
      g.rotateX(-Math.PI / 2)
      // En el puerto, los edificios se apoyan en la explanada de los muelles.
      g.translate(0, port && inRing(port, x0, z0) ? LAND_Y : Math.max(0, heightAt(zone, x0, z0)), 0)
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
  if (useEnXR()) return null
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
      <PortLand zone={zone} />
      <Breakwaters zone={zone} />
      <Buildings zone={zone} />
      <PortLabels zone={zone} />
      <Label at={[-4119, -1440]} y={140}>Cerro de Montevideo · 134 m</Label>
      <Label at={[589, 559]} y={40}>Ciudad Vieja</Label>
      <Label at={[1261, 576]} y={110}>Palacio Salvo</Label>
      <Label at={[-1585, -1842]}>Bahía de Montevideo</Label>
      <Label at={channel}>Canal de acceso</Label>
      <Label at={anchorage}>Fondeadero</Label>
      <Label at={[-500, 6200]}>Río de la Plata</Label>
    </group>
  )
}
