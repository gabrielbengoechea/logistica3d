// Guía de una escena: panel con el paso actual (texto corto, como una lección), botones para avanzar o repetir
// y narración en voz alta cuando el navegador la ofrece.
import * as THREE from 'three'
import { COLOR, FUENTE, PanelInteractivo, partir } from './panel'
import type { EscenaGuiada } from './escenas'

const W = 960
const H = 560
const _cab = new THREE.Vector3()
const _dir = new THREE.Vector3()

export class GuiaVR extends PanelInteractivo {
  escena: EscenaGuiada | null = null
  paso = 0

  constructor() {
    super(W, H, 0.78)
  }

  get activa() {
    return this.escena !== null
  }

  mostrar(escena: EscenaGuiada, paso: number) {
    this.escena = escena
    this.paso = paso
    this.malla.visible = true
    this.invalidar()
    this.actualizarTextura()
  }

  ocultar() {
    this.escena = null
    this.malla.visible = false
  }

  /** Ubica la guía abajo y a la izquierda de la mirada, para que no tape lo que se está mostrando. */
  colocar(cabeza: THREE.Object3D) {
    cabeza.getWorldPosition(_cab)
    cabeza.getWorldDirection(_dir)
    _dir.y = 0
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, -1)
    _dir.normalize()
    // izquierda = (dir.z, 0, -dir.x)
    this.malla.position.set(_cab.x + _dir.x * 1.15 + _dir.z * 0.55, _cab.y - 0.42, _cab.z + _dir.z * 1.15 - _dir.x * 0.55)
    this.malla.lookAt(_cab)
  }

  protected dibujar(g: CanvasRenderingContext2D) {
    const e = this.escena
    if (!e) return
    this.fondo()
    const paso = e.pasos[this.paso]
    g.fillStyle = COLOR.acento
    g.font = `700 24px ${FUENTE}`
    g.fillText(`${e.titulo.toUpperCase()} · PASO ${this.paso + 1} DE ${e.pasos.length}`, 36, 58, W - 72)
    g.fillStyle = COLOR.tinta
    g.font = `800 44px ${FUENTE}`
    g.fillText(paso.titulo ?? e.titulo, 36, 116, W - 72)
    g.fillStyle = '#dbe5ee'
    g.font = `400 29px ${FUENTE}`
    partir(g, paso.texto, W - 72)
      .slice(0, 7)
      .forEach((l, i) => g.fillText(l, 36, 168 + i * 40))
    // Progreso
    for (let i = 0; i < e.pasos.length; i++) {
      g.fillStyle = i === this.paso ? COLOR.acento : i < this.paso ? COLOR.activo : 'rgba(255,255,255,0.25)'
      g.beginPath()
      g.arc(42 + i * 26, H - 118, 8, 0, Math.PI * 2)
      g.fill()
    }
    const ultimo = this.paso === e.pasos.length - 1
    const y = H - 92
    this.boton('guia:anterior', 32, y, 190, 66, '◀  Anterior', 'normal', 26)
    this.boton('guia:repetir', 234, y, 190, 66, '↻  Repetir', 'normal', 26)
    this.boton('guia:salir', 436, y, 170, 66, 'Salir', 'normal', 26)
    this.boton('guia:siguiente', W - 32 - 300, y, 300, 66, ultimo ? 'Terminar  ✓' : 'Siguiente  ▶', 'primario', 28)
  }
}

/** Lee en voz alta con la voz en español del navegador, si hay. Cancela lo que se estaba leyendo. */
export function narrar(texto: string) {
  try {
    const sintesis = globalThis.speechSynthesis
    if (!sintesis) return
    sintesis.cancel()
    const u = new SpeechSynthesisUtterance(texto)
    const voz = sintesis.getVoices().find((v) => v.lang.startsWith('es'))
    if (voz) u.voice = voz
    u.lang = voz?.lang ?? 'es-ES'
    u.rate = 1.02
    sintesis.speak(u)
  } catch {
    // Sin síntesis de voz: la guía sigue solo con texto.
  }
}

export function callar() {
  try {
    globalThis.speechSynthesis?.cancel()
  } catch {
    // nada
  }
}
