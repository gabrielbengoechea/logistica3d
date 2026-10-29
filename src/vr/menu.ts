// Menú del control izquierdo: se abre y se cierra con el gatillo izquierdo (dedo índice) y flota sobre ese control.
// Se opera apuntando con el rayo del control derecho y apretando su gatillo.
// Pestañas: Tiempo (pausa, velocidad, saltos), Escenas (guiadas), Lugares (ir a un punto) y Opciones.
import * as THREE from 'three'
import { COLOR, FUENTE, PanelInteractivo, partir } from './panel'
import type { ConfigMenu } from './escenas'

export type Pestana = 'tiempo' | 'escenas' | 'lugares' | 'opciones'

export interface OpcionesBase {
  narracion: boolean
  viñeta: boolean
}

const W = 900
const H = 680
const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'tiempo', texto: 'Tiempo' },
  { id: 'escenas', texto: 'Escenas' },
  { id: 'lugares', texto: 'Lugares' },
  { id: 'opciones', texto: 'Opciones' },
]

const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _cab = new THREE.Vector3()
const _arriba = new THREE.Vector3()

export class MenuVR extends PanelInteractivo {
  pestana: Pestana
  abierto = false
  private relojTexto = ''
  private reloj = 0

  constructor(private config: ConfigMenu, private base: OpcionesBase) {
    super(W, H, 0.4)
    this.pestana = config.tiempo ? 'tiempo' : config.escenas?.length ? 'escenas' : 'lugares'
  }

  alternar() {
    this.abierto ? this.cerrar() : this.abrir()
  }

  abrir() {
    this.abierto = true
    this.malla.visible = true
    this.invalidar()
  }

  cerrar() {
    this.abierto = false
    this.malla.visible = false
  }

  /** Coloca el panel sobre el control izquierdo, de frente a la cabeza, y refresca el reloj cada medio segundo. */
  seguir(agarre: THREE.Matrix4 | null, cabeza: THREE.Object3D, dt: number) {
    if (!this.abierto) return
    if (agarre) {
      agarre.decompose(_p, _q, _s)
      _arriba.set(0, 1, 0).applyQuaternion(_q)
      // 22 cm por encima del control, un poco hacia el cuerpo
      this.malla.position.copy(_p).addScaledVector(_arriba, 0.2)
      this.malla.position.y += 0.04
      cabeza.getWorldPosition(_cab)
      this.malla.lookAt(_cab)
    }
    this.reloj -= dt
    if (this.reloj <= 0 && this.pestana === 'tiempo' && this.config.tiempo) {
      this.reloj = 0.5
      const t = this.config.tiempo
      const texto = `${t.reloj()}|${t.detalle?.() ?? ''}|${t.pausado()}|${t.velocidad()}`
      if (texto !== this.relojTexto) {
        this.relojTexto = texto
        this.invalidar()
      }
    }
    this.actualizarTextura()
  }

  /** Cambia de pestaña si el id es una pestaña; devuelve true si lo atendió. */
  pestanaDe(id: string): boolean {
    const p = PESTANAS.find((x) => `pestana:${x.id}` === id)
    if (!p) return false
    this.pestana = p.id
    this.invalidar()
    return true
  }

  protected dibujar(g: CanvasRenderingContext2D) {
    this.fondo()
    // Pestañas
    const disponibles = PESTANAS.filter((p) =>
      p.id === 'tiempo' ? !!this.config.tiempo : p.id === 'escenas' ? !!this.config.escenas?.length : p.id === 'lugares' ? !!this.config.lugares?.length : true,
    )
    const anchoP = (W - 48 - (disponibles.length - 1) * 10) / disponibles.length
    disponibles.forEach((p, i) => this.boton(`pestana:${p.id}`, 24 + i * (anchoP + 10), 22, anchoP, 64, p.texto, this.pestana === p.id ? 'primario' : 'normal', 28))
    g.fillStyle = 'rgba(255,255,255,0.12)'
    g.fillRect(24, 102, W - 48, 2)

    if (this.pestana === 'tiempo' && this.config.tiempo) this.dibujarTiempo(g)
    else if (this.pestana === 'escenas') this.dibujarLista(g, (this.config.escenas ?? []).map((e) => ({ id: `escena:${e.id}`, titulo: e.titulo, resumen: e.resumen })))
    else if (this.pestana === 'lugares') this.dibujarLista(g, (this.config.lugares ?? []).map((l, i) => ({ id: `lugar:${i}`, titulo: l.titulo, resumen: l.resumen ?? '' })))
    else this.dibujarOpciones()

    g.fillStyle = COLOR.tenue
    g.font = `500 22px ${FUENTE}`
    g.fillText('Gatillo izquierdo: cerrar · Apuntá con el control derecho', 28, H - 26)
  }

  private dibujarTiempo(g: CanvasRenderingContext2D) {
    const t = this.config.tiempo!
    g.fillStyle = COLOR.tinta
    g.font = `800 64px ${FUENTE}`
    g.fillText(t.reloj(), 32, 180)
    g.fillStyle = COLOR.tenue
    g.font = `500 26px ${FUENTE}`
    g.fillText(t.detalle?.() ?? '', 34, 222, W - 260)
    this.boton('tiempo:pausa', W - 232, 132, 200, 84, t.pausado() ? 'Seguir' : 'Pausar', t.pausado() ? 'primario' : 'normal', 30)

    g.fillStyle = COLOR.tenue
    g.font = `600 24px ${FUENTE}`
    g.fillText('VELOCIDAD', 32, 284)
    const vs = t.velocidades
    const av = (W - 64 - (vs.length - 1) * 10) / vs.length
    vs.forEach((v, i) => this.boton(`vel:${i}`, 32 + i * (av + 10), 300, av, 76, v.etiqueta, Math.abs(t.velocidad() - v.valor) < 1e-9 ? 'activo' : 'normal'))

    g.fillStyle = COLOR.tenue
    g.fillText('SALTAR', 32, 426)
    const ss = t.saltos
    const as = (W - 64 - (ss.length - 1) * 10) / ss.length
    ss.forEach((s, i) => this.boton(`salto:${i}`, 32 + i * (as + 10), 442, as, 76, s.etiqueta))
  }

  private dibujarLista(g: CanvasRenderingContext2D, items: { id: string; titulo: string; resumen: string }[]) {
    const cols = items.length > 4 ? 2 : 1
    const filas = Math.ceil(items.length / cols)
    const alto = Math.min(118, (H - 130 - 60 - (filas - 1) * 10) / Math.max(1, filas))
    const ancho = (W - 48 - (cols - 1) * 12) / cols
    items.forEach((it, i) => {
      const x = 24 + (i % cols) * (ancho + 12)
      const y = 120 + Math.floor(i / cols) * (alto + 10)
      const hover = this.hover === it.id
      g.fillStyle = hover ? COLOR.botonHover : COLOR.boton
      this.redondear(x, y, ancho, alto)
      g.fill()
      if (hover) {
        g.strokeStyle = COLOR.acento
        g.lineWidth = 4
        g.stroke()
      }
      g.fillStyle = COLOR.tinta
      g.font = `700 28px ${FUENTE}`
      g.fillText(it.titulo, x + 20, y + 40, ancho - 40)
      g.fillStyle = COLOR.tenue
      g.font = `400 21px ${FUENTE}`
      partir(g, it.resumen, ancho - 40)
        .slice(0, alto > 100 ? 2 : 1)
        .forEach((l, k) => g.fillText(l, x + 20, y + 72 + k * 26, ancho - 40))
      this.botones.push({ id: it.id, x, y, w: ancho, h: alto })
    })
    if (!items.length) {
      g.fillStyle = COLOR.tenue
      g.font = `500 26px ${FUENTE}`
      g.fillText('No hay nada para mostrar acá.', 32, 170)
    }
  }

  private dibujarOpciones() {
    const ops: { id: string; texto: string; activo?: boolean }[] = [
      { id: 'op:inicio', texto: 'Volver al inicio' },
      { id: 'op:tutorial', texto: 'Ver el tutorial' },
      { id: 'op:narracion', texto: `Narración: ${this.base.narracion ? 'sí' : 'no'}`, activo: this.base.narracion },
      { id: 'op:viñeta', texto: `Viñeta al moverse: ${this.base.viñeta ? 'sí' : 'no'}`, activo: this.base.viñeta },
      ...(this.config.opciones ?? []).map((o) => ({ id: `app:${o.id}`, texto: o.texto(), activo: o.activa?.() })),
      { id: 'op:salir', texto: 'Salir de la realidad virtual' },
    ]
    const cols = 2
    const ancho = (W - 48 - 12) / cols
    ops.forEach((o, i) => {
      const x = 24 + (i % cols) * (ancho + 12)
      const y = 124 + Math.floor(i / cols) * 92
      this.boton(o.id, x, y, ancho, 78, o.texto, o.activo ? 'activo' : 'normal', 25)
    })
  }

  private redondear(x: number, y: number, w: number, h: number) {
    const g = this.g
    g.beginPath()
    g.roundRect?.(x, y, w, h, 16) ?? g.rect(x, y, w, h)
  }
}
