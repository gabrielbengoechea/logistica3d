/**
 * Formato de eventos común. Lo escribe el simulador y, más adelante, el replay de datos AIS,
 * así el motor 3D tiene un solo reproductor. El tiempo va en horas desde el inicio del escenario.
 */
export type EventType = 'arrive' | 'berth' | 'work-start' | 'work-end' | 'depart'

export interface SimEvent {
  t: number
  entity: string
  type: EventType
  data?: { berth?: number }
}
