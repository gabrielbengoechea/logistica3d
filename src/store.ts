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
/** Calidad gráfica: alta (sombras, oclusión ambiental y brillo), media (sin oclusión) o baja (sin efectos). */
export type Quality = 'alta' | 'media' | 'baja'
/** Color de los íconos de la interfaz (ver index.css). */
export type IconTint = 'sistema' | 'azul' | 'grafito' | 'puerto' | 'trazo'

function savedTint(): IconTint {
  try {
    const v = localStorage.getItem('l3-iconos') as IconTint | null
    return v && ['sistema', 'azul', 'grafito', 'puerto', 'trazo'].includes(v) ? v : 'puerto'
  } catch {
    return 'puerto'
  }
}

/** Tamaño de la interfaz (escala de los paneles y la letra). */
export const UI_SCALES = [0.85, 1, 1.15, 1.3] as const
export type UiScale = (typeof UI_SCALES)[number]

function savedScale(): UiScale {
  try {
    const v = Number(localStorage.getItem('l3-escala'))
    return (UI_SCALES as readonly number[]).includes(v) ? (v as UiScale) : 1
  } catch {
    return 1
  }
}

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
  quality: Quality
  /** Si el usuario eligió la calidad a mano, no se baja sola. */
  qualityLocked: boolean
  /** La luz sigue la hora simulada (día, atardecer, noche) o queda fija de día. */
  dayNight: boolean
  /**
   * Recorridos de una fuente externa de posiciones (AIS, GPS...). Hoy vacío: la app usa solo el
   * simulador. Es la puerta para conectar datos reales más adelante (ver docs/datos-reales.md).
   */
  feedTracks: PositionTrack[]
  /** Modo presentación: interfaz más grande para proyectar en el pizarrón. */
  presenting: boolean
  /** Comparación de tamaños (buques, cancha, edificios) en el mar, visible u oculta. */
  showScale: boolean
  iconTint: IconTint
  uiScale: UiScale
  /** Recorrido guiado en curso: cuál y en qué paso. */
  tour: { key: string; step: number } | null

  setParams: (params: SimParams) => void
  setParam: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void
  saveBase: () => void
  /** Arranca un escenario comparado contra otra base (lo usan las actividades), desde el principio. */
  startScenario: (base: SimParams, params: SimParams) => void
  resetToBase: () => void
  setT: (t: number) => void
  togglePlay: () => void
  setSpeed: (speed: number) => void
  select: (s: Selection) => void
  setView: (v: View) => void
  setFollow: (id: string | null) => void
  setZoneReady: (ready: boolean) => void
  setQuality: (q: Quality, byUser?: boolean) => void
  setDayNight: (on: boolean) => void
  /** Carga posiciones externas en el formato de eventos común (eventos de tipo 'position'). */
  setFeed: (ships: FeedShip[], events: SimEvent[]) => void
  setPresenting: (on: boolean) => void
  setShowScale: (on: boolean) => void
  setIconTint: (tint: IconTint) => void
  setUiScale: (scale: UiScale) => void
  setTour: (tour: { key: string; step: number } | null) => void
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
  quality: typeof window !== 'undefined' && window.innerWidth < 900 ? 'media' : 'alta',
  qualityLocked: false,
  dayNight: true,
  feedTracks: [],
  presenting: false,
  showScale: false,
  iconTint: savedTint(),
  uiScale: savedScale(),
  tour: null,

  setParams: (params) => {
    const next = run(params)
    set({ ...next, t: Math.min(get().t, params.days * 24 - 0.01) })
  },
  setParam: (key, value) => get().setParams({ ...get().params, [key]: value }),
  saveBase: () => set({ base: get().result }),
  startScenario: (base, params) =>
    set({ ...run(params), base: simulate(base), t: 0, playing: true, selection: null, follow: null }),
  resetToBase: () => get().setParams(get().base.params),
  setT: (t) => set({ t }),
  togglePlay: () => set({ playing: !get().playing }),
  setSpeed: (speed) => set({ speed }),
  select: (selection) => {
    const keep = selection && 'id' in selection && selection.id === get().follow
    set({ selection, follow: keep ? get().follow : null })
  },
  // La vista "Escalas" va a la comparación de tamaños, así que la muestra.
  setView: (view) => set({ view, follow: null, tour: null, showScale: view === 'escalas' ? true : get().showScale }),
  setFollow: (follow) => set({ follow }),
  setZoneReady: (zoneReady) => set({ zoneReady }),
  setQuality: (quality, byUser = false) => set({ quality, qualityLocked: byUser || get().qualityLocked }),
  setDayNight: (dayNight) => set({ dayNight }),
  setPresenting: (presenting) => set({ presenting }),
  setShowScale: (showScale) => set({ showScale }),
  setIconTint: (iconTint) => {
    try {
      localStorage.setItem('l3-iconos', iconTint)
    } catch {
      // Sin almacenamiento: vale solo para esta sesión.
    }
    set({ iconTint })
  },
  setUiScale: (uiScale) => {
    try {
      localStorage.setItem('l3-escala', String(uiScale))
    } catch {
      // Sin almacenamiento: vale solo para esta sesión.
    }
    set({ uiScale })
  },
  setTour: (tour) => set({ tour, follow: null, selection: null }),
  setFeed: (ships, events) => set({ feedTracks: buildPositionTracks(ships, events) }),
  advance: (dt) => {
    const s = get()
    if (!s.playing) return
    const horizon = s.params.days * 24
    const t = s.t + dt * s.speed
    set({ t: t >= horizon ? 0 : t })
  },
}))
