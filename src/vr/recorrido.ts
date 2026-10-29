// Coordina el recorrido en el visor: arma el mundo de colisión, ubica al jugador, muestra el tutorial ilustrado
// y después maneja la locomoción y los botones Y (volver al inicio) y B (ver el tutorial de nuevo).
// Es independiente del framework: lo usan igual React Three Fiber y three.js puro.
import * as THREE from 'three'
import { FichaVR } from './ficha'
import { Jugador, type OpcionesJugador } from './jugador'
import { BOTON, LectorMandos, Locomocion, type EstadoMando } from './locomocion'
import { MundoColision } from './mundo'
import type { Tarjeta } from './tarjetas'
import { TutorialVR, tutorialVistoEnPantalla } from './tutorial'

export interface ConfigRecorrido {
  /** Tarjetas del tutorial (la última debería ser el resumen). */
  tarjetas: Tarjeta[]
  /** Punto de partida (pies) y hacia dónde se mira (radianes; 0 = -Z). */
  inicio: { pos: THREE.Vector3; yaw: number }
  /** Zona caminable: limita las colisiones que se calculan y los destinos de teletransporte. */
  limites: THREE.Box3
  /** Objetos con los que se choca (se recorren con sus hijos). */
  colisionables: () => THREE.Object3D[]
  excluir?: (o: THREE.Object3D) => boolean
  velocidad?: number
  jugador?: OpcionesJugador
  /** Avisos para la app (por ejemplo para pausar o bajar la calidad). */
  alCambiar?: (estado: 'tutorial' | 'recorriendo' | 'fuera') => void
}

export class RecorridoVR {
  readonly mundo = new MundoColision()
  readonly jugador: Jugador
  readonly locomocion: Locomocion
  readonly tutorial: TutorialVR
  readonly ficha = new FichaVR()
  private lector = new LectorMandos()
  private activo = false
  private _mandos: EstadoMando[] = []
  private pendiente = false

  constructor(
    private renderer: THREE.WebGLRenderer,
    private escena: THREE.Scene,
    private rig: THREE.Object3D,
    private cabeza: THREE.Camera,
    private config: ConfigRecorrido,
  ) {
    this.jugador = new Jugador(this.mundo, config.jugador)
    this.locomocion = new Locomocion(this.jugador, this.mundo, { velocidad: config.velocidad, limites: config.limites })
    this.tutorial = new TutorialVR(config.tarjetas)
  }

  get mandos() {
    return this._mandos
  }

  get enTutorial() {
    return this.tutorial.activo
  }

  /** Llamar al empezar la sesión inmersiva. */
  iniciar() {
    if (this.activo) return
    this.activo = true
    this.reconstruirColisiones()
    this.escena.add(this.tutorial.grupo, this.ficha.malla)
    this.locomocion.montar(this.escena, this.cabeza)
    this.irAlInicio()
    // Ubicación definitiva y tutorial en el primer cuadro con pose de la cabeza (durante la sesión inmersiva el
    // requestAnimationFrame de la ventana no corre: todo pasa por actualizar()).
    this.pendiente = true
  }

  /** Vuelve a armar el BVH (por ejemplo si cambió el escenario). */
  reconstruirColisiones() {
    this.mundo.construir(this.config.colisionables(), { limites: this.config.limites, excluir: this.config.excluir })
    console.info(`[vr] colisiones: ${this.mundo.triangulos} triángulos en ${this.mundo.msConstruccion.toFixed(0)} ms`)
  }

  irAlInicio() {
    this.locomocion.irA(this.rig, this.cabeza, this.config.inicio.pos, this.config.inicio.yaw)
  }

  verTutorial(desde = 0) {
    this.locomocion.habilitada = false
    this.ficha.ocultar()
    this.config.alCambiar?.('tutorial')
    this.cabeza.updateMatrixWorld()
    void this.tutorial.mostrar(this.cabeza, desde).then(() => {
      this.locomocion.habilitada = true
      this.config.alCambiar?.('recorriendo')
    })
  }

  /** Llamar en cada cuadro mientras haya sesión. Devuelve los mandos leídos (para que la app use el gatillo). */
  actualizar(dt: number): EstadoMando[] {
    if (!this.activo) return []
    const mandos = (this._mandos = this.lector.leer(this.renderer.xr.getSession()))
    if (this.pendiente && this.renderer.xr.getFrame()) {
      this.pendiente = false
      this.irAlInicio()
      this.verTutorial(tutorialVistoEnPantalla() ? this.config.tarjetas.length - 1 : 0)
    }

    if (this.tutorial.activo) {
      if (mandos.some((m) => m.flanco[BOTON.gatillo] || m.flanco[BOTON.a])) this.tutorial.siguiente()
      else if (mandos.some((m) => m.flanco[BOTON.grip])) this.tutorial.anterior()
    } else {
      const izq = mandos.find((m) => m.mano === 'left')
      const der = mandos.find((m) => m.mano === 'right')
      if (izq?.flanco[BOTON.b]) this.irAlInicio() // Y
      if (der?.flanco[BOTON.b]) this.verTutorial(0) // B
    }
    this.locomocion.actualizar(dt, mandos, this.rig, this.cabeza, this.rayo('right'))
    return mandos
  }

  /** Rayo del control en coordenadas de mundo (o null si no hay pose). */
  rayo(mano: XRHandedness): THREE.Ray | null {
    const frame = this.renderer.xr.getFrame()
    const ref = this.renderer.xr.getReferenceSpace()
    const sesion = this.renderer.xr.getSession()
    if (!frame || !ref || !sesion) return null
    for (const fuente of sesion.inputSources) {
      if (fuente.handedness !== mano) continue
      const pose = frame.getPose(fuente.targetRaySpace, ref)
      if (!pose) return null
      const m = new THREE.Matrix4().fromArray(pose.transform.matrix).premultiply(this.rig.matrixWorld)
      const origen = new THREE.Vector3().setFromMatrixPosition(m)
      const dir = new THREE.Vector3(0, 0, -1).transformDirection(m)
      return new THREE.Ray(origen, dir)
    }
    return null
  }

  terminar() {
    if (!this.activo) return
    this.activo = false
    this.tutorial.cerrar()
    this.tutorial.grupo.removeFromParent()
    this.ficha.malla.removeFromParent()
    this.locomocion.desmontar()
    this.config.alCambiar?.('fuera')
  }
}
