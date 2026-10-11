import { BASE_PARAMS, type SimParams } from './terminalSim'

/** Escenarios listos para clase. Cada uno cambia pocos parámetros respecto de la semana típica. */
export interface Preset {
  key: string
  label: string
  /** Qué cambia y qué pregunta abre, en una línea. */
  question: string
  params: Partial<SimParams>
}

export const PRESETS: Preset[] = [
  { key: 'base', label: 'Semana típica', question: 'El punto de partida: dos muelles, tres grúas por muelle y 2,5 buques por día.', params: {} },
  {
    key: 'alta',
    label: 'Temporada alta',
    question: 'Llegan más buques y más grandes. ¿Alcanzan dos muelles?',
    params: { shipsPerDay: 3.5, mix: { feeder: 15, panamax: 50, postpanamax: 35 } },
  },
  { key: 'obra', label: 'Muelle en obra', question: 'Un muelle cerrado por obras. ¿Cuánto crece la cola en el fondeadero?', params: { berths: 1 } },
  {
    key: 'paro',
    label: 'Paro de camiones',
    question: 'Los camiones sacan la mitad. ¿Un problema en tierra frena a los buques en el agua?',
    params: { truckMovesPerHour: 50 },
  },
  {
    key: 'gruas',
    label: 'Grúas nuevas',
    question: 'Cuatro grúas más rápidas por muelle. ¿Dónde aparece el nuevo cuello de botella?',
    params: { cranesPerBerth: 4, movesPerCraneHour: 32 },
  },
  {
    key: 'turno',
    label: 'Un solo turno',
    question: 'Las grúas trabajan solo de 8 a 16 h. ¿Cuánto más se quedan los buques?',
    params: { craneHoursPerDay: 8 },
  },
  {
    key: 'itinerario',
    label: 'Llegadas programadas',
    question: 'Mismos buques por día, pero con itinerario regular. ¿Cambia la espera aunque la cantidad sea igual?',
    params: { arrivals: 'scheduled' },
  },
]

export const presetParams = (p: Preset): SimParams => ({ ...BASE_PARAMS, ...p.params, mix: { ...BASE_PARAMS.mix, ...p.params.mix } })
