import { BASE_PARAMS, type SimParams, type SimResult } from '../sim/terminalSim'

/**
 * Actividades de clase: el alumno predice, simula y compara. Cada actividad cambia un solo parámetro
 * respecto de la semana típica, y la respuesta correcta se calcula con el resultado de la simulación,
 * así sigue siendo correcta aunque cambie la semana (semilla) o se ajusten los valores por defecto.
 */
export interface Option {
  label: string
  /** ¿Esta opción describe lo que pasó? Recibe la medida de la actividad (por ejemplo, un cociente). */
  matches: (value: number) => boolean
}

export interface Activity {
  key: string
  title: string
  minutes: number
  /** Qué tiene que llevarse el alumno, en una línea. */
  goal: string
  context: string
  question: string
  change: Partial<SimParams>
  /** Lo que se mide para decidir qué opción fue la correcta. */
  measure: (base: SimResult, now: SimResult) => number
  /** Cómo se muestra la medida (por ejemplo "4,7 veces"). */
  describe: (value: number) => string
  options: Option[]
  /** Explicación con los números de esta corrida. */
  explain: (base: SimResult, now: SimResult) => string
  discuss: string[]
}

const h = (x: number) => `${x.toFixed(1).replace('.', ',')} h`
const pct = (x: number) => `${Math.round(x * 100)} %`
const times = (x: number) => `${x.toFixed(1).replace('.', ',')} veces`
const ratio = (a: number, b: number) => a / Math.max(b, 0.1)

export const ACTIVITIES: Activity[] = [
  {
    key: 'alta',
    title: 'Temporada alta',
    minutes: 15,
    goal: 'Las colas no crecen en proporción a la demanda: cerca del límite, un poco más de tráfico dispara la espera.',
    context: 'Normalmente llegan 2,5 buques por día y la terminal tiene dos muelles. En temporada alta llegan 3,5 por día: un 40 % más.',
    question: 'Con 40 % más buques, ¿cuánto crece la espera media en el fondeadero?',
    change: { shipsPerDay: 3.5 },
    measure: (b, n) => ratio(n.kpis.avgWaitH, b.kpis.avgWaitH),
    describe: (v) => `La espera se multiplicó por ${times(v).replace(' veces', '')}`,
    options: [
      { label: 'Crece más o menos como el tráfico: hasta 1,5 veces', matches: (v) => v < 1.5 },
      { label: 'Entre 1,5 y 3 veces', matches: (v) => v >= 1.5 && v < 3 },
      { label: 'Más de 3 veces', matches: (v) => v >= 3 },
    ],
    explain: (b, n) =>
      `Los muelles pasaron de estar ocupados el ${pct(b.kpis.berthOccupancy)} del tiempo al ${pct(n.kpis.berthOccupancy)}, y la espera media pasó de ${h(b.kpis.avgWaitH)} a ${h(n.kpis.avgWaitH)}. ` +
      'Cuando los muelles casi nunca están libres, cada buque extra tiene que esperar a que termine otro, y los atrasos se acumulan: la cola crece mucho más rápido que el tráfico.',
    discuss: [
      '¿Qué haría la terminal si esto pasa todos los años en la misma época?',
      '¿Conviene tener un tercer muelle que esté vacío la mayor parte del año?',
      'Probá con 3 buques por día: ¿dónde empieza a dispararse la espera?',
    ],
  },
  {
    key: 'paro',
    title: 'Paro de camiones',
    minutes: 15,
    goal: 'La cadena logística está acoplada: un problema en tierra termina demorando a los buques en el agua.',
    context: 'Los contenedores descargados quedan en el patio hasta que un camión los retira. Un paro parcial deja salir solo 50 contenedores por hora, la mitad de lo normal.',
    question: 'Si los camiones sacan la mitad, ¿qué pasa con la espera de los buques en el fondeadero?',
    change: { truckMovesPerHour: 50 },
    measure: (b, n) => ratio(n.kpis.avgWaitH, b.kpis.avgWaitH),
    describe: (v) => `La espera de los buques se multiplicó por ${times(v).replace(' veces', '')}`,
    options: [
      { label: 'No cambia: el paro es en tierra, no en el agua', matches: (v) => v < 1.25 },
      { label: 'Aumenta un poco', matches: (v) => v >= 1.25 && v < 2 },
      { label: 'Aumenta mucho: más del doble', matches: (v) => v >= 2 },
    ],
    explain: (b, n) =>
      `El patio estuvo tan lleno que las grúas tuvieron que frenar ${h(n.kpis.hoursYardFull)} (en condiciones normales, ${h(b.kpis.hoursYardFull)}). ` +
      `Con las grúas frenadas cada buque se queda más en el muelle (estadía media de ${h(b.kpis.avgBerthH)} a ${h(n.kpis.avgBerthH)}), y los que llegan esperan más afuera (de ${h(b.kpis.avgWaitH)} a ${h(n.kpis.avgWaitH)}).`,
    discuss: [
      '¿Qué otras cosas en tierra podrían frenar el puerto? (aduana, ferrocarril, horarios de los depósitos)',
      'Subí la altura de apilado a 5: ¿alcanza para aguantar el paro? ¿Qué costo tiene apilar más alto?',
      '¿Por qué a una naviera le importa cómo funcionan los camiones del puerto?',
    ],
  },
  {
    key: 'turno',
    title: 'Un solo turno',
    minutes: 15,
    goal: 'La capacidad depende de las horas de trabajo, no solo de las máquinas: las grúas paradas también son un cuello de botella.',
    context: 'Normalmente las grúas trabajan las 24 horas, en tres turnos. Supongamos que solo se trabaja de 8 a 16 h, un turno.',
    question: 'Con un solo turno, ¿cuánto más se queda cada buque amarrado al muelle?',
    change: { craneHoursPerDay: 8 },
    measure: (b, n) => ratio(n.kpis.avgBerthH, b.kpis.avgBerthH),
    describe: (v) => `La estadía en el muelle se multiplicó por ${times(v).replace(' veces', '')}`,
    options: [
      { label: 'Casi lo mismo: las grúas trabajan igual de rápido', matches: (v) => v < 1.3 },
      { label: 'Un poco más, hasta el doble', matches: (v) => v >= 1.3 && v < 2.2 },
      { label: 'Más del doble', matches: (v) => v >= 2.2 },
    ],
    explain: (b, n) =>
      `Las grúas trabajan 8 de cada 24 horas: el resto del día el buque espera amarrado. La estadía media pasó de ${h(b.kpis.avgBerthH)} a ${h(n.kpis.avgBerthH)}. ` +
      `Y como cada muelle queda ocupado más tiempo, los que llegan también esperan más en el fondeadero (de ${h(b.kpis.avgWaitH)} a ${h(n.kpis.avgWaitH)}).`,
    discuss: [
      '¿Por qué un puerto pagaría turnos de noche si las grúas son las mismas?',
      'Probá con dos turnos: ¿se recupera la mitad de lo perdido, más o menos?',
      '¿Qué le conviene a la naviera: un puerto barato con un turno o uno caro con tres?',
    ],
  },
  {
    key: 'itinerario',
    title: 'Llegadas con itinerario',
    minutes: 15,
    goal: 'La variabilidad genera colas: con la misma cantidad de buques, ordenar las llegadas reduce la espera.',
    context: 'Siguen llegando 2,5 buques por día, pero en vez de llegar cuando les toca a cada uno, siguen un itinerario regular con hasta 3 horas de atraso.',
    question: 'Con la misma cantidad de buques, pero llegando ordenados, ¿qué pasa con la espera media?',
    change: { arrivals: 'scheduled' },
    measure: (b, n) => ratio(n.kpis.avgWaitH, b.kpis.avgWaitH),
    describe: (v) => (v < 1 ? `La espera bajó un ${Math.round((1 - v) * 100)} %` : `La espera se multiplicó por ${times(v).replace(' veces', '')}`),
    options: [
      { label: 'Baja', matches: (v) => v < 0.8 },
      { label: 'Queda igual: llegan los mismos buques', matches: (v) => v >= 0.8 && v <= 1.2 },
      { label: 'Sube', matches: (v) => v > 1.2 },
    ],
    explain: (b, n) =>
      `La espera media pasó de ${h(b.kpis.avgWaitH)} a ${h(n.kpis.avgWaitH)} y el máximo de buques esperando a la vez, de ${b.kpis.maxQueue} a ${n.kpis.maxQueue}. ` +
      'Al azar, a veces llegan varios buques juntos y se forma cola aunque después el muelle quede vacío. Con itinerario los buques se reparten en el tiempo y casi siempre encuentran un muelle libre.',
    discuss: [
      '¿Por qué las navieras publican itinerarios con días y horas fijos?',
      '¿Qué pasa con el itinerario si un temporal atrasa a todos los buques un día?',
      'Probá itinerario con 3,5 buques por día: ¿el orden alcanza cuando hay mucho tráfico?',
    ],
  },
]

/** Días que dura cada actividad: con una semana sola el azar pesa demasiado y la comparación se vuelve ruidosa. */
export const ACTIVITY_DAYS = 14

/** Escenario de referencia de las actividades: la terminal típica, con la semana (semilla) elegida. */
export function activityBase(seed: number): SimParams {
  return { ...BASE_PARAMS, seed, days: ACTIVITY_DAYS }
}

export function activityParams(a: Activity, seed: number): SimParams {
  return { ...activityBase(seed), ...a.change }
}

/** La opción que describe lo que pasó en esta corrida. */
export function correctOption(a: Activity, value: number): number {
  return a.options.findIndex((o) => o.matches(value))
}
