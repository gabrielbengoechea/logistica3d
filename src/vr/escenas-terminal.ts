// Menú del visor para la terminal: control del reloj de la simulación, escenas guiadas (atraque, descarga,
// desatraque, llegada por el canal, patio y comparación de tamaños), lugares a los que ir y opciones.
// Cada escena busca en la simulación un buque que vaya a hacer lo que se quiere mostrar, adelanta el reloj
// hasta unos minutos antes y lleva al estudiante a un mirador desde donde se ve bien.
import * as THREE from 'three'
import { BERTHS, LAND_Y, MOUTH, TERMINAL, berthToTerminal, craneLocalX, toWorld, YARD } from '../scene/layout'
import { SCALE_AT } from '../scene/ScaleComparison'
import { shipPose } from '../scene/pose'
import { cranesOnShift } from '../sim/terminalSim'
import { phaseAt, PHASE_LABEL, type Track } from '../sim/tracks'
import { useStore } from '../store'
import { clock } from '../ui/format'
import type { ConfigMenu, EscenaGuiada, Lugar, Tiempo } from './escenas'

const st = () => useStore.getState()
const horizonte = () => st().params.days * 24

// ---------- Geometría: puntos del muelle, del patio y del mar ----------

/** Punto (lx, lz) de un puesto de atraque, en el mundo, a la altura y dada. */
function enPuesto(b: number, lx: number, y: number, lz: number): THREE.Vector3 {
  const [tx, tz] = berthToTerminal(b, lx, lz)
  const [x, z] = toWorld(tx, tz)
  return new THREE.Vector3(x, y, z)
}

function enTerminal(tx: number, y: number, tz: number): THREE.Vector3 {
  const [x, z] = toWorld(tx, tz)
  return new THREE.Vector3(x, y, z)
}

/** Yaw (0 = -Z) para mirar desde `de` hacia `a`. */
function yawHacia(de: THREE.Vector3, a: THREE.Vector3): number {
  return Math.atan2(-(a.x - de.x), -(a.z - de.z))
}

/** Mirando al agua desde el puesto b (eje -z del puesto). */
const yawAlAgua = (b: number) => TERMINAL.yaw + BERTHS[b].a

function mirador(titulo: string, pos: THREE.Vector3, mira: THREE.Vector3 | number, resumen?: string, alto = true): Lugar {
  return { titulo, resumen, pos, yaw: typeof mira === 'number' ? mira : yawHacia(pos, mira), alto }
}

// ---------- Buscar el buque que conviene mostrar ----------

/** Primer buque (en puestos del Muelle de Escala) cuyo instante `cuando` cae después de t; si no hay, el primero. */
function proximo(cuando: (tr: Track) => number | undefined): Track | null {
  const { tracks, t } = st()
  const conDato = tracks.filter((tr) => cuando(tr) !== undefined && (tr.berth ?? 0) < 2).sort((a, b) => cuando(a)! - cuando(b)!)
  return conDato.find((tr) => cuando(tr)! > t + 0.05) ?? conDato[0] ?? null
}

const inicioTrabajo = (tr: Track) => tr.workStart ?? (tr.berthAt !== undefined ? tr.berthAt + st().params.berthingH : undefined)

/** Instante del intervalo [t0, t1] en que el buque pasa más cerca de un punto del mapa. */
function momentoMasCerca(tr: Track, punto: [number, number], t0: number, t1: number): number {
  const { params } = st()
  let mejor = t0
  let dist = Infinity
  for (let i = 0; i <= 240; i++) {
    const t = t0 + ((t1 - t0) * i) / 240
    const p = shipPose(tr, t, params)
    const d = Math.hypot(p.x - punto[0], p.z - punto[1])
    if (d < dist) (dist = d), (mejor = t)
  }
  return mejor
}

let elegido: Track | null = null

/** Pone el reloj en t (dentro del escenario), a la velocidad dada y en marcha; selecciona el buque elegido. */
function irAlMomento(t: number, velocidad: number) {
  const s = st()
  s.setT(THREE.MathUtils.clamp(t, 0, horizonte() - 0.01))
  s.setSpeed(velocidad)
  if (!s.playing) s.togglePlay()
  if (elegido) s.select({ kind: 'ship', id: elegido.ship.id })
}

const UN_MIN_POR_S = 1 / 60
const TIEMPO_REAL = 1 / 3600

// Miradores del atraque, fijos al puesto del buque elegido (se calculan al preparar la escena).
function miradorAtraque(tr: Track): Lugar {
  const b = tr.berth ?? 0
  const L = tr.ship.length
  // A popa del buque, sobre el borde del muelle y 22 m arriba: se ve el costado, los remolcadores y las amarras.
  const pos = enPuesto(b, -(L / 2 + 45), LAND_Y + 22, 8)
  return mirador('Mirador del atraque', pos, enPuesto(b, 0, 6, -(tr.ship.beam / 2 + 30)))
}

function datosBuque(tr: Track) {
  const { params } = st()
  const ritmo = params.cranesPerBerth * params.movesPerCraneHour
  return { L: Math.round(tr.ship.length), B: Math.round(tr.ship.beam), moves: tr.ship.moves, ritmo, horas: tr.ship.moves / ritmo, nombre: tr.ship.name, id: tr.ship.id }
}

const num = (x: number, d = 1) => x.toFixed(d).replace('.', ',')

// ---------- Escenas ----------

/** Si el escenario no tiene un buque para mostrar (por ejemplo, sin llegadas), se queda en la explanada. */
function sinBuque(): Lugar {
  const [x, z] = toWorld(40, 120)
  return mirador('Explanada', new THREE.Vector3(x, LAND_Y + 1, z), TERMINAL.yaw, undefined, false)
}

const atraque: EscenaGuiada = {
  id: 'atraque',
  titulo: 'Atraque de un buque',
  resumen: 'Remolcadores, maniobra de costado y amarras',
  preparar() {
    elegido = proximo((tr) => tr.berthAt)
    if (!elegido) return sinBuque()
    const tr = elegido
    const ws = inicioTrabajo(tr)!
    // Al 62 % del atraque el buque ya giró frente al muelle y los remolcadores empiezan a empujarlo.
    irAlMomento(tr.berthAt! + (ws - tr.berthAt!) * 0.62, UN_MIN_POR_S)
    return miradorAtraque(tr)
  },
  pasos: [
    {
      titulo: 'Llega el buque',
      get texto() {
        const d = elegido ? datosBuque(elegido) : null
        return `Frente a vos está ${d ? `el ${d.nombre}, de ${d.L} m de eslora y ${d.B} m de manga` : 'el buque'}. Ya pasó la boca del puerto y giró frente al muelle. El reloj corre a 1 minuto por segundo: mirá cómo se acerca de costado.`
      },
    },
    {
      titulo: 'Los remolcadores',
      texto: 'Un buque tan largo no puede arrimarse solo: dos remolcadores, uno a proa y otro a popa, lo empujan de costado hasta el muelle. El práctico, a bordo, coordina la maniobra con ellos por radio.',
    },
    {
      titulo: 'Las amarras',
      texto: 'Cuando el casco toca las defensas se pasan las amarras: largos de proa y de popa, que impiden que se aleje, y springs, que evitan que se desplace hacia adelante o hacia atrás. Fijate en las líneas entre la cubierta y las bitas del muelle.',
      al() {
        const tr = elegido
        if (!tr) return
        const ws = inicioTrabajo(tr)!
        irAlMomento(tr.berthAt! + (ws - tr.berthAt!) * 0.9, UN_MIN_POR_S)
      },
    },
    {
      titulo: 'Listo para operar',
      texto: 'Con el buque amarrado empieza la operación: las grúas pórtico se ubican sobre las bahías y comienza la descarga. Lo que pasa a partir de acá lo ves en la escena «Descarga con grúas».',
      al() {
        const tr = elegido
        if (tr) irAlMomento(inicioTrabajo(tr)! - 0.02, UN_MIN_POR_S)
      },
    },
  ],
}

/** Momento de la operación con las grúas trabajando (dentro del turno). */
function momentoDescarga(tr: Track): number {
  const { params } = st()
  const ws = inicioTrabajo(tr)!
  const we = tr.workEnd ?? ws + datosBuque(tr).horas
  for (let t = ws + (we - ws) * 0.15; t < we; t += 0.25) if (cranesOnShift(t, params.craneHoursPerDay)) return t
  return ws + 0.1
}

function miradorGrua(b: number): Lugar {
  const n = st().params.cranesPerBerth
  // Entre las dos primeras grúas, a la altura de la cabina, asomado sobre el borde del muelle.
  const x = n > 1 ? (craneLocalX(0, n) + craneLocalX(1, n)) / 2 : craneLocalX(0, n) + 30
  const pos = enPuesto(b, x, LAND_Y + 36, -2)
  return mirador('Junto a las grúas', pos, yawAlAgua(b))
}

const descarga: EscenaGuiada = {
  id: 'descarga',
  titulo: 'Descarga con grúas',
  resumen: 'Grúas pórtico, ciclo y productividad',
  preparar() {
    const { tracks, t, params } = st()
    // Si hay un buque operando ahora se muestra ese; si no, el próximo que va a operar.
    elegido = tracks.find((tr) => (tr.berth ?? 0) < 2 && phaseAt(tr, t, params).phase === 'working') ?? proximo(inicioTrabajo)
    if (!elegido) return sinBuque()
    const tr = elegido
    irAlMomento(momentoDescarga(tr), UN_MIN_POR_S)
    return miradorGrua(tr.berth ?? 0)
  },
  pasos: [
    {
      titulo: 'La grúa pórtico',
      texto: 'Estás a la altura de la cabina, entre dos grúas de muelle (STS, ship-to-shore). Cada una corre sobre rieles a lo largo del muelle y su pluma se extiende sobre el buque para alcanzar todas las filas de contenedores.',
    },
    {
      titulo: 'El ciclo de un movimiento',
      texto: 'El carro (trolley) corre por la pluma hasta la bahía, baja el spreader, engancha el contenedor por las cuatro esquinas, lo sube y lo trae hasta el muelle, donde lo deja. Luego vuelve vacío o con un contenedor de exportación. Cada ida y vuelta es un movimiento.',
    },
    {
      titulo: 'Productividad',
      get texto() {
        const d = elegido ? datosBuque(elegido) : null
        if (!d) return 'La productividad se mide en movimientos por hora.'
        const { params } = st()
        return `En esta simulación cada grúa hace ${params.movesPerCraneHour} movimientos por hora y hay ${params.cranesPerBerth} por puesto: ${d.ritmo} movimientos por hora. Este buque tiene ${d.moves} movimientos, así que necesita unas ${num(d.horas)} horas de grúa. Mirá cómo baja la pila de contenedores sobre la cubierta.`
      },
    },
    {
      titulo: 'Del muelle al patio',
      texto: 'Bajo la grúa, los straddle carriers toman el contenedor pasando a caballo sobre él y lo llevan a una fila del patio. Así la grúa no espera: siempre hay una máquina lista para el próximo. Estás ahora a nivel del muelle, cerca de las patas de la grúa.',
      al(ctx) {
        const tr = elegido
        if (!tr) return
        const b = tr.berth ?? 0
        const n = st().params.cranesPerBerth
        const pos = enPuesto(b, craneLocalX(0, n) + 22, LAND_Y + 0.2, 52)
        ctx.irA(mirador('Muelle, detrás de la grúa', pos, enPuesto(b, craneLocalX(0, n), LAND_Y + 5, 20), undefined, false))
      },
    },
    {
      titulo: 'Turnos',
      get texto() {
        const h = st().params.craneHoursPerDay
        return `Las grúas trabajan ${h >= 24 ? 'las 24 horas' : `${h} horas por día`}. Usá el menú (gatillo izquierdo) para adelantar el reloj y ver cómo cambia el puerto fuera de turno, o volvé a mirar desde arriba con «Anterior».`
      },
    },
  ],
}

const desatraque: EscenaGuiada = {
  id: 'desatraque',
  titulo: 'Desatraque y salida',
  resumen: 'Fin de la operación y salida por el canal',
  preparar() {
    elegido = proximo((tr) => tr.workEnd)
    if (!elegido) return sinBuque()
    const tr = elegido
    irAlMomento(tr.workEnd! - 0.03, UN_MIN_POR_S)
    return miradorAtraque(tr)
  },
  pasos: [
    {
      titulo: 'Termina la operación',
      texto: 'Las grúas hicieron el último movimiento y levantan la pluma. La tripulación prepara la salida y el práctico vuelve a subir a bordo.',
    },
    {
      titulo: 'Se sueltan las amarras',
      texto: 'Primero se largan los springs y luego los largos de proa y de popa. Los remolcadores toman el buque y lo separan del muelle, otra vez de costado.',
      al() {
        const tr = elegido
        if (tr) irAlMomento(tr.workEnd! + 0.08, UN_MIN_POR_S)
      },
    },
    {
      titulo: 'Rumbo a la boca del puerto',
      texto: 'Libre del muelle, el buque gira y navega con su propia máquina hacia la boca entre las escolleras. Te llevamos a un mirador junto al canal para verlo pasar.',
      al(ctx) {
        const tr = elegido
        if (!tr) return
        const dep = tr.depart ?? tr.workEnd! + st().params.unberthingH
        const t = momentoMasCerca(tr, MOUTH, dep, dep + 2)
        irAlMomento(t - 3 / 60, UN_MIN_POR_S)
        ctx.irA(LUGARES.boca)
      },
    },
    {
      titulo: 'Hacia el Río de la Plata',
      texto: 'Por el canal de acceso, dragado y balizado, el buque sale al Río de la Plata. La estela detrás del casco muestra que va con su propia propulsión.',
    },
  ],
}

const llegada: EscenaGuiada = {
  id: 'llegada',
  titulo: 'Entrada al puerto',
  resumen: 'Fondeadero, boca entre escolleras y giro',
  preparar() {
    elegido = proximo((tr) => tr.berthAt)
    if (!elegido) return sinBuque()
    const tr = elegido
    const ws = inicioTrabajo(tr)!
    const t = momentoMasCerca(tr, MOUTH, tr.berthAt!, ws)
    irAlMomento(t - 4 / 60, UN_MIN_POR_S)
    return LUGARES.boca
  },
  pasos: [
    {
      titulo: 'Desde el fondeadero',
      texto: 'Los buques que llegan y no tienen muelle libre esperan anclados en el fondeadero, mar afuera. Cuando se libera un puesto, el práctico sube a bordo y el buque entra.',
    },
    {
      titulo: 'La boca del puerto',
      texto: 'Estás junto a la boca entre las escolleras, la entrada protegida del antepuerto. El buque reduce la velocidad: dentro del puerto el espacio para maniobrar es poco.',
    },
    {
      titulo: 'El giro frente al muelle',
      texto: 'Ya dentro, el buque gira frente al Muelle de Escala para quedar paralelo a él. Desde ahí los remolcadores lo empujan de costado: eso lo ves en la escena «Atraque de un buque».',
      al() {
        const tr = elegido
        if (!tr) return
        const ws = inicioTrabajo(tr)!
        irAlMomento(tr.berthAt! + (ws - tr.berthAt!) * 0.55, UN_MIN_POR_S)
      },
    },
  ],
}

function miradorPatio(): Lugar {
  // Sobre la calle entre la primera y la segunda fila de bloques, a 28 m: se ven las filas, las calles y las máquinas.
  const z = (YARD.blocksZ[0] + YARD.blocksZ[1]) / 2
  const x = YARD.blocksX[2] + 31
  return mirador('Mirador del patio', enTerminal(x, LAND_Y + 28, z), enTerminal(x - 80, LAND_Y, YARD.blocksZ[0] - 40))
}

const patio: EscenaGuiada = {
  id: 'patio',
  titulo: 'El patio de contenedores',
  resumen: 'Bloques, filas y straddle carriers',
  preparar() {
    elegido = null
    const s = st()
    // De día y con las grúas en turno, para que el patio tenga movimiento.
    const dia = Math.floor(s.t / 24)
    let t = dia * 24 + 10
    if (t < s.t) t += 24
    if (t >= horizonte()) t = 10
    irAlMomento(t, TIEMPO_REAL * 20)
    return miradorPatio()
  },
  pasos: [
    {
      titulo: 'Bloques y filas',
      texto: `Debajo tenés el patio: ${YARD.blocksX.length * YARD.blocksZ.length} bloques de ${YARD.rows} filas, cada fila de un contenedor de ancho y ${YARD.bays} de largo. Entre fila y fila queda el espacio justo para las patas de la máquina.`,
    },
    {
      titulo: 'Straddle carriers',
      texto: 'Los straddle carriers pasan a caballo sobre la fila, levantan el contenedor desde arriba y lo apilan. Con la misma máquina se va del muelle al patio y del patio a los camiones: no hacen falta grúas de patio.',
    },
    {
      titulo: 'Calles y circulación',
      texto: 'Las máquinas circulan por las calles entre bloques siguiendo un sentido. Una buena circulación evita esperas bajo la grúa, que es la que marca el ritmo de toda la terminal.',
    },
    {
      titulo: 'Recorrelo a pie',
      texto: 'Podés bajar con el teletransporte (stick derecho hacia adelante) y caminar entre las filas: los contenedores y las máquinas tienen colisión, así que no se atraviesan.',
    },
  ],
}

function lugaresEscala(): { costado: Lugar; frente: Lugar } {
  const [sx, sz] = SCALE_AT
  const costado = new THREE.Vector3(sx - 470, 26, sz - 270)
  const frente = new THREE.Vector3(sx - 110, 32, sz + 70)
  return {
    costado: mirador('Comparador: popas alineadas', costado, new THREE.Vector3(sx, 10, sz - 270)),
    frente: { ...mirador('Comparador: de frente', frente, new THREE.Vector3(sx - 110, 10, sz - 300)), al: () => st().setShowScale(true) },
  }
}

const tamanos: EscenaGuiada = {
  id: 'tamanos',
  titulo: 'Comparar tamaños',
  resumen: 'Buques junto a una cancha y edificios conocidos',
  preparar() {
    elegido = null
    st().setShowScale(true)
    return lugaresEscala().costado
  },
  pasos: [
    {
      titulo: 'Popas alineadas',
      texto: 'Los tres buques tienen la popa en la misma línea, así se comparan los largos de un vistazo: un feeder de 170 m, un Post-Panamax de 300 m y uno de los más grandes del mundo, de 400 m. Las reglas en el agua marcan cada 50 m.',
    },
    {
      titulo: 'Frente a la plataforma',
      texto: 'Sobre la plataforma hay objetos a la misma escala: una cancha de fútbol, una manzana de la ciudad, contenedores, el Palacio Salvo, la torre de Antel y un buque puesto de pie. Uno de 400 m es más alto que cualquier edificio de Montevideo.',
      al(ctx) {
        ctx.irA(lugaresEscala().frente)
      },
    },
    {
      titulo: 'Por qué importa',
      texto: 'El tamaño del buque decide qué puertos puede usar: hace falta largo de muelle, profundidad en el canal y en el puesto, y grúas con pluma suficiente para alcanzar todas las filas. Podés ocultar el comparador desde Opciones del menú.',
    },
  ],
}

// ---------- Lugares ----------

const LUGARES = {
  get boca(): Lugar {
    // Sobre el agua, al este de la boca y a 14 m: el canal de entrada queda al sur y el antepuerto al norte.
    const pos = new THREE.Vector3(MOUTH[0] + 170, 14, MOUTH[1] + 40)
    return mirador('Boca del puerto', pos, new THREE.Vector3(MOUTH[0] - 300, 0, MOUTH[1] + 1400), 'Junto al canal, para ver entrar y salir los buques')
  },
}

function listaLugares(): Lugar[] {
  const [x, z] = toWorld(40, 120)
  const n = st().params.cranesPerBerth
  return [
    mirador('Explanada (inicio)', new THREE.Vector3(x, LAND_Y + 1, z), TERMINAL.yaw, 'Detrás de las grúas, mirando al agua', false),
    mirador('Borde del Muelle 1', enPuesto(0, craneLocalX(0, n) - 40, LAND_Y + 0.2, 4), yawAlAgua(0), 'Al filo del muelle, frente al buque', false),
    { ...miradorGrua(1), titulo: 'Altura de cabina (Muelle 2)', resumen: 'Entre dos grúas, a 36 m' },
    { ...miradorPatio(), resumen: 'Sobre las calles del patio, a 28 m' },
    mirador('Zona de camiones', enTerminal(-60, LAND_Y + 0.2, 690), TERMINAL.yaw, 'Donde los straddle carriers cargan los camiones', false),
    LUGARES.boca,
    { ...lugaresEscala().frente, resumen: 'Buques y edificios a escala (se muestra el comparador)' },
  ]
}

// ---------- Tiempo ----------

export const tiempoTerminal: Tiempo = {
  reloj: () => clock(st().t),
  detalle() {
    const { tracks, t, params } = st()
    let muelle = 0
    let espera = 0
    let navegando = 0
    for (const tr of tracks) {
      const f = phaseAt(tr, t, params).phase
      if (f === 'working' || f === 'berthing' || f === 'unberthing') muelle++
      else if (f === 'anchored') espera++
      else if (f === 'approaching' || f === 'leaving') navegando++
    }
    const turno = cranesOnShift(t, params.craneHoursPerDay) ? 'grúas en turno' : 'grúas fuera de turno'
    return `En muelle ${muelle} · fondeados ${espera} · navegando ${navegando} · ${turno}`
  },
  pausado: () => !st().playing,
  alternarPausa: () => st().togglePlay(),
  velocidades: [
    { etiqueta: 'Real', valor: TIEMPO_REAL },
    { etiqueta: '1 min/s', valor: UN_MIN_POR_S },
    { etiqueta: '10 min/s', valor: 1 / 6 },
    { etiqueta: '1 h/s', valor: 1 },
    { etiqueta: '6 h/s', valor: 6 },
  ],
  velocidad: () => st().speed,
  fijarVelocidad: (v) => st().setSpeed(v),
  saltos: [
    { etiqueta: '−1 h', horas: -1 },
    { etiqueta: '+15 min', horas: 0.25 },
    { etiqueta: '+1 h', horas: 1 },
    { etiqueta: '+6 h', horas: 6 },
  ],
  saltar(h) {
    const H = horizonte()
    st().setT((((st().t + h) % H) + H) % H)
  },
}

/** Fase del buque seleccionado, para usar en textos (por ejemplo en la ficha). */
export const faseDe = (tr: Track) => PHASE_LABEL[phaseAt(tr, st().t, st().params).phase]

export function menuTerminal(ciudad: () => THREE.Object3D | null): ConfigMenu {
  return {
    tiempo: tiempoTerminal,
    escenas: [atraque, descarga, desatraque, llegada, patio, tamanos],
    get lugares() {
      return listaLugares()
    },
    opciones: [
      {
        id: 'ciudad',
        texto: () => `Ciudad: ${ciudad()?.visible === false ? 'oculta' : 'visible'}`,
        activa: () => ciudad()?.visible !== false,
        accion() {
          const c = ciudad()
          if (c) c.visible = !c.visible
        },
      },
      {
        id: 'comparador',
        texto: () => `Comparador de tamaños: ${st().showScale ? 'sí' : 'no'}`,
        activa: () => st().showScale,
        accion: () => st().setShowScale(!st().showScale),
      },
      {
        id: 'dianoche',
        texto: () => `Luz según la hora: ${st().dayNight ? 'sí' : 'no'}`,
        activa: () => st().dayNight,
        accion: () => st().setDayNight(!st().dayNight),
      },
    ],
  }
}
