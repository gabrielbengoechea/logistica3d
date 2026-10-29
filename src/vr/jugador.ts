// El cuerpo del jugador: una cápsula con gravedad que camina sobre el mundo de colisión.
// Sube escalones bajos (cordones, rampas), no atraviesa paredes y, si cae al agua o a un vacío, vuelve al último
// lugar firme. La posición es la de los pies.
import * as THREE from 'three'
import type { MundoColision } from './mundo'

export interface OpcionesJugador {
  radio?: number
  altura?: number
  /** Altura máxima de un escalón que se sube caminando (m). */
  escalon?: number
  gravedad?: number
  /** Si cae más que esto bajo el último suelo firme, vuelve a él. */
  caidaMaxima?: number
}

const ABAJO = new THREE.Vector3(0, -1, 0)

export class Jugador {
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  enSuelo = false
  radio: number
  altura: number
  escalon: number
  gravedad: number
  caidaMaxima: number
  /** Posiciones firmes recientes (piso justo debajo del centro), una cada ~0,25 s. */
  private firmes: THREE.Vector3[] = []
  private tiempoFirme = 0
  private relojFirme = 0
  /** En el último subpaso había piso justo debajo del centro del cuerpo (no solo el borde de la cápsula). */
  private sueloCentro = false
  private seg = new THREE.Line3()
  private tmp = new THREE.Vector3()
  private tmp2 = new THREE.Vector3()
  private emp = new THREE.Vector3()

  constructor(private mundo: MundoColision, op: OpcionesJugador = {}) {
    this.radio = op.radio ?? 0.25
    this.altura = op.altura ?? 1.6
    this.escalon = op.escalon ?? 0.4
    this.gravedad = op.gravedad ?? 9.8
    this.caidaMaxima = op.caidaMaxima ?? 6
  }

  /** Ubica al jugador apoyado en el suelo más cercano bajo `p` (o en `p` si no hay suelo). */
  ubicar(p: THREE.Vector3) {
    this.pos.copy(p)
    this.vel.set(0, 0, 0)
    const suelo = this.sueloBajo(this.tmp.set(p.x, p.y + 1.5, p.z), 40)
    if (suelo !== null) this.pos.y = suelo
    this.firmes = [this.pos.clone()]
    this.tiempoFirme = 0
    this.enSuelo = true
  }

  /** Altura del suelo bajo un punto (rayo hacia abajo) o null. */
  sueloBajo(desde: THREE.Vector3, lejos: number): number | null {
    const hit = this.mundo.rayo(desde, ABAJO, lejos)
    if (!hit) return null
    const n = hit.face?.normal
    // Solo cuenta como suelo una superficie razonablemente horizontal.
    if (n && Math.abs(n.y) < 0.5) return null
    return hit.point.y
  }

  /**
   * Avanza la simulación. `deseo` es la velocidad horizontal pedida (m/s, en el mundo).
   * Devuelve el desplazamiento aplicado.
   */
  paso(dt: number, deseo: THREE.Vector3): THREE.Vector3 {
    const antes = this.tmp2.copy(this.pos)
    dt = Math.min(dt, 0.1)
    // Subpasos para que un movimiento rápido no salte una pared delgada.
    const velMax = Math.max(deseo.length(), Math.abs(this.vel.y))
    const n = Math.min(8, Math.max(1, Math.ceil((velMax * dt) / (this.radio * 0.6))))
    const h = dt / n
    for (let i = 0; i < n; i++) this.subpaso(h, deseo)

    // Vacío o agua: volver a tierra firme. Se usa la posición de hace un par de segundos (no la del borde,
    // desde donde se volvería a caer).
    const ultimo = this.firmes[this.firmes.length - 1]
    if (ultimo && this.pos.y < ultimo.y - this.caidaMaxima) {
      const destino = this.firmes[0]
      this.pos.copy(destino)
      this.vel.set(0, 0, 0)
      this.firmes = [destino]
      this.tiempoFirme = 0
    }
    if (this.enSuelo && this.sueloCentro) {
      this.tiempoFirme += dt
      this.relojFirme += dt
      if (this.tiempoFirme > 0.3 && this.relojFirme >= 0.25) {
        this.relojFirme = 0
        this.firmes.push(this.pos.clone())
        if (this.firmes.length > 8) this.firmes.shift()
      }
    } else this.tiempoFirme = 0
    return antes.subVectors(this.pos, antes)
  }

  private subpaso(h: number, deseo: THREE.Vector3) {
    // Escalón: si hay piso un poco más alto justo adelante, subirse antes de chocar.
    if (this.enSuelo && deseo.lengthSq() > 1e-4) {
      const dir = this.tmp.copy(deseo).setY(0).normalize()
      const sonda = this.tmp.set(
        this.pos.x + dir.x * (this.radio + 0.08),
        this.pos.y + this.escalon + 0.05,
        this.pos.z + dir.z * (this.radio + 0.08),
      )
      const suelo = this.sueloBajo(sonda, this.escalon + 0.05)
      if (suelo !== null && suelo > this.pos.y + 0.02 && suelo <= this.pos.y + this.escalon) this.pos.y = suelo + 0.005
    }

    this.vel.y = this.enSuelo ? -0.5 : Math.max(this.vel.y - this.gravedad * h, -30)
    this.pos.x += deseo.x * h
    this.pos.z += deseo.z * h
    this.pos.y += this.vel.y * h

    const r = this.radio
    this.seg.start.set(this.pos.x, this.pos.y + r, this.pos.z)
    this.seg.end.set(this.pos.x, this.pos.y + this.altura - r, this.pos.z)
    const empuje = this.emp.copy(this.seg.start)
    this.mundo.resolverCapsula(this.seg, r)
    empuje.subVectors(this.seg.start, empuje)
    this.pos.add(empuje)

    // En el suelo si la colisión empujó hacia arriba o si hay piso justo debajo.
    const empujeArriba = empuje.y > Math.abs(this.vel.y * h) * 0.25 && empuje.y > 1e-5
    const suelo = this.sueloBajo(this.tmp.set(this.pos.x, this.pos.y + 0.3, this.pos.z), 0.42)
    this.enSuelo = empujeArriba || (suelo !== null && this.vel.y <= 0)
    this.sueloCentro = suelo !== null
    if (this.enSuelo) {
      if (suelo !== null && suelo > this.pos.y - 0.12) this.pos.y = Math.max(this.pos.y, suelo)
      this.vel.y = 0
    } else if (empuje.lengthSq() > 0) {
      // Contra una pared o techo: se pierde la velocidad en esa dirección.
      const n = empuje.normalize()
      this.vel.addScaledVector(n, -n.dot(this.vel))
    }
  }
}
