import { mulberry32 } from './rng'
import type { SimEvent } from './events'

/**
 * Simulador básico de una terminal de contenedores.
 *
 * Los buques llegan al azar (proceso de Poisson), esperan en el fondeadero si no hay muelle libre,
 * atracan, las grúas descargan al patio y los camiones retiran contenedores del patio
 * (cada contenedor queda en promedio DWELL_H horas, con un tope de camiones por hora).
 * Si el patio se llena, las grúas frenan. Es un modelo de pasos de 5 minutos, pensado para clase:
 * simple de explicar y rápido de recalcular cuando el alumno mueve un control.
 */
export interface SimParams {
  /** Llegadas promedio de buques por día. */
  shipsPerDay: number
  /** Muelles habilitados (1 a 3). */
  berths: number
  cranesPerBerth: number
  /** Productividad de cada grúa, en movimientos (contenedores) por hora. */
  movesPerCraneHour: number
  /** Contenedores por hora que los camiones sacan del patio. */
  truckMovesPerHour: number
  days: number
  seed: number
}

export interface Ship {
  id: string
  name: string
  /** Eslora en metros. */
  length: number
  /** Manga en metros. */
  beam: number
  /** Contenedores a descargar. */
  moves: number
}

export interface Sample {
  t: number
  queue: number
  busyBerths: number
  yard: number
}

export interface Kpis {
  /** Espera media en el fondeadero, en horas. */
  avgWaitH: number
  maxQueue: number
  /** Fracción del tiempo con los muelles ocupados (0 a 1). */
  berthOccupancy: number
  shipsServed: number
  /** Ocupación media del patio (0 a 1). */
  avgYard: number
  /** Horas en que las grúas tuvieron que frenar porque el patio estaba lleno. */
  hoursYardFull: number
}

export interface SimResult {
  params: SimParams
  ships: Ship[]
  events: SimEvent[]
  samples: Sample[]
  kpis: Kpis
  yardCapacity: number
}

export const YARD_CAPACITY = 2880
export const MANEUVER_IN_H = 1.5
export const MANEUVER_OUT_H = 1
/** Horas promedio que un contenedor queda en el patio antes de que lo retire un camión. */
export const DWELL_H = 20
/** Horas simuladas antes del inicio para que la terminal no arranque vacía. */
const WARMUP_H = 24
const DT = 1 / 12

export const BASE_PARAMS: SimParams = {
  shipsPerDay: 2.5,
  berths: 2,
  cranesPerBerth: 3,
  movesPerCraneHour: 25,
  truckMovesPerHour: 100,
  days: 7,
  seed: 4,
}

const NAMES = [
  'Atlántico Sur',
  'Cerro Azul',
  'Punta Brava',
  'Isla de Flores',
  'Santa Lucía',
  'Cabo Polonio',
  'Arroyo Seco',
  'Rambla Norte',
  'Sierra Chica',
  'Barra Grande',
  'Faro Real',
  'Río Negro',
]

export function shipName(i: number): string {
  const lap = Math.floor(i / NAMES.length)
  return `MV ${NAMES[i % NAMES.length]}${lap > 0 ? ` ${lap + 1}` : ''}`
}

type Phase = 'waiting' | 'in' | 'working' | 'leaving' | 'gone'

export function simulate(p: SimParams): SimResult {
  const rand = mulberry32(p.seed)
  const horizon = p.days * 24

  // Llegadas. Se sortean antes de simular, así cambiar grúas o muelles no cambia qué buques llegan.
  const ships: Ship[] = []
  const arrivals: number[] = []
  const meanGap = 24 / p.shipsPerDay
  let next = -WARMUP_H + rand() * meanGap
  while (next < horizon) {
    const moves = Math.round(600 + rand() * 700)
    const length = Math.round(170 + ((moves - 600) / 700) * 130)
    const i = ships.length
    ships.push({ id: `B${String(i + 1).padStart(2, '0')}`, name: shipName(i), length, beam: length > 260 ? 46 : 32, moves })
    arrivals.push(next)
    next += -Math.log(1 - rand()) * meanGap
  }

  const phase: Phase[] = ships.map(() => 'waiting')
  const remaining = ships.map((s) => s.moves)
  const until = ships.map(() => 0)
  const waitEnd: (number | undefined)[] = ships.map(() => undefined)
  const berthShip: number[] = Array(p.berths).fill(-1)
  const queue: number[] = []
  const events: SimEvent[] = []
  const samples: Sample[] = []
  const rate = p.cranesPerBerth * p.movesPerCraneHour

  let yard = Math.round(YARD_CAPACITY * 0.5)
  let arrived = 0
  let busyTime = 0
  let yardFullH = 0
  let yardSum = 0
  let maxQueue = 0
  const steps = Math.round(horizon / DT)

  // k < 0: precalentamiento. Se simula igual, pero no cuenta para las muestras ni los indicadores.
  for (let k = -Math.round(WARMUP_H / DT); k < steps; k++) {
    const now = k * DT
    const measuring = k >= 0

    while (arrived < ships.length && arrivals[arrived] <= now) {
      queue.push(arrived)
      events.push({ t: arrivals[arrived], entity: ships[arrived].id, type: 'arrive' })
      arrived++
    }

    for (let b = 0; b < p.berths; b++) {
      if (berthShip[b] !== -1 || queue.length === 0) continue
      const i = queue.shift()!
      berthShip[b] = i
      phase[i] = 'in'
      until[i] = now + MANEUVER_IN_H
      waitEnd[i] = now
      events.push({ t: now, entity: ships[i].id, type: 'berth', data: { berth: b } })
    }

    let unloaded = 0
    let blocked = false
    for (let b = 0; b < p.berths; b++) {
      const i = berthShip[b]
      if (i === -1) continue
      if (measuring) busyTime += DT
      if (phase[i] === 'in' && now >= until[i]) {
        phase[i] = 'working'
        events.push({ t: now, entity: ships[i].id, type: 'work-start', data: { berth: b } })
      }
      if (phase[i] === 'working') {
        const room = Math.max(0, YARD_CAPACITY - yard - unloaded)
        const wanted = Math.min(rate * DT, remaining[i])
        if (room < wanted) blocked = true
        const m = Math.min(wanted, room)
        remaining[i] -= m
        unloaded += m
        if (remaining[i] <= 1e-6) {
          phase[i] = 'leaving'
          until[i] = now + MANEUVER_OUT_H
          events.push({ t: now, entity: ships[i].id, type: 'work-end', data: { berth: b } })
        }
      } else if (phase[i] === 'leaving' && now >= until[i]) {
        phase[i] = 'gone'
        berthShip[b] = -1
        events.push({ t: now, entity: ships[i].id, type: 'depart', data: { berth: b } })
      }
    }

    yard += unloaded
    yard -= Math.min(yard / DWELL_H, p.truckMovesPerHour) * DT
    if (!measuring) continue
    if (blocked) yardFullH += DT
    yardSum += yard
    maxQueue = Math.max(maxQueue, queue.length)
    if (k % 12 === 0) {
      samples.push({ t: now, queue: queue.length, busyBerths: berthShip.filter((x) => x !== -1).length, yard })
    }
  }

  // Indicadores de los buques que llegan dentro del horizonte. Uno que sigue esperando al final
  // cuenta con la espera que lleva hasta ahí.
  let waitSum = 0
  let counted = 0
  for (let i = 0; i < arrived; i++) {
    if (arrivals[i] < 0) continue
    waitSum += (waitEnd[i] ?? horizon) - arrivals[i]
    counted++
  }

  return {
    params: p,
    ships,
    events,
    samples,
    yardCapacity: YARD_CAPACITY,
    kpis: {
      avgWaitH: counted ? waitSum / counted : 0,
      maxQueue,
      berthOccupancy: busyTime / (p.berths * horizon),
      shipsServed: phase.filter((x) => x === 'gone').length,
      avgYard: yardSum / steps / YARD_CAPACITY,
      hoursYardFull: yardFullH,
    },
  }
}

/** Estado de la terminal en el instante t (horas), interpolando las muestras horarias. */
export function sampleAt(r: SimResult, t: number): Sample {
  const s = r.samples
  const i = Math.max(0, Math.min(s.length - 1, Math.floor(t)))
  const a = s[i]
  const b = s[Math.min(s.length - 1, i + 1)]
  const u = Math.max(0, Math.min(1, t - a.t))
  return { ...a, t, yard: a.yard + (b.yard - a.yard) * u }
}
