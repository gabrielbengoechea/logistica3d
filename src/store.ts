import { create } from 'zustand'
import { fetchReplay, fetchSnapshot, openLive, type AisReplay } from './ais/api'
import { buildAisTracks, emptyTrack, pushEvent, type AisTrack } from './ais/tracks'
import { BASE_PARAMS, simulate, type SimParams, type SimResult } from './sim/terminalSim'
import { buildTracks, type Track } from './sim/tracks'

export type Selection =
  | { kind: 'ship'; id: string }
  | { kind: 'ais'; id: string }
  | { kind: 'crane'; berth: number; index: number }
  | { kind: 'yard' }
  | null
export type View = 'terminal' | 'bahia' | 'escalas'
/** De dónde salen los buques: el simulador, un día de AIS guardado o AIS en vivo. */
export type Source = 'sim' | 'replay' | 'live'

interface State {
  params: SimParams
  result: SimResult
  tracks: Track[]
  /** Escenario guardado para comparar contra el actual. */
  base: SimResult
  /** Tiempo, en horas desde el inicio del escenario (o del día AIS, o de la conexión en vivo). */
  t: number
  playing: boolean
  /** Horas simuladas por segundo real. */
  speed: number
  selection: Selection
  view: View
  /** Buque que sigue la cámara (id), o null. */
  follow: string | null
  zoneReady: boolean

  source: Source
  replay: (AisReplay & { date: string }) | null
  aisTracks: AisTrack[]
  /** Inicio de la sesión en vivo, segundos Unix. */
  liveStart: number
  liveConnected: boolean
  aisError: string | null

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
  setSource: (source: Source) => void
  loadReplay: (date: string) => Promise<void>
  advance: (dtSeconds: number) => void
}

function run(params: SimParams) {
  const result = simulate(params)
  return { params, result, tracks: buildTracks(result) }
}

const initial = run(BASE_PARAMS)
let liveSocket: WebSocket | null = null

/** Horas que dura el escenario de la fuente actual. */
export function horizonOf(s: Pick<State, 'source' | 'params' | 'replay'>): number {
  if (s.source === 'sim') return s.params.days * 24
  if (s.source === 'replay') return s.replay?.hours ?? 24
  return Infinity
}

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
  source: 'sim',
  replay: null,
  aisTracks: [],
  liveStart: 0,
  liveConnected: false,
  aisError: null,

  setParam: (key, value) => set(run({ ...get().params, [key]: value })),
  saveBase: () => set({ base: get().result }),
  resetToBase: () => set(run(get().base.params)),
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

  setSource: (source) => {
    liveSocket?.close()
    liveSocket = null
    set({ source, selection: null, follow: null, aisError: null, aisTracks: source === 'replay' ? get().aisTracks : [] })
    if (source === 'sim') set({ t: 2, replay: null, aisTracks: [] })
    if (source === 'live') {
      const liveStart = Date.now() / 1000
      set({ liveStart, t: 0, liveConnected: false })
      const toH = (unix: number) => (unix - liveStart) / 3600
      fetchSnapshot()
        .then((snap) => {
          const tracks = new Map(snap.ships.map((s) => [s.id, emptyTrack(s)]))
          for (const e of snap.events) {
            const tr = tracks.get(e.entity)
            if (tr) pushEvent(tr, e, toH(e.t))
          }
          set({ aisTracks: [...tracks.values()].filter((tr) => tr.t.length) })
        })
        .catch((err) => set({ aisError: String(err.message ?? err) }))
      liveSocket = openLive(
        ({ event, ship }) => {
          const tracks = get().aisTracks
          let tr = tracks.find((x) => x.ship.id === event.entity)
          if (!tr) {
            tr = emptyTrack(ship)
            set({ aisTracks: [...tracks, tr] })
          }
          pushEvent(tr, event, toH(event.t))
        },
        (liveConnected) => set({ liveConnected }),
      )
    }
  },

  loadReplay: async (date) => {
    set({ aisError: null })
    try {
      const replay = await fetchReplay(date)
      set({ replay: { ...replay, date }, aisTracks: buildAisTracks(replay.ships, replay.events), t: 0, selection: null, follow: null })
    } catch (err) {
      set({ aisError: String((err as Error).message ?? err) })
    }
  },

  advance: (dt) => {
    const s = get()
    if (s.source === 'live') {
      set({ t: (Date.now() / 1000 - s.liveStart) / 3600 })
      return
    }
    if (!s.playing) return
    const horizon = horizonOf(s)
    const t = s.t + dt * s.speed
    set({ t: t >= horizon ? 0 : t })
  },
}))

export const craneRate = (p: SimParams) => p.cranesPerBerth * p.movesPerCraneHour
