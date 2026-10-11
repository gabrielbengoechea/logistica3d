import type { Ship, SimParams, SimResult } from './terminalSim'

/** Recorrido de un buque, reconstruido a partir de los eventos. Es lo que reproduce el motor 3D. */
export interface Track {
  ship: Ship
  index: number
  arrive: number
  berthAt?: number
  berth?: number
  workStart?: number
  workEnd?: number
  depart?: number
}

export function buildTracks(r: SimResult): Track[] {
  const byId = new Map<string, Track>()
  r.ships.forEach((ship, index) => byId.set(ship.id, { ship, index, arrive: Infinity }))
  for (const e of r.events) {
    const tr = byId.get(e.entity)
    if (!tr) continue
    if (e.type === 'arrive') tr.arrive = e.t
    else if (e.type === 'berth') {
      tr.berthAt = e.t
      tr.berth = e.data?.berth
    } else if (e.type === 'work-start') tr.workStart = e.t
    else if (e.type === 'work-end') tr.workEnd = e.t
    else if (e.type === 'depart') tr.depart = e.t
  }
  return [...byId.values()].filter((tr) => tr.arrive !== Infinity)
}

/** Horas de navegación visibles antes de llegar al fondeadero y después de dejar el muelle. */
export const APPROACH_H = 2.5
export const EXIT_H = 2

export type Phase = 'hidden' | 'approaching' | 'anchored' | 'berthing' | 'working' | 'unberthing' | 'leaving'

export const PHASE_LABEL: Record<Phase, string> = {
  hidden: 'Fuera de la zona',
  approaching: 'Entrando por el canal',
  anchored: 'Esperando en el fondeadero',
  berthing: 'Atracando',
  working: 'Descargando',
  unberthing: 'Desatracando',
  leaving: 'Saliendo por el canal',
}

/** Parámetros que necesita phaseAt para estimar lo que los eventos todavía no dicen (buques que siguen en el muelle al final). */
export type PhaseParams = Pick<SimParams, 'cranesPerBerth' | 'movesPerCraneHour' | 'berthingH' | 'unberthingH'>

/** Fase del buque en el instante t y avance dentro de esa fase (0 a 1). */
export function phaseAt(tr: Track, t: number, p: PhaseParams): { phase: Phase; u: number } {
  const rate = p.cranesPerBerth * p.movesPerCraneHour
  if (t < tr.arrive - APPROACH_H) return { phase: 'hidden', u: 0 }
  if (t < tr.arrive) return { phase: 'approaching', u: (t - tr.arrive + APPROACH_H) / APPROACH_H }
  if (tr.berthAt === undefined || t < tr.berthAt) return { phase: 'anchored', u: 0 }
  const ws = tr.workStart ?? tr.berthAt + p.berthingH
  if (t < ws) return { phase: 'berthing', u: (t - tr.berthAt) / (ws - tr.berthAt) }
  if (tr.workEnd === undefined) return { phase: 'working', u: Math.min(0.99, ((t - ws) * rate) / tr.ship.moves) }
  if (t < tr.workEnd) return { phase: 'working', u: (t - ws) / (tr.workEnd - ws) }
  const dep = tr.depart ?? tr.workEnd + p.unberthingH
  if (t < dep) return { phase: 'unberthing', u: (t - tr.workEnd) / (dep - tr.workEnd) }
  if (t < dep + EXIT_H) return { phase: 'leaving', u: (t - dep) / EXIT_H }
  return { phase: 'hidden', u: 0 }
}
