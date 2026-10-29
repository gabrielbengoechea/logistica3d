// Tipos del menú: control del tiempo de la simulación, escenas guiadas, lugares y opciones propias de cada app.
import type * as THREE from 'three'

/** Un punto al que se puede llevar al jugador. Si `alto` es true, se crea una plataforma de observación. */
export interface Lugar {
  titulo: string
  resumen?: string
  /** Pies del jugador (m, en el mundo). */
  pos: THREE.Vector3
  /** Hacia dónde mira (radianes; 0 = -Z). */
  yaw: number
  alto?: boolean
  /** Lo que hace la app al llegar (mostrar algo que estaba oculto, por ejemplo). */
  al?: () => void
}

/** Control del tiempo simulado. Lo implementa cada app sobre su propio reloj. */
export interface Tiempo {
  /** Texto grande del reloj, por ejemplo «Mar 14:35». */
  reloj(): string
  /** Línea secundaria, por ejemplo «Día 2 de 7 · 1 h por segundo». */
  detalle?(): string
  pausado(): boolean
  alternarPausa(): void
  velocidades: { etiqueta: string; valor: number }[]
  velocidad(): number
  fijarVelocidad(v: number): void
  saltos: { etiqueta: string; horas: number }[]
  saltar(horas: number): void
}

export interface ContextoEscena {
  /** Lleva al jugador a un lugar (con plataforma si es alto). */
  irA(lugar: Lugar): void
  tiempo?: Tiempo
}

export interface Paso {
  titulo?: string
  texto: string
  /** Lo que pasa al llegar a este paso (mover el tiempo, seleccionar algo, cambiar de lugar…). */
  al?: (ctx: ContextoEscena) => void
  lugar?: Lugar
}

export interface EscenaGuiada {
  id: string
  titulo: string
  resumen: string
  /** Deja la simulación lista para que el evento ocurra frente al jugador. Devuelve el lugar desde donde mirarlo. */
  preparar(ctx: ContextoEscena): Lugar
  pasos: Paso[]
}

export interface OpcionApp {
  id: string
  /** Texto del botón según el estado actual. */
  texto(): string
  activa?(): boolean
  accion(): void
}

export interface ConfigMenu {
  tiempo?: Tiempo
  escenas?: EscenaGuiada[]
  lugares?: Lugar[]
  opciones?: OpcionApp[]
}
