import { useEffect, useState } from 'react'

/** Datos de una zona preparados por tools/zone/build-zone.ts. */
export interface ZoneMeta {
  name: string
  extent: { xmin: number; xmax: number; zmin: number; zmax: number }
  terrain: { file: string; encoding: 'terrarium'; cols: number; rows: number; res: number }
  imagery: { file: string; source: string }
  vectors: { file: string; source: string }
}

export interface ZoneVectors {
  buildings: { h: number; ring: [number, number][] }[]
  /** Muelles, escolleras y espigones (OpenStreetMap): polígonos o líneas. */
  piers?: { class: string; name: string | null; ring?: [number, number][]; line?: [number, number][] }[]
  /** Áreas industriales y portuarias, entre ellas el recinto del puerto. */
  areas?: { class: string; name: string | null; ring: [number, number][] }[]
}

export interface Zone {
  meta: ZoneMeta
  /** Altura del relieve en metros, por celda (filas de norte a sur). */
  heights: Float32Array
  vectors: ZoneVectors
  imageUrl: string
}

const base = `${import.meta.env.BASE_URL}zones/`

async function load(name: string): Promise<Zone> {
  const dir = `${base}${name}/`
  const meta: ZoneMeta = await (await fetch(`${dir}zone.json`)).json()
  const [png, vectors] = await Promise.all([
    fetch(`${dir}${meta.terrain.file}`).then((r) => r.blob()),
    fetch(`${dir}${meta.vectors.file}`).then((r) => r.json()),
  ])
  return { meta, heights: await decodeTerrarium(png), vectors, imageUrl: `${dir}${meta.imagery.file}` }
}

/** Alturas de un PNG Terrarium: altura = R*256 + G + B/256 - 32768. */
async function decodeTerrarium(png: Blob): Promise<Float32Array> {
  const bmp = await createImageBitmap(png, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data
  const heights = new Float32Array(bmp.width * bmp.height)
  for (let i = 0; i < heights.length; i++) heights[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768
  return heights
}

export function useZone(name: string): Zone | null {
  const [zone, setZone] = useState<Zone | null>(null)
  useEffect(() => {
    let alive = true
    load(name).then((z) => alive && setZone(z))
    return () => {
      alive = false
    }
  }, [name])
  return zone
}

/** Altura del relieve en un punto del mapa (interpolación bilineal). */
export function heightAt(zone: Zone, x: number, z: number): number {
  const { extent, terrain } = zone.meta
  const fx = Math.max(0, Math.min(terrain.cols - 1.001, (x - extent.xmin) / terrain.res))
  const fz = Math.max(0, Math.min(terrain.rows - 1.001, (z - extent.zmin) / terrain.res))
  const c = Math.floor(fx)
  const r = Math.floor(fz)
  const u = fx - c
  const v = fz - r
  const h = (rr: number, cc: number) => zone.heights[rr * terrain.cols + cc]
  return (h(r, c) * (1 - u) + h(r, c + 1) * u) * (1 - v) + (h(r + 1, c) * (1 - u) + h(r + 1, c + 1) * u) * v
}
