// Caminata en la pantalla (sin visor): el mismo jugador con colisiones, manejado con teclado y mouse o con el dedo.
// W/A/S/D o flechas para caminar, Shift para correr, arrastrar para mirar.
import * as THREE from 'three'
import type { Jugador } from './jugador'

const ALTURA_OJOS = 1.6

export class CaminataEscritorio {
  yaw = 0
  pitch = 0
  velocidad = 2.4
  private teclas = new Set<string>()
  private arrastre: { x: number; y: number; id: number } | null = null
  private quitar: (() => void) | null = null

  constructor(private jugador: Jugador, private camara: THREE.Camera, private elemento: HTMLElement) {}

  conectar() {
    const abajo = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return
      this.teclas.add(e.code)
    }
    const arriba = (e: KeyboardEvent) => this.teclas.delete(e.code)
    const pd = (e: PointerEvent) => {
      this.arrastre = { x: e.clientX, y: e.clientY, id: e.pointerId }
    }
    const pm = (e: PointerEvent) => {
      if (!this.arrastre || this.arrastre.id !== e.pointerId) return
      this.yaw -= (e.clientX - this.arrastre.x) * 0.004
      this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - this.arrastre.y) * 0.004, -1.3, 1.3)
      this.arrastre.x = e.clientX
      this.arrastre.y = e.clientY
    }
    const pu = () => (this.arrastre = null)
    window.addEventListener('keydown', abajo)
    window.addEventListener('keyup', arriba)
    this.elemento.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    this.quitar = () => {
      window.removeEventListener('keydown', abajo)
      window.removeEventListener('keyup', arriba)
      this.elemento.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
      this.teclas.clear()
    }
  }

  desconectar() {
    this.quitar?.()
    this.quitar = null
  }

  /** Mueve el cuerpo y pone la cámara a la altura de los ojos. */
  actualizar(dt: number) {
    const t = this.teclas
    const ad = (t.has('KeyW') || t.has('ArrowUp') ? 1 : 0) - (t.has('KeyS') || t.has('ArrowDown') ? 1 : 0)
    const de = (t.has('KeyD') ? 1 : 0) - (t.has('KeyA') ? 1 : 0)
    const giro = (t.has('ArrowLeft') ? 1 : 0) - (t.has('ArrowRight') ? 1 : 0)
    this.yaw += giro * 1.8 * dt
    const deseo = new THREE.Vector3()
    if (ad || de) {
      const k = this.velocidad * (t.has('ShiftLeft') || t.has('ShiftRight') ? 2 : 1)
      deseo.set(-Math.sin(this.yaw) * ad + Math.cos(this.yaw) * de, 0, -Math.cos(this.yaw) * ad - Math.sin(this.yaw) * de)
      deseo.normalize().multiplyScalar(k)
    }
    this.jugador.paso(dt, deseo)
    this.camara.position.set(this.jugador.pos.x, this.jugador.pos.y + ALTURA_OJOS, this.jugador.pos.z)
    this.camara.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
    this.camara.updateMatrixWorld()
  }
}
