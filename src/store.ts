import { create } from 'zustand'
import { buildPositionTracks, type FeedShip, type PositionTrack } from './feeds/positions'
import type { SimEvent } from './sim/events'
import { BASE_PARAMS, simulate, type SimParams, type SimResult } from './sim/terminalSim'
import { buildTracks, type Track } from './sim/tracks'

export type Selection =
  | { kind: 'ship'; id: string }
  | { kind: 'feed'; id: string }
  | { kind: 'crane'; berth: number; index: number }
  | { kind: 'yard' }
  | null
export type View = 'terminal' | 'bahia' | 'escalas'

interface State {
  params: SimParams
  result: SimResult
  tracks: Track[]
  /** Escenario guardado para comparar contra el actual. */
  base: SimResult
  /** Tiempo, en horas desde el inicio del escenario. */
  t: number
  playing: boolean
  /** Horas simuladas por segundo real. */
  speed: number
  selection: Selection
  view: View
  /** Buque que sigue la cámara (id), o null. */
  follow: string | null
  zoneReady: boolean
  /**
   * Recorridos de una fuente externa de posiciones (AIS, GPS...). Hoy vacío: la app usa solo el
   * simulador. Es la puerta para conectar datos reales más adelante (ver docs/datos-reales.md).
   */
  feedTracks: PositionTrack[]

  setParams: (params: SimParams) => void
  setParam: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void
  saveBase: () => void
  resetToBase: () => void
  setT: (t: number) => void
  togglePlay: () => void
  setSpeed: (speed: number) => void
  select: (s: Selection) => void
  setView: (v: View) => void
  setFollow: (id: string | null) => void
  setZoneReady: (ready: boolean) => void
  /** Carga posiciones externas en el formato de eventos común (eventos de tipo 'position'). */
  setFeed: (ships: FeedShip[], events: SimEvent[]) => void
  advance: (dtSeconds: number) => void
}

function run(params: SimParams) {
  const result = simulate(params)
  return { params, result, tracks: buildTracks(result) }
}

const initial = run(BASE_PARAMS)

export const useStore = create<State>()((set, get) => ({
  ...initial,
  base: initial.result,
  t: 2,
  playing: true,
  speed: 1,
  selection: null,
  view: 'terminal',
  follow: null,
  zoneReady: false,
  feedTracks: [],

  setParams: (params) => {
    const next = run(params)
    set({ ...next, t: Math.min(get().t, params.days * 24 - 0.01) })
  },
  setParam: (key, value) => get().setParams({ ...get().params, [key]: value }),
  saveBase: () => set({ base: get().result }),
  resetToBase: () => get().setParams(get().base.params),
  setT: (t) => set({ t }),
  togglePlay: () => set({ playing: !get().playing }),
  setSpeed: (speed) => set({ speed }),
  select: (selection) => {
    const keep = selection && 'id' in selection && selection.id === get().follow
    set({ selection, follow: keep ? get().follow : null })
  },
  setView: (view) => set({ view, follow: null }),
  setFollow: (follow) => set({ follow }),
  setZoneReady: (zoneReady) => set({ zoneReady }),
  setFeed: (ships, events) => set({ feedTracks: buildPositionTracks(ships, events) }),
  advance: (dt) => {
    const s = get()
    if (!s.playing) return
    const horizon = s.params.days * 24
    const t = s.t + dt * s.speed
    set({ t: t >= horizon ? 0 : t })
  },
}))
