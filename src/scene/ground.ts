import * as THREE from 'three'
import type { ZoneVectors } from './zone'

/** Ancho de cada categoría de calle en metros, de cordón a cordón. */
const ROAD_WIDTH: Record<string, number> = {
  motorway: 22,
  trunk: 20,
  primary: 17,
  secondary: 14,
  tertiary: 11,
  residential: 9,
  unclassified: 8,
  living_street: 7,
  pedestrian: 7,
}

/** Orden de dibujo: las calles chicas abajo, las avenidas arriba. */
const RANK = ['pedestrian', 'living_street', 'unclassified', 'residential', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway']

export const GROUND_COLORS = {
  block: '#dbd5c9',
  green: '#bcd8a2',
  plaza: '#f1ede5',
  curb: '#c6bdae',
  street: '#fdfcfa',
}

/**
 * Suelo de la ciudad dibujado con los datos del mapa: manzanas, calles con su cordón, plazas y espacios verdes.
 * Sale una textura del rectángulo `ground`, en metros locales, con el norte arriba.
 */
export function groundTexture(vectors: ZoneVectors, maxSize: number): THREE.CanvasTexture | null {
  const rect = vectors.ground
  if (!rect) return null
  const w = rect.xmax - rect.xmin
  const h = rect.zmax - rect.zmin
  const scale = Math.min(maxSize / w, maxSize / h) // píxeles por metro
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, -rect.xmin * scale, -rect.zmin * scale)

  ctx.fillStyle = GROUND_COLORS.block
  ctx.fillRect(rect.xmin, rect.zmin, w, h)

  const ring = (pts: [number, number][]) => {
    ctx.beginPath()
    pts.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)))
    ctx.closePath()
  }
  for (const kind of ['plaza', 'verde'] as const) {
    ctx.fillStyle = kind === 'verde' ? GROUND_COLORS.green : GROUND_COLORS.plaza
    for (const p of vectors.parks ?? []) if (p.kind === kind) (ring(p.ring), ctx.fill())
  }

  const roads = [...(vectors.roads ?? [])].filter((r) => ROAD_WIDTH[r.class]).sort((a, b) => RANK.indexOf(a.class) - RANK.indexOf(b.class))
  const stroke = (pts: [number, number][], width: number) => {
    ctx.lineWidth = width
    ctx.beginPath()
    pts.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)))
    ctx.stroke()
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Primero todos los cordones y después todas las calzadas, así los cruces quedan limpios.
  ctx.strokeStyle = GROUND_COLORS.curb
  for (const r of roads) stroke(r.pts, ROAD_WIDTH[r.class] + 2.4)
  ctx.strokeStyle = GROUND_COLORS.street
  for (const r of roads) stroke(r.pts, ROAD_WIDTH[r.class])

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  return texture
}
