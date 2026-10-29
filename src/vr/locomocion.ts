// Entrada de los controles Touch y movimiento del jugador en el visor.
// Stick izquierdo: caminar (relativo a la mirada; click = correr). Stick derecho: giro de 30° y, hacia adelante,
// arco de teletransporte que se confirma al soltar. Una viñeta suave reduce el mareo mientras uno se desplaza.
import * as THREE from 'three'
import type { Jugador } from './jugador'
import type { MundoColision } from './mundo'

export const BOTON = { gatillo: 0, grip: 1, stick: 3, a: 4, b: 5 } as const

export interface EstadoMando {
  fuente: XRInputSource
  mano: XRHandedness
  ejes: [number, number]
  apretado: boolean[]
  /** Botones que se apretaron en este cuadro. */
  flanco: boolean[]
}

/** Lee los gamepads de la sesión y detecta flancos de botones. */
export class LectorMandos {
  private previo = new Map<XRInputSource, boolean[]>()
  leer(sesion: XRSession | null): EstadoMando[] {
    const out: EstadoMando[] = []
    if (!sesion) return out
    for (const fuente of sesion.inputSources) {
      const gp = fuente.gamepad
      if (!gp) continue
      const apretado = gp.buttons.map((b) => b.pressed)
      const prev = this.previo.get(fuente) ?? []
      const flanco = apretado.map((p, i) => p && !prev[i])
      this.previo.set(fuente, apretado)
      const ejes: [number, number] = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] ?? 0, gp.axes[1] ?? 0]
      out.push({ fuente, mano: fuente.handedness, ejes, apretado, flanco })
    }
    return out
  }
}

const ZONA_MUERTA = 0.18

function textoViñeta(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 60, 128, 128, 128)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.55, 'rgba(0,0,0,0.15)')
  grad.addColorStop(1, 'rgba(0,0,0,1)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export interface OpcionesLocomocion {
  velocidad?: number
  giroGrados?: number
  /** Velocidad inicial del arco de teletransporte (m/s): define el alcance. */
  alcance?: number
  limites?: THREE.Box3
  viñeta?: boolean
}

export class Locomocion {
  velocidad: number
  giro: number
  alcance: number
  limites?: THREE.Box3
  /** Se pone en false para congelar al jugador (por ejemplo durante el tutorial). */
  habilitada = true
  private giroArmado = true
  private apuntando = false
  private destino = new THREE.Vector3()
  private destinoValido = false
  private hayImpacto = false
  readonly arco: THREE.Line
  readonly aro: THREE.Mesh
  private puntosArco = new Float32Array(3 * 48)
  private viñeta: THREE.Mesh | null = null
  private intensidad = 0

  constructor(private jugador: Jugador, private mundo: MundoColision, op: OpcionesLocomocion = {}) {
    this.velocidad = op.velocidad ?? 2.2
    this.giro = THREE.MathUtils.degToRad(op.giroGrados ?? 30)
    this.alcance = op.alcance ?? 9
    this.limites = op.limites
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.puntosArco, 3))
    this.arco = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x4fd1c5, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }))
    this.arco.frustumCulled = false
    this.arco.renderOrder = 999
    this.arco.visible = false
    this.aro = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.3, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x4fd1c5, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false, toneMapped: false }),
    )
    this.aro.renderOrder = 999
    this.aro.visible = false
    for (const o of [this.arco, this.aro]) {
      o.userData.sinColision = true
      o.raycast = () => undefined
    }
    if (op.viñeta !== false) {
      this.viñeta = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.5),
        new THREE.MeshBasicMaterial({ map: textoViñeta(), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }),
      )
      this.viñeta.position.set(0, 0, -0.12)
      this.viñeta.renderOrder = 998
      this.viñeta.visible = false
      this.viñeta.userData.sinColision = true
      this.viñeta.raycast = () => undefined
    }
  }

  /** Agrega los elementos visuales: arco y aro a la escena, viñeta pegada a la cámara. */
  montar(escena: THREE.Object3D, camara: THREE.Object3D) {
    escena.add(this.arco, this.aro)
    if (this.viñeta) camara.add(this.viñeta)
  }

  desmontar() {
    this.arco.removeFromParent()
    this.aro.removeFromParent()
    this.viñeta?.removeFromParent()
  }

  /**
   * Un cuadro de movimiento. `rig` es el origen del jugador (padre de la cámara); `cabeza` la cámara (posición local
   * dentro del rig); `rayoDerecho` el rayo del control derecho en el mundo (o null).
   */
  actualizar(dt: number, mandos: EstadoMando[], rig: THREE.Object3D, cabeza: THREE.Object3D, rayoDerecho: THREE.Ray | null) {
    const izq = mandos.find((m) => m.mano === 'left')
    const der = mandos.find((m) => m.mano === 'right')

    // 1. Lo que el jugador caminó físicamente: el cuerpo sigue a la cabeza.
    const cabezaMundo = this.cabezaMundo(rig, cabeza)
    this.jugador.pos.x = cabezaMundo.x
    this.jugador.pos.z = cabezaMundo.z

    // 2. Stick izquierdo: caminar hacia donde se mira.
    const deseo = new THREE.Vector3()
    if (this.habilitada && izq) {
      const [x, y] = izq.ejes
      if (Math.hypot(x, y) > ZONA_MUERTA) {
        const yaw = this.yawCabeza(rig, cabeza)
        const adelante = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
        const derecha = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
        const k = this.velocidad * (izq.apretado[BOTON.stick] ? 1.9 : 1)
        deseo.addScaledVector(adelante, -y * k).addScaledVector(derecha, x * k)
      }
    }
    this.jugador.paso(dt, deseo)

    // 3. Stick derecho: giro por pasos y teletransporte.
    if (this.habilitada && der) {
      const [x, y] = der.ejes
      if (this.giroArmado && Math.abs(x) > 0.7 && !this.apuntando) {
        this.girar(rig, cabeza, x > 0 ? -this.giro : this.giro)
        this.giroArmado = false
      } else if (Math.abs(x) < 0.3) this.giroArmado = true

      if (y < -0.6 && rayoDerecho) {
        this.apuntando = true
        this.calcularArco(rayoDerecho)
      } else if (this.apuntando && y > -0.35) {
        this.apuntando = false
        if (this.destinoValido) this.jugador.ubicar(this.destino)
      }
    } else this.apuntando = false
    this.arco.visible = this.apuntando
    this.aro.visible = this.apuntando && this.hayImpacto

    // 4. El rig se acomoda para que la cabeza quede sobre el cuerpo resuelto.
    this.ajustarRig(rig, cabeza)

    // 5. Viñeta según la velocidad del desplazamiento artificial.
    if (this.viñeta) {
      const objetivo = deseo.lengthSq() > 0.01 ? 0.75 : 0
      this.intensidad += (objetivo - this.intensidad) * Math.min(1, dt * 6)
      ;(this.viñeta.material as THREE.MeshBasicMaterial).opacity = this.intensidad
      this.viñeta.visible = this.intensidad > 0.02
    }
  }

  /** Lleva al jugador a un punto, mirando hacia `yaw` (radianes, 0 = -Z). */
  irA(rig: THREE.Object3D, cabeza: THREE.Object3D, pies: THREE.Vector3, yaw: number) {
    this.jugador.ubicar(pies)
    const yawLocal = Math.atan2(-this.dirLocal(cabeza).x, -this.dirLocal(cabeza).z)
    rig.rotation.set(0, yaw - yawLocal, 0)
    this.ajustarRig(rig, cabeza)
  }

  private girar(rig: THREE.Object3D, cabeza: THREE.Object3D, angulo: number) {
    const antes = this.cabezaMundo(rig, cabeza)
    rig.rotation.y += angulo
    rig.updateMatrixWorld()
    const despues = this.cabezaMundo(rig, cabeza)
    rig.position.x += antes.x - despues.x
    rig.position.z += antes.z - despues.z
    rig.updateMatrixWorld()
  }

  private ajustarRig(rig: THREE.Object3D, cabeza: THREE.Object3D) {
    const local = new THREE.Vector3(cabeza.position.x, 0, cabeza.position.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.rotation.y)
    rig.position.set(this.jugador.pos.x - local.x, this.jugador.pos.y, this.jugador.pos.z - local.z)
    rig.updateMatrixWorld()
  }

  private cabezaMundo(rig: THREE.Object3D, cabeza: THREE.Object3D) {
    const local = new THREE.Vector3(cabeza.position.x, 0, cabeza.position.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.rotation.y)
    return local.add(rig.position)
  }

  private dirLocal(cabeza: THREE.Object3D) {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(cabeza.quaternion)
  }

  private yawCabeza(rig: THREE.Object3D, cabeza: THREE.Object3D) {
    const d = this.dirLocal(cabeza)
    return Math.atan2(-d.x, -d.z) + rig.rotation.y
  }

  /** Arco balístico desde el control; el destino vale si es piso, está en la zona y entra el jugador. */
  private calcularArco(rayo: THREE.Ray) {
    const g = 9.8
    const v = rayo.direction.clone().normalize().multiplyScalar(this.alcance)
    const p = rayo.origin.clone()
    const q = new THREE.Vector3()
    const dir = new THREE.Vector3()
    const dt = 0.05
    let k = 0
    this.destinoValido = false
    let impacto: THREE.Intersection | null = null
    for (; k < 47; k++) {
      this.puntosArco.set([p.x, p.y, p.z], k * 3)
      q.set(p.x + v.x * dt, p.y + v.y * dt - 0.5 * g * dt * dt, p.z + v.z * dt)
      v.y -= g * dt
      dir.subVectors(q, p)
      const largo = dir.length()
      impacto = this.mundo.rayo(p, dir.normalize(), largo)
      if (impacto) {
        p.copy(impacto.point)
        k++
        break
      }
      p.copy(q)
      if (p.y < this.jugador.pos.y - 30) break
    }
    this.puntosArco.set([p.x, p.y, p.z], k * 3)
    for (let i = k + 1; i < 48; i++) this.puntosArco.set([p.x, p.y, p.z], i * 3)
    this.arco.geometry.attributes.position.needsUpdate = true
    this.arco.geometry.setDrawRange(0, k + 1)
    if (impacto) {
      const n = impacto.face?.normal
      const piso = !n || Math.abs(n.y) > 0.75
      const dentro = !this.limites || this.limites.containsPoint(impacto.point)
      this.destinoValido = piso && dentro && this.mundo.cabe(impacto.point, this.jugador.radio, this.jugador.altura)
      this.destino.copy(impacto.point)
      this.aro.position.copy(impacto.point).y += 0.02
    }
    const color = this.destinoValido ? 0x4fd1c5 : 0xff6b5e
    ;(this.arco.material as THREE.LineBasicMaterial).color.setHex(color)
    ;(this.aro.material as THREE.MeshBasicMaterial).color.setHex(color)
    this.hayImpacto = !!impacto
  }
}
