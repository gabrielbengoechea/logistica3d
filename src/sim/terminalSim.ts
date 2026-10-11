import { mulberry32 } from './rng'
import type { SimEvent } from './events'

/**
 * Simulador básico de una terminal de contenedores.
 *
 * Los buques llegan (al azar o según un itinerario), esperan en el fondeadero si no hay muelle libre,
 * atracan, las grúas descargan al patio durante sus turnos y los camiones retiran contenedores del patio
 * (cada contenedor queda en promedio `dwellH` horas, con un tope de camiones por hora).
 * Si el patio se llena, las grúas frenan. Es un modelo de pasos de 5 minutos, pensado para clase:
 * simple de explicar y rápido de recalcular cuando el alumno mueve un control.
 */

export type ShipClassKey = 'feeder' | 'panamax' | 'postpanamax'

export interface ShipClass {
  key: ShipClassKey
  label: string
  /** Eslora en metros [mín, máx]. */
  length: [number, number]
  /** Manga en metros. */
  beam: number
  /** Contenedores a descargar por escala [mín, máx]. */
  moves: [number, number]
  description: string
}

export const SHIP_CLASSES: Record<ShipClassKey, ShipClass> = {
  feeder: {
    key: 'feeder',
    label: 'Feeder',
    length: [140, 190],
    beam: 27,
    moves: [250, 550],
    description: 'Buque chico que conecta puertos de la región con los grandes puertos de trasbordo.',
  },
  panamax: {
    key: 'panamax',
    label: 'Panamax',
    length: [230, 294],
    beam: 32,
    moves: [650, 1150],
    description: 'Hecho a la medida de las esclusas originales del canal de Panamá: 32 m de manga como máximo.',
  },
  postpanamax: {
    key: 'postpanamax',
    label: 'Post-Panamax',
    length: [295, 300],
    beam: 46,
    moves: [1100, 1900],
    description: 'Más ancho que el canal de Panamá original. En esta terminal se limita a 300 m de eslora.',
  },
}

export type ArrivalPattern = 'random' | 'scheduled'

export interface SimParams {
  /** Llegadas promedio de buques por día. */
  shipsPerDay: number
  /** Al azar (proceso de Poisson) o programadas (itinerario regular con algo de atraso). */
  arrivals: ArrivalPattern
  /** Peso de cada clase en la mezcla de buques (0 a 100, no hace falta que sumen 100). */
  mix: Record<ShipClassKey, number>
  /** Muelles habilitados (1 a 3). */
  berths: number
  cranesPerBerth: number
  /** Productividad de cada grúa, en movimientos (contenedores) por hora. */
  movesPerCraneHour: number
  /** Horas por día que trabajan las grúas: 24 (tres turnos), 16 (dos) u 8 (uno). */
  craneHoursPerDay: 8 | 16 | 24
  /** Horas para atracar (práctico, remolcadores, amarre) y para desatracar. */
  berthingH: number
  unberthingH: number
  /** Altura de apilado en el patio (contenedores uno sobre otro). Define la capacidad. */
  yardTiers: number
  /** Horas promedio que un contenedor queda en el patio antes de que lo retire un camión. */
  dwellH: number
  /** Contenedores por hora que los camiones pueden sacar del patio como máximo. */
  truckMovesPerHour: number
  /** Ocupación del patio al empezar (0 a 1). */
  initialYard: number
  days: number
  seed: number
}

export interface Ship {
  id: string
  name: string
  shipClass: ShipClassKey
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
  /** Estadía media en el muelle (de atracar a zarpar), en horas, de los buques que zarparon. */
  avgBerthH: number
  /** Contenedores descargados en el período. */
  movesDone: number
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

/** Contenedores por altura de apilado: 12 bloques de 10 bahías x 6 filas. */
export const SLOTS_PER_TIER = 720
/** Horas simuladas antes del inicio para que la terminal no arranque vacía. */
const WARMUP_H = 24
const DT = 1 / 12

export const BASE_PARAMS: SimParams = {
  shipsPerDay: 2.5,
  arrivals: 'random',
  mix: { feeder: 25, panamax: 55, postpanamax: 20 },
  berths: 2,
  cranesPerBerth: 3,
  movesPerCraneHour: 25,
  craneHoursPerDay: 24,
  berthingH: 1.5,
  unberthingH: 1,
  yardTiers: 4,
  dwellH: 20,
  truckMovesPerHour: 100,
  initialYard: 0.5,
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

/** ¿Trabajan las grúas a esta hora del día? Dos turnos: 6 a 22 h. Un turno: 8 a 16 h. */
export function cranesOnShift(t: number, hoursPerDay: number): boolean {
  if (hoursPerDay >= 24) return true
  const h = ((t % 24) + 24) % 24
  return hoursPerDay >= 16 ? h >= 6 && h < 22 : h >= 8 && h < 16
}

function pickClass(u: number, mix: SimParams['mix']): ShipClassKey {
  const keys = Object.keys(SHIP_CLASSES) as ShipClassKey[]
  const total = keys.reduce((s, k) => s + Math.max(0, mix[k]), 0)
  if (total <= 0) return 'panamax'
  let acc = 0
  for (const k of keys) {
    acc += Math.max(0, mix[k]) / total
    if (u < acc) return k
  }
  return keys[keys.length - 1]
}

type Phase = 'waiting' | 'in' | 'working' | 'leaving' | 'gone'

export function simulate(p: SimParams): SimResult {
  // Dos generadores: uno para cuándo llegan y otro para cómo son los buques. Así, cambiar la mezcla
  // no cambia los horarios, y cambiar grúas o muelles no cambia ni los horarios ni los buques.
  const randArrivals = mulberry32(p.seed)
  const randShips = mulberry32(p.seed * 7919 + 1)
  const horizon = p.days * 24
  const capacity = SLOTS_PER_TIER * p.yardTiers

  const ships: Ship[] = []
  const arrivals: number[] = []
  const meanGap = 24 / p.shipsPerDay
  const addShip = (t: number) => {
    const cls = SHIP_CLASSES[pickClass(randShips(), p.mix)]
    const uLen = randShips()
    const uMoves = randShips()
    const i = ships.length
    ships.push({
      id: `B${String(i + 1).padStart(2, '0')}`,
      name: shipName(i),
      shipClass: cls.key,
      length: Math.round(cls.length[0] + uLen * (cls.length[1] - cls.length[0])),
      beam: cls.beam,
      moves: Math.round(cls.moves[0] + uMoves * (cls.moves[1] - cls.moves[0])),
    })
    arrivals.push(t)
  }
  if (p.arrivals === 'scheduled') {
    // Itinerario regular: un buque cada meanGap horas, con un atraso o adelanto de hasta 20 % del intervalo (máx. 3 h).
    const jitter = Math.min(3, meanGap * 0.2)
    for (let k = 0; ; k++) {
      const t = -WARMUP_H + meanGap * (k + 0.5) + (randArrivals() * 2 - 1) * jitter
      if (t >= horizon) break
      addShip(t)
    }
    const order = arrivals.map((t, i) => [t, i] as const).sort((a, b) => a[0] - b[0])
    const sortedShips = order.map(([, i]) => ships[i])
    const sortedTimes = order.map(([t]) => t)
    ships.splice(0, ships.length, ...sortedShips.map((s, i) => ({ ...s, id: `B${String(i + 1).padStart(2, '0')}`, name: shipName(i) })))
    arrivals.splice(0, arrivals.length, ...sortedTimes)
  } else {
    let next = -WARMUP_H + randArrivals() * meanGap
    while (next < horizon) {
      addShip(next)
      next += -Math.log(1 - randArrivals()) * meanGap
    }
  }

  const phase: Phase[] = ships.map(() => 'waiting')
  const remaining = ships.map((s) => s.moves)
  const until = ships.map(() => 0)
  const waitEnd: (number | undefined)[] = ships.map(() => undefined)
  const berthStart: (number | undefined)[] = ships.map(() => undefined)
  const departAt: (number | undefined)[] = ships.map(() => undefined)
  const berthShip: number[] = Array(p.berths).fill(-1)
  const queue: number[] = []
  const events: SimEvent[] = []
  const samples: Sample[] = []
  const rate = p.cranesPerBerth * p.movesPerCraneHour

  let yard = Math.round(capacity * p.initialYard)
  let arrived = 0
  let busyTime = 0
  let yardFullH = 0
  let yardSum = 0
  let maxQueue = 0
  let movesDone = 0
  const steps = Math.round(horizon / DT)

  // k < 0: precalentamiento. Se simula igual, pero no cuenta para las muestras ni los indicadores.
  for (let k = -Math.round(WARMUP_H / DT); k < steps; k++) {
    const now = k * DT
    const measuring = k >= 0
    const onShift = cranesOnShift(now, p.craneHoursPerDay)

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
      until[i] = now + p.berthingH
      waitEnd[i] = now
      berthStart[i] = now
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
        if (onShift) {
          const room = Math.max(0, capacity - yard - unloaded)
          const wanted = Math.min(rate * DT, remaining[i])
          if (room < wanted) blocked = true
          const m = Math.min(wanted, room)
          remaining[i] -= m
          unloaded += m
        }
        if (remaining[i] <= 1e-6) {
          phase[i] = 'leaving'
          until[i] = now + p.unberthingH
          events.push({ t: now, entity: ships[i].id, type: 'work-end', data: { berth: b } })
        }
      } else if (phase[i] === 'leaving' && now >= until[i]) {
        phase[i] = 'gone'
        berthShip[b] = -1
        departAt[i] = now
        events.push({ t: now, entity: ships[i].id, type: 'depart', data: { berth: b } })
      }
    }

    yard += unloaded
    yard -= Math.min(yard / p.dwellH, p.truckMovesPerHour) * DT
    if (!measuring) continue
    movesDone += unloaded
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
  let stayed = 0
  let staySum = 0
  for (let i = 0; i < arrived; i++) {
    const end = departAt[i]
    if (end !== undefined && end >= 0) {
      staySum += end - berthStart[i]!
      stayed++
    }
    if (arrivals[i] < 0) continue
    waitSum += (waitEnd[i] ?? horizon) - arrivals[i]
    counted++
  }

  return {
    params: p,
    ships,
    events,
    samples,
    yardCapacity: capacity,
    kpis: {
      avgWaitH: counted ? waitSum / counted : 0,
      maxQueue,
      berthOccupancy: busyTime / (p.berths * horizon),
      shipsServed: departAt.filter((t) => t !== undefined && t >= 0).length,
      avgBerthH: stayed ? staySum / stayed : 0,
      movesDone: Math.round(movesDone),
      avgYard: yardSum / steps / capacity,
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
