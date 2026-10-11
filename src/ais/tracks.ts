import type { SimEvent } from '../sim/events'
import type { AisShip } from './api'

/** Reportes de un buque AIS en orden de tiempo, listos para interpolar. */
export interface AisTrack {
  ship: AisShip
  t: number[]
  x: number[]
  z: number[]
  sog: (number | null)[]
  /** Rumbo de la proa como rotación de la escena (radianes), arrastrando el último conocido. */
  yaw: number[]
  status: (number | null)[]
}

/** Más de 20 minutos sin reportes: el buque deja de mostrarse. */
export const STALE_H = 20 / 60

/** Grados desde el norte (sentido horario) a rotación de la escena (proa hacia +x, z hacia el sur). */
const toYaw = (deg: number) => Math.PI / 2 - (deg * Math.PI) / 180

export function emptyTrack(ship: AisShip): AisTrack {
  return { ship, t: [], x: [], z: [], sog: [], yaw: [], status: [] }
}

export function pushEvent(tr: AisTrack, e: SimEvent, t: number): void {
  if (!e.pos) return
  if (tr.t.length && t <= tr.t[tr.t.length - 1]) return
  const d = e.data ?? {}
  const prev = tr.yaw.length ? tr.yaw[tr.yaw.length - 1] : 0
  const moving = (d.sog ?? 0) > 0.5
  const deg = d.heading ?? (moving ? d.cog : null)
  tr.t.push(t)
  tr.x.push(e.pos[0])
  tr.z.push(e.pos[1])
  tr.sog.push(d.sog ?? null)
  tr.yaw.push(deg != null ? toYaw(deg) : prev)
  tr.status.push(d.status ?? null)
}

export function buildAisTracks(ships: AisShip[], events: SimEvent[]): AisTrack[] {
  const byId = new Map(ships.map((s) => [s.id, emptyTrack(s)]))
  for (const e of events) {
    const tr = byId.get(e.entity)
    if (tr) pushEvent(tr, e, e.t)
  }
  return [...byId.values()].filter((tr) => tr.t.length > 0)
}

export interface AisPose {
  visible: boolean
  x: number
  z: number
  yaw: number
  sog: number | null
  status: number | null
  /** Horas desde el último reporte. */
  age: number
}

const HIDDEN: AisPose = { visible: false, x: 0, z: 0, yaw: 0, sog: null, status: null, age: Infinity }

export function aisPoseAt(tr: AisTrack, t: number): AisPose {
  const ts = tr.t
  if (!ts.length || t < ts[0]) return HIDDEN
  // Último reporte con tiempo <= t (búsqueda binaria).
  let lo = 0
  let hi = ts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ts[mid] <= t) lo = mid
    else hi = mid - 1
  }
  const i = lo
  const age = t - ts[i]
  if (age > STALE_H) return HIDDEN
  const j = i + 1
  if (j < ts.length && ts[j] - ts[i] <= STALE_H) {
    const u = (t - ts[i]) / (ts[j] - ts[i])
    const d = ((((tr.yaw[j] - tr.yaw[i] + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
    return {
      visible: true,
      x: tr.x[i] + (tr.x[j] - tr.x[i]) * u,
      z: tr.z[i] + (tr.z[j] - tr.z[i]) * u,
      yaw: tr.yaw[i] + d * u,
      sog: tr.sog[i],
      status: tr.status[i],
      age,
    }
  }
  return { visible: true, x: tr.x[i], z: tr.z[i], yaw: tr.yaw[i], sog: tr.sog[i], status: tr.status[i], age }
}

export const NAV_STATUS: Record<number, string> = {
  0: 'Navegando con motor',
  1: 'Fondeado',
  2: 'Sin gobierno',
  3: 'Maniobra restringida',
  5: 'Amarrado',
  6: 'Varado',
  7: 'Pescando',
  8: 'Navegando a vela',
}
