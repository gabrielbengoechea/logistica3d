/**
 * Formato de eventos común. Lo escriben el simulador y el servicio AIS, así el motor 3D tiene un solo
 * reproductor. El tiempo va en horas desde el inicio del escenario (o del día, en el replay AIS).
 * - Simulador: eventos de estado (llega, atraca, empieza y termina de operar, zarpa).
 * - AIS: eventos de posición, con la posición en metros del mapa.
 */
export type EventType = 'arrive' | 'berth' | 'work-start' | 'work-end' | 'depart' | 'position'

export interface SimEvent {
  t: number
  entity: string
  type: EventType
  /** Posición en metros del mapa [x, z] (solo en eventos de posición). */
  pos?: [number, number]
  data?: {
    berth?: number
    /** Velocidad sobre el fondo, en nudos. */
    sog?: number | null
    /** Rumbo sobre el fondo, grados desde el norte. */
    cog?: number | null
    /** Proa, grados desde el norte. */
    heading?: number | null
    /** Estado de navegación AIS (0 navegando, 1 fondeado, 5 amarrado...). */
    status?: number | null
  }
}
