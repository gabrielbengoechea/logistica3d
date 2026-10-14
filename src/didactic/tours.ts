import { BERTHS, MOUTH, TERMINAL, anchorageSlot, toWorld } from '../scene/layout'

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
        text: 'La Terminal Cuenca del Plata (TCP) ocupa la punta del puerto: unas 60 ha y un muelle de 638 m. La forma del puerto y de la terminal son reales; las máquinas y la operación que se ven son simuladas.',
        shot: inTerminal(300, 300, -700, 0, 0, 80),
      },
      {
        title: 'El resto del puerto',
        text: 'Detrás del dique de cintura están las dársenas I y II con los muelles A, B y C, la terminal de pasajeros, la de celulosa de UPM y la de graneles (TGM). En total, más de 4.500 m de muelles.',
        shot: [-400, 1500, -1900, 600, 0, -300],
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
        title: 'El Muelle de Escala',
        text: 'TCP atiende los buques en el Muelle de Escala: 638 m con dos puestos, uno de 350 m a 14 m de profundidad y otro de 288 m a 10,5 m. Si los dos están ocupados, el siguiente espera afuera.',
        shot: inTerminal(60, 220, -600, 0, 15, 20),
      },
      {
        title: 'Grúas pórtico (STS)',
        text: 'Seis grúas de muelle: cuatro Super Post-Panamax que alcanzan 22 filas de contenedores y dos Post-Panamax de 19 filas. Cada una saca un contenedor por vez, entre 20 y 30 por hora.',
        shot: inTerminal(BERTHS[0].x + 230, 95, -250, BERTHS[0].x, 30, 0),
      },
      {
        title: 'Straddle carriers',
        text: 'Bajo la grúa, un straddle carrier pasa a caballo sobre el contenedor, lo levanta entre sus patas y lo lleva al patio. Si no hay uno libre o el patio está lleno, la grúa tiene que esperar.',
        shot: inTerminal(BERTHS[0].x + 90, 90, 230, BERTHS[0].x, 0, 90),
      },
      {
        title: 'El patio',
        text: 'Los contenedores esperan su trámite en filas de un contenedor de ancho, separadas para que pasen las patas de las máquinas. TCP tiene 37 ha operativas y unas 3.000 tomas para contenedores refrigerados.',
        shot: inTerminal(380, 110, 200, 0, 5, 380),
      },
      {
        title: 'Camiones y portería',
        text: 'Los camiones entran por el Acceso Washington, reciben el contenedor al sur del patio y salen hacia depósitos y clientes. Si salen menos de los que entran por el muelle, el patio se llena y todo se frena.',
        shot: inTerminal(330, 70, 560, 150, 4, 670),
      },
      {
        title: 'La ampliación',
        text: 'Sobre la cara oeste se construye un muelle nuevo de 730 m con dos puestos, para buques de hasta 16 m de calado, y 24 ha más de patio. En el simulador es el tercer muelle.',
        shot: inTerminal(-820, 260, 120, -430, 0, 400),
      },
      {
        title: 'Todo junto',
        text: 'Buque, grúa, straddle carrier, patio y camión forman una cadena: la más lenta marca el ritmo de todas. Con el simulador se puede probar dónde está el cuello de botella.',
        shot: inTerminal(520, 520, 1150, -60, 0, 280),
      },
    ],
  },
]

/** Segundos que se muestra cada paso si el recorrido avanza solo. */
export const TOUR_STEP_SECONDS = 9
