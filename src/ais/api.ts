import type { SimEvent } from '../sim/events'

export interface AisShip {
  id: string
  mmsi: number
  name: string
  type: string
  typeCode: number | null
  length: number | null
  beam: number | null
  destination: string | null
}

export interface AisReplay {
  /** Inicio del día, segundos Unix. */
  start: number
  hours: number
  synthetic: boolean
  ships: AisShip[]
  events: SimEvent[]
}

export interface AisCalibration {
  days: number
  berthCalls: number
  callsPerDay: number
  avgBerthH: number | null
  avgWaitH: number | null
  shareAnchored: number | null
}

/**
 * Dirección del servicio AIS: ?ais=http://localhost:8000 en la URL o VITE_AIS_API al compilar.
 * Sin servicio, la app funciona solo con el simulador.
 */
export function aisApiBase(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get('ais')
  const base = fromUrl || (import.meta.env.VITE_AIS_API as string | undefined) || null
  return base ? base.replace(/\/$/, '') : null
}

async function get<T>(path: string): Promise<T> {
  const base = aisApiBase()
  if (!base) throw new Error('No hay servicio AIS configurado')
  const r = await fetch(`${base}${path}`)
  if (!r.ok) throw new Error(`El servicio AIS respondió ${r.status}`)
  return r.json()
}

export const fetchDays = () => get<{ date: string; positions: number }[]>('/api/days')
export const fetchReplay = (date: string) => get<AisReplay>(`/api/replay?date=${date}`)
export const fetchStats = (start: string, end: string) => get<AisCalibration>(`/api/stats?start=${start}&end=${end}`)
export const fetchSnapshot = () => get<{ now: number; ships: AisShip[]; events: SimEvent[] }>('/api/live/snapshot')

export function openLive(onMessage: (msg: { event: SimEvent; ship: AisShip }) => void, onStatus: (open: boolean) => void): WebSocket | null {
  const base = aisApiBase()
  if (!base) return null
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/live`)
  ws.onopen = () => onStatus(true)
  ws.onclose = () => onStatus(false)
  ws.onmessage = (m) => onMessage(JSON.parse(m.data))
  return ws
}
