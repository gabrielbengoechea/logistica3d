import { create } from 'zustand'
import { BASE_PARAMS, simulate, type SimParams, type SimResult } from './sim/terminalSim'
import { buildTracks, type Track } from './sim/tracks'

export type Selection = { kind: 'ship'; id: string } | { kind: 'crane'; berth: number; index: number } | { kind: 'yard' } | null
export type View = 'terminal' | 'bahia' | 'escalas'

interface State {
  params: SimParams
  result: SimResult
  tracks: Track[]
  /** Escenario guardado para comparar contra el actual. */
  base: SimResult
  /** Tiempo simulado, en horas desde el inicio. */
  t: number
  playing: boolean
  /** Horas simuladas por segundo real. */
  speed: number
  selection: Selection
  view: View
  /** Buque que sigue la cámara (id), o null. */
  follow: string | null
  zoneReady: boolean
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
  setParam: (key, value) => set(run({ ...get().params, [key]: value })),
  saveBase: () => set({ base: get().result }),
  resetToBase: () => set(run(get().base.params)),
  setT: (t) => set({ t }),
  togglePlay: () => set({ playing: !get().playing }),
  setSpeed: (speed) => set({ speed }),
  select: (selection) => set({ selection, follow: selection?.kind === 'ship' && selection.id === get().follow ? get().follow : null }),
  setView: (view) => set({ view, follow: null }),
  setFollow: (follow) => set({ follow }),
  setZoneReady: (zoneReady) => set({ zoneReady }),
  advance: (dt) => {
    const s = get()
    if (!s.playing) return
    const horizon = s.params.days * 24
    const t = s.t + dt * s.speed
    set({ t: t >= horizon ? 0 : t })
  },
}))

export const craneRate = (p: SimParams) => p.cranesPerBerth * p.movesPerCraneHour
