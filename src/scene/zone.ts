import { useEffect, useState } from 'react'

/** Datos de una zona preparados por tools/pipeline/build_zone.py. */
export interface ZoneMeta {
  name: string
  extent: { xmin: number; xmax: number; zmin: number; zmax: number }
  terrain: { file: string; cols: number; rows: number; res: number }
  imagery: { file: string; source: string }
  vectors: { file: string; source: string }
}

export interface ZoneVectors {
  buildings: { h: number; ring: [number, number][] }[]
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
  const [bin, vectors] = await Promise.all([
    fetch(`${dir}${meta.terrain.file}`).then((r) => r.arrayBuffer()),
    fetch(`${dir}${meta.vectors.file}`).then((r) => r.json()),
  ])
  const dm = new Int16Array(bin)
  const heights = new Float32Array(dm.length)
  for (let i = 0; i < dm.length; i++) heights[i] = dm[i] / 10
  return { meta, heights, vectors, imageUrl: `${dir}${meta.imagery.file}` }
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
