import { MOUTH, TERMINAL, anchorageSlot, berthX, toWorld } from '../scene/layout'

/** Encuadre de cámara: posición y punto mirado, en el marco del mapa. */
export type Shot = [number, number, number, number, number, number]

export interface TourStep {
  title: string
  text: string
  shot: Shot
}

export interface Tour {
  key: string
  title: string
  steps: TourStep[]
}

/** Encuadre dado en el marco de la terminal (x a lo largo del muelle, z hacia tierra). */
function inTerminal(px: number, py: number, pz: number, tx: number, ty: number, tz: number): Shot {
  const [a, b] = toWorld(px, pz)
  const [c, d] = toWorld(tx, tz)
  return [a, py, b, c, ty, d]
}

const slots = Array.from({ length: 12 }, (_, i) => anchorageSlot(i))
const ANCHORAGE: [number, number] = [slots.reduce((s, p) => s + p[0], 0) / 12, slots.reduce((s, p) => s + p[1], 0) / 12]

export const TOURS: Tour[] = [
  {
    key: 'rio',
    title: 'Del río al muelle',
    steps: [
      {
        title: 'El Río de la Plata',
        text: 'Montevideo está sobre un río muy ancho pero poco profundo: en buena parte no llega a 10 m. Los buques grandes no pueden ir por cualquier lado.',
        shot: [2200, 4600, 13500, -1300, 0, 3800],
      },
      {
        title: 'El canal de acceso',
        text: 'Por eso se draga un canal: una zanja submarina, señalizada con boyas, por donde entran y salen los buques. Mantenerlo hondo es un trabajo permanente.',
        shot: [900, 1100, 8200, -1150, 0, 4300],
      },
      {
        title: 'El fondeadero',
        text: 'Si no hay muelle libre, el buque fondea acá y espera. Cada hora de espera le cuesta a la naviera: esta es la cola que mide el simulador.',
        shot: [ANCHORAGE[0] + 1300, 900, ANCHORAGE[1] + 1900, ANCHORAGE[0], 0, ANCHORAGE[1]],
      },
      {
        title: 'La boca entre las escolleras',
        text: 'Las escolleras protegen el puerto de las olas. Para pasar la boca y girar adentro, el práctico sube a bordo y los remolcadores ayudan: atracar lleva más de una hora.',
        shot: [MOUTH[0] + 1300, 650, MOUTH[1] + 1500, MOUTH[0], 0, MOUTH[1] - 300],
      },
      {
        title: 'La terminal de contenedores',
        text: 'Un frente de unos 630 m, con lugar para dos buques grandes. La ubicación y el frente son reales; las máquinas y la operación que se ven son simuladas.',
        shot: inTerminal(300, 300, -700, 0, 0, 80),
      },
      {
        title: 'El puerto y la ciudad',
        text: 'Detrás de la terminal empieza la Ciudad Vieja. Todo lo que se descarga sale por calles y rutas de la ciudad: el puerto y la ciudad se afectan mutuamente.',
        shot: [TERMINAL.x - 900, 900, TERMINAL.z + 1500, TERMINAL.x + 900, 0, TERMINAL.z - 200],
      },
    ],
  },
  {
    key: 'terminal',
    title: 'La terminal por dentro',
    steps: [
      {
        title: 'El muelle',
        text: 'Los buques amarran de costado al muelle. Mientras están amarrados ocupan un sitio de atraque: si los dos están ocupados, el siguiente espera afuera.',
        shot: inTerminal(60, 200, -560, 0, 15, 20),
      },
      {
        title: 'Grúas pórtico (STS)',
        text: 'Cada grúa saca un contenedor por vez del buque y lo baja al muelle: entre 20 y 30 por hora. Varias grúas trabajan sobre el mismo buque a la vez.',
        shot: inTerminal(berthX(0) + 230, 95, -250, berthX(0), 30, 0),
      },
      {
        title: 'Tractores de terminal',
        text: 'Bajo la grúa, un tractor recibe el contenedor y lo lleva al patio. Si no hay tractor o el patio está lleno, la grúa tiene que esperar.',
        shot: inTerminal(berthX(0) + 70, 130, 290, berthX(0), 0, 55),
      },
      {
        title: 'El patio y las RTG',
        text: 'Los contenedores se apilan en bloques mientras esperan su trámite. Las grúas de patio (RTG) los acomodan y los cargan en los camiones. Apilar más alto da lugar, pero hace más lento sacar el de abajo.',
        shot: inTerminal(360, 95, 100, 80, 5, 190),
      },
      {
        title: 'La portería',
        text: 'Por acá salen los camiones con los contenedores hacia los depósitos y clientes. Si salen menos de los que entran por el muelle, el patio se llena y todo se frena.',
        shot: inTerminal(120, 55, 250, 0, 6, 345),
      },
      {
        title: 'Todo junto',
        text: 'Buque, grúa, tractor, patio y camión forman una cadena: la más lenta marca el ritmo de todas. Con el simulador se puede probar dónde está el cuello de botella.',
        shot: inTerminal(420, 380, 780, 0, 0, 60),
      },
    ],
  },
]

/** Segundos que se muestra cada paso si el recorrido avanza solo. */
export const TOUR_STEP_SECONDS = 9
