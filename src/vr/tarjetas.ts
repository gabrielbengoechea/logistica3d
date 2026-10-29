// Tarjetas ilustradas del tutorial (estilo Mission:ISS): cada una se dibuja en un canvas 2D y se usa igual en el
// visor (como textura de un panel) y en la pantalla (como imagen). Sin archivos externos: todo es dibujo vectorial.

export type Parte = 'gatillo' | 'grip' | 'stickIzq' | 'stickDer' | 'botonA' | 'botonB' | 'botonX' | 'botonY' | 'cabeza'

export interface Tarjeta {
  /** Texto pequeño sobre el título (por ejemplo «Paso 2 de 6»). Si falta, se numera sola. */
  etiqueta?: string
  titulo: string
  /** Párrafos cortos. Una línea en blanco separa párrafos. */
  texto: string
  /** Partes del control que se resaltan. */
  resaltar?: Parte[]
  /** Flechas o indicaciones sobre los sticks. */
  gesto?: 'mover' | 'girar' | 'teletransporte' | 'apuntar' | 'mirar'
  /** Tarjeta de portada: título grande, sin controles dibujados. */
  portada?: boolean
  /** Lista de ítems (portada o resumen). */
  items?: string[]
}

export const ANCHO = 1200
export const ALTO = 720

const C = {
  fondo1: '#0b1a2e',
  fondo2: '#12304f',
  tinta: '#f2f6fa',
  tenue: '#9fb3c8',
  acento: '#ffb547',
  acento2: '#4fd1c5',
  cuerpo: '#2a3442',
  cuerpoBorde: '#56657a',
  boton: '#3b4757',
}

const FUENTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

function redondeado(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function partirLineas(g: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const out: string[] = []
  for (const parrafo of texto.split('\n')) {
    if (!parrafo.trim()) {
      out.push('')
      continue
    }
    let linea = ''
    for (const palabra of parrafo.split(' ')) {
      const prueba = linea ? `${linea} ${palabra}` : palabra
      if (linea && g.measureText(prueba).width > ancho) {
        out.push(linea)
        linea = palabra
      } else linea = prueba
    }
    out.push(linea)
  }
  return out
}

/** Brillo de resaltado alrededor de una parte. */
function halo(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const grad = g.createRadialGradient(x, y, r * 0.4, x, y, r * 1.9)
  grad.addColorStop(0, 'rgba(255,181,71,0.55)')
  grad.addColorStop(1, 'rgba(255,181,71,0)')
  g.fillStyle = grad
  g.beginPath()
  g.arc(x, y, r * 1.9, 0, Math.PI * 2)
  g.fill()
}

function flecha(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color = C.acento) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  g.strokeStyle = color
  g.fillStyle = color
  g.lineWidth = 6
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(x1, y1)
  g.lineTo(x2, y2)
  g.stroke()
  g.beginPath()
  g.moveTo(x2 + Math.cos(a) * 4, y2 + Math.sin(a) * 4)
  g.lineTo(x2 - Math.cos(a - 0.5) * 18, y2 - Math.sin(a - 0.5) * 18)
  g.lineTo(x2 - Math.cos(a + 0.5) * 18, y2 - Math.sin(a + 0.5) * 18)
  g.closePath()
  g.fill()
}

/**
 * Un control Touch del Quest 2 visto de arriba: anillo de seguimiento, cuerpo, stick y dos botones.
 * `lado` = 'izq' dibuja X/Y, 'der' dibuja A/B. Devuelve las posiciones de cada parte para poner flechas.
 */
function control(g: CanvasRenderingContext2D, cx: number, cy: number, lado: 'izq' | 'der', resaltar: Set<Parte>) {
  const s = lado === 'izq' ? -1 : 1
  const pos = {
    stick: { x: cx - s * 28, y: cy - 6 },
    boton1: { x: cx + s * 34, y: cy + 30 }, // A o X (abajo)
    boton2: { x: cx + s * 50, y: cy - 8 }, // B o Y (arriba)
    gatillo: { x: cx - s * 4, y: cy - 118 },
    grip: { x: cx - s * 86, y: cy + 92 },
  }
  const parteStick: Parte = lado === 'izq' ? 'stickIzq' : 'stickDer'
  const parte1: Parte = lado === 'izq' ? 'botonX' : 'botonA'
  const parte2: Parte = lado === 'izq' ? 'botonY' : 'botonB'

  // Halos detrás del dibujo
  if (resaltar.has(parteStick)) halo(g, pos.stick.x, pos.stick.y, 30)
  if (resaltar.has(parte1)) halo(g, pos.boton1.x, pos.boton1.y, 20)
  if (resaltar.has(parte2)) halo(g, pos.boton2.x, pos.boton2.y, 20)
  if (resaltar.has('gatillo')) halo(g, pos.gatillo.x, pos.gatillo.y, 34)
  if (resaltar.has('grip')) halo(g, pos.grip.x, pos.grip.y, 38)

  // Anillo de seguimiento
  g.lineWidth = 16
  g.strokeStyle = C.cuerpo
  g.beginPath()
  g.ellipse(cx + s * 10, cy - 46, 104, 86, s * 0.35, Math.PI * (s > 0 ? 0.95 : 0.05), Math.PI * (s > 0 ? 2.25 : 1.35) * (s > 0 ? 1 : 1), s < 0)
  g.stroke()
  g.lineWidth = 3
  g.strokeStyle = C.cuerpoBorde
  g.stroke()

  // Gatillo (asoma por delante)
  g.fillStyle = resaltar.has('gatillo') ? C.acento : C.boton
  redondeado(g, pos.gatillo.x - 26, pos.gatillo.y - 18, 52, 40, 16)
  g.fill()

  // Cuerpo y empuñadura
  g.fillStyle = C.cuerpo
  g.strokeStyle = C.cuerpoBorde
  g.lineWidth = 3
  g.beginPath()
  g.ellipse(cx, cy + 8, 86, 66, 0, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.fillStyle = resaltar.has('grip') ? C.acento : C.cuerpo
  g.beginPath()
  g.moveTo(cx - s * 40, cy + 50)
  g.quadraticCurveTo(cx - s * 120, cy + 110, cx - s * 112, cy + 170)
  g.quadraticCurveTo(cx - s * 70, cy + 190, cx - s * 30, cy + 150)
  g.quadraticCurveTo(cx - s * 10, cy + 100, cx + s * 30, cy + 64)
  g.closePath()
  g.fill()
  g.stroke()

  // Stick
  g.fillStyle = '#18202b'
  g.beginPath()
  g.arc(pos.stick.x, pos.stick.y, 26, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = resaltar.has(parteStick) ? C.acento : '#4a5869'
  g.beginPath()
  g.arc(pos.stick.x, pos.stick.y, 18, 0, Math.PI * 2)
  g.fill()

  // Botones
  for (const [p, parte, letra] of [
    [pos.boton1, parte1, lado === 'izq' ? 'X' : 'A'],
    [pos.boton2, parte2, lado === 'izq' ? 'Y' : 'B'],
  ] as const) {
    g.fillStyle = resaltar.has(parte) ? C.acento : C.boton
    g.beginPath()
    g.arc(p.x, p.y, 15, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = resaltar.has(parte) ? '#1b1204' : C.tinta
    g.font = `700 16px ${FUENTE}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(letra, p.x, p.y + 1)
  }

  // Botón de menú (izq) o Meta (der)
  g.fillStyle = '#1b2430'
  g.beginPath()
  g.arc(cx + s * 8, cy + 46, 8, 0, Math.PI * 2)
  g.fill()
  return pos
}

function visor(g: CanvasRenderingContext2D, cx: number, cy: number) {
  halo(g, cx, cy, 60)
  g.fillStyle = C.cuerpo
  g.strokeStyle = C.cuerpoBorde
  g.lineWidth = 4
  redondeado(g, cx - 120, cy - 60, 240, 120, 46)
  g.fill()
  g.stroke()
  g.fillStyle = '#16202c'
  for (const dx of [-62, 62]) {
    g.beginPath()
    g.arc(cx + dx, cy, 30, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = C.acento
  g.lineWidth = 6
  g.beginPath()
  g.arc(cx, cy + 40, 190, Math.PI * 1.15, Math.PI * 1.85)
  g.stroke()
  flecha(g, cx - 150, cy - 70, cx - 172, cy - 40)
  flecha(g, cx + 150, cy - 70, cx + 172, cy - 40)
}

function gestos(g: CanvasRenderingContext2D, t: Tarjeta, izq: ReturnType<typeof control>, der: ReturnType<typeof control>) {
  const etiqueta = (x: number, y: number, txt: string, align: CanvasTextAlign = 'center') => {
    g.font = `600 22px ${FUENTE}`
    g.textAlign = align
    g.textBaseline = 'middle'
    g.fillStyle = C.acento
    g.fillText(txt, x, y)
  }
  switch (t.gesto) {
    case 'mover': {
      const { x, y } = izq.stick
      flecha(g, x, y - 32, x, y - 62)
      flecha(g, x, y + 32, x, y + 62)
      flecha(g, x - 32, y, x - 58, y)
      flecha(g, x + 32, y, x + 58, y)
      etiqueta(x, y - 88, 'caminar')
      break
    }
    case 'girar': {
      const { x, y } = der.stick
      flecha(g, x - 8, y - 46, x - 56, y - 46)
      flecha(g, x + 8, y - 46, x + 56, y - 46)
      etiqueta(x, y - 80, 'girar 30°')
      break
    }
    case 'teletransporte': {
      const { x, y } = der.stick
      flecha(g, x, y - 34, x, y - 78)
      // Arco de teletransporte
      g.strokeStyle = C.acento2
      g.lineWidth = 5
      g.setLineDash([12, 10])
      g.beginPath()
      g.moveTo(x, y - 120)
      g.quadraticCurveTo(x + 90, y - 250, x + 160, y - 60)
      g.stroke()
      g.setLineDash([])
      g.beginPath()
      g.ellipse(x + 160, y - 52, 36, 13, 0, 0, Math.PI * 2)
      g.stroke()
      etiqueta(x + 150, y - 14, 'soltá para ir')
      break
    }
    case 'apuntar': {
      const { x, y } = der.gatillo
      g.strokeStyle = C.acento2
      g.lineWidth = 5
      g.beginPath()
      g.moveTo(x, y - 24)
      g.lineTo(x + 40, y - 150)
      g.stroke()
      g.fillStyle = C.acento2
      g.beginPath()
      g.arc(x + 42, y - 156, 10, 0, Math.PI * 2)
      g.fill()
      etiqueta(x + 42, y - 190, 'apuntá y apretá')
      break
    }
    default:
  }
}

/** Dibuja una tarjeta en el canvas dado (se redimensiona a 1200×720). */
export function dibujarTarjeta(canvas: HTMLCanvasElement, t: Tarjeta, indice: number, total: number, pie = '') {
  canvas.width = ANCHO
  canvas.height = ALTO
  const g = canvas.getContext('2d')!
  const fondo = g.createLinearGradient(0, 0, ANCHO, ALTO)
  fondo.addColorStop(0, C.fondo1)
  fondo.addColorStop(1, C.fondo2)
  g.fillStyle = fondo
  redondeado(g, 0, 0, ANCHO, ALTO, 40)
  g.fill()
  // Retícula sutil, como en una pantalla de instrucción
  g.strokeStyle = 'rgba(255,255,255,0.04)'
  g.lineWidth = 1
  for (let x = 40; x < ANCHO; x += 40) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, ALTO), g.stroke())
  for (let y = 40; y < ALTO; y += 40) (g.beginPath(), g.moveTo(0, y), g.lineTo(ANCHO, y), g.stroke())
  g.strokeStyle = 'rgba(255,181,71,0.65)'
  g.lineWidth = 4
  redondeado(g, 2, 2, ANCHO - 4, ALTO - 4, 38)
  g.stroke()

  const etiqueta = t.etiqueta ?? (t.portada ? 'Tutorial' : `Paso ${indice + 1} de ${total}`)
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  g.fillStyle = C.acento
  g.font = `700 24px ${FUENTE}`
  g.fillText(etiqueta.toUpperCase(), 64, 86)

  const ancho = t.portada || !t.resaltar?.length && !t.gesto ? ANCHO - 128 : 500
  g.fillStyle = C.tinta
  g.font = `800 ${t.portada ? 68 : 52}px ${FUENTE}`
  const lineasTitulo = partirLineas(g, t.titulo, ancho)
  let y = 86 + (t.portada ? 84 : 70)
  for (const l of lineasTitulo) {
    g.fillText(l, 64, y)
    y += t.portada ? 76 : 60
  }
  y += 6
  g.font = `400 30px ${FUENTE}`
  g.fillStyle = '#d6e0ea'
  for (const l of partirLineas(g, t.texto, ancho)) {
    if (l) g.fillText(l, 64, y)
    y += l ? 42 : 20
  }
  if (t.items?.length) {
    y += 10
    g.font = `500 28px ${FUENTE}`
    for (const it of t.items) {
      g.fillStyle = C.acento
      g.beginPath()
      g.arc(76, y - 9, 7, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = C.tinta
      for (const [k, l] of partirLineas(g, it, ancho - 40).entries()) {
        g.fillText(l, 100, y)
        y += 38
        if (k > 2) break
      }
      y += 6
    }
  }

  // Ilustración
  if (!t.portada) {
    const res = new Set(t.resaltar ?? [])
    if (t.gesto === 'mirar' || res.has('cabeza')) visor(g, 880, 380)
    else if (t.resaltar?.length || t.gesto) {
      const izq = control(g, 720, 410, 'izq', res)
      const der = control(g, 960, 410, 'der', res)
      g.fillStyle = C.tenue
      g.font = `500 20px ${FUENTE}`
      g.textAlign = 'center'
      g.fillText('izquierdo', 720, 630)
      g.fillText('derecho', 960, 630)
      gestos(g, t, izq, der)
    }
  }

  // Pie: indicador de páginas y ayuda
  for (let i = 0; i < total; i++) {
    g.fillStyle = i === indice ? C.acento : 'rgba(255,255,255,0.25)'
    g.beginPath()
    g.arc(ANCHO / 2 - (total - 1) * 14 + i * 28, ALTO - 44, i === indice ? 8 : 6, 0, Math.PI * 2)
    g.fill()
  }
  if (pie) {
    g.fillStyle = C.tenue
    g.font = `500 22px ${FUENTE}`
    g.textAlign = 'right'
    g.fillText(pie, ANCHO - 56, ALTO - 36)
  }
}

/** Controles comunes a las tres apps. `interaccion` describe qué hace el gatillo en cada app. */
export function tarjetasControles(interaccion: string): Tarjeta[] {
  return [
    {
      titulo: 'Preparate',
      texto:
        'Despejá el espacio a tu alrededor y quedate dentro del límite que marcaste en el Quest.\n\nPodés jugar parado o sentado. Si te mareás, sacate el visor y descansá.',
      gesto: 'mirar',
    },
    {
      titulo: 'Caminar',
      texto: 'Empujá el stick izquierdo para caminar hacia donde mirás.\n\nHacé click con el stick para ir más rápido. Las paredes, estanterías y máquinas no se atraviesan.',
      resaltar: ['stickIzq'],
      gesto: 'mover',
    },
    {
      titulo: 'Girar',
      texto: 'Mové el stick derecho a izquierda o derecha para girar de a 30°.\n\nTambién podés girar el cuerpo: el escenario acompaña tus pasos reales.',
      resaltar: ['stickDer'],
      gesto: 'girar',
    },
    {
      titulo: 'Teletransporte',
      texto: 'Empujá el stick derecho hacia adelante: aparece un arco.\n\nApuntá a un lugar del piso (aro verde) y soltá el stick para aparecer ahí. Si el aro está rojo, no se puede ir.',
      resaltar: ['stickDer'],
      gesto: 'teletransporte',
    },
    {
      titulo: 'Interactuar',
      texto: interaccion,
      resaltar: ['gatillo'],
      gesto: 'apuntar',
    },
    {
      titulo: 'Botones útiles',
      texto: 'Y: volver al punto de partida.\nB: ver este tutorial de nuevo.\nBotón Meta (derecho): salir de la experiencia.',
      resaltar: ['botonY', 'botonB'],
    },
  ]
}

/** Tarjeta final con todos los controles en una imagen. */
export function tarjetaResumen(interaccionCorta: string): Tarjeta {
  return {
    etiqueta: 'Resumen',
    titulo: '¡Listo para empezar!',
    texto: 'Apretá el gatillo para comenzar.',
    resaltar: ['stickIzq', 'stickDer', 'gatillo', 'botonY', 'botonB'],
    items: [
      'Stick izquierdo: caminar (click: correr)',
      'Stick derecho: girar · adelante: teletransporte',
      `Gatillo: ${interaccionCorta}`,
      'Y: punto de partida · B: tutorial',
    ],
  }
}
