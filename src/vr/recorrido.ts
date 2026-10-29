// Coordina el recorrido en el visor: arma el mundo de colisión, ubica al jugador, muestra el tutorial ilustrado
// y después maneja la locomoción, el menú del control izquierdo (gatillo izquierdo), las escenas guiadas y los
// botones Y (volver al inicio) y B (ver el tutorial de nuevo).
// Es independiente del framework: lo usan igual React Three Fiber y three.js puro.
import * as THREE from 'three'
import type { ConfigMenu, ContextoEscena, EscenaGuiada, Lugar } from './escenas'
import { estadoVR } from './estado'
import { FichaVR } from './ficha'
import { GuiaVR, callar, narrar } from './guia'
import { Jugador, type OpcionesJugador } from './jugador'
import { BOTON, LectorMandos, Locomocion, type EstadoMando } from './locomocion'
import { MenuVR } from './menu'
import { MundoColision } from './mundo'
import { crearPlataforma } from './plataformas'
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
  /** Menú del control izquierdo: tiempo, escenas guiadas, lugares y opciones de la app. */
  menu?: ConfigMenu
  /** Avisos para la app (por ejemplo para pausar o bajar la calidad). */
  alCambiar?: (estado: 'tutorial' | 'recorriendo' | 'fuera') => void
}

export class RecorridoVR {
  readonly mundo = new MundoColision()
  readonly jugador: Jugador
  readonly locomocion: Locomocion
  readonly tutorial: TutorialVR
  readonly ficha = new FichaVR()
  readonly menu: MenuVR
  readonly guia = new GuiaVR()
  readonly opciones = { narracion: true, viñeta: true }
  /** true si en este cuadro el gatillo derecho apretó un botón del menú o de la guía (la app no debe seleccionar). */
  gatilloConsumido = false
  private lector = new LectorMandos()
  private activo = false
  private _mandos: EstadoMando[] = []
  private pendiente = false
  private rayoIzq = new THREE.Ray()
  private rayoDer = new THREE.Ray()
  private rayoMenu = new THREE.Ray()
  private matIzq = new THREE.Matrix4()
  private matDer = new THREE.Matrix4()
  private plataformas = new Map<string, THREE.Object3D>()
  private ctx: ContextoEscena

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
    this.menu = new MenuVR(config.menu ?? {}, this.opciones)
    this.ctx = { irA: (l) => this.irALugar(l), tiempo: config.menu?.tiempo }
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
    this.escena.add(this.tutorial.grupo, this.ficha.malla, this.menu.malla, this.guia.malla)
    for (const p of this.plataformas.values()) this.escena.add(p)
    this.locomocion.montar(this.escena, this.cabeza)
    this.irAlInicio()
    // Ubicación definitiva y tutorial en el primer cuadro con pose de la cabeza (durante la sesión inmersiva el
    // requestAnimationFrame de la ventana no corre: todo pasa por actualizar()).
    this.pendiente = true
  }

  /** Vuelve a armar el BVH (por ejemplo si cambió el escenario). */
  reconstruirColisiones() {
    this.mundo.construir(this.config.colisionables(), { limites: this.config.limites, excluir: this.config.excluir })
    this.mundo.extras = []
    for (const p of this.plataformas.values()) this.mundo.agregar([p])
    console.info(`[vr] colisiones: ${this.mundo.triangulos} triángulos en ${this.mundo.msConstruccion.toFixed(0)} ms`)
  }

  irAlInicio() {
    this.locomocion.irA(this.rig, this.cabeza, this.config.inicio.pos, this.config.inicio.yaw)
  }

  /** Lleva al jugador a un lugar. Si es alto, arma (una vez) una plataforma de observación ahí. */
  irALugar(l: Lugar) {
    if (l.alto) {
      const clave = `${Math.round(l.pos.x)},${Math.round(l.pos.y)},${Math.round(l.pos.z)}`
      if (!this.plataformas.has(clave)) {
        const p = crearPlataforma(l.pos)
        this.plataformas.set(clave, p)
        this.escena.add(p)
        this.mundo.agregar([p])
      }
    }
    l.al?.()
    this.locomocion.irA(this.rig, this.cabeza, l.pos, l.yaw)
    this.cabeza.updateMatrixWorld(true)
  }

  verTutorial(desde = 0) {
    this.locomocion.habilitada = false
    this.ficha.ocultar()
    this.menu.cerrar()
    this.config.alCambiar?.('tutorial')
    this.cabeza.updateMatrixWorld()
    void this.tutorial.mostrar(this.cabeza, desde)
  }

  /** Arranca una escena guiada: prepara la simulación, lleva al jugador al mirador y muestra el primer paso. */
  iniciarEscena(e: EscenaGuiada) {
    this.menu.cerrar()
    this.ficha.ocultar()
    const lugar = e.preparar(this.ctx)
    this.irALugar(lugar)
    this.guia.mostrar(e, 0)
    this.irAPaso(0)
  }

  irAPaso(i: number) {
    const e = this.guia.escena
    if (!e) return
    const n = THREE.MathUtils.clamp(i, 0, e.pasos.length - 1)
    const paso = e.pasos[n]
    this.guia.paso = n
    paso.al?.(this.ctx)
    if (paso.lugar) this.irALugar(paso.lugar)
    this.guia.colocar(this.cabeza)
    this.guia.invalidar()
    if (this.opciones.narracion) narrar(`${paso.titulo ?? ''}. ${paso.texto}`)
  }

  salirDeEscena() {
    callar()
    this.guia.ocultar()
  }

  /** Atiende un botón del menú o de la guía. */
  private accion(id: string) {
    const m = this.config.menu
    if (this.menu.pestanaDe(id)) return
    const [tipo, valor] = id.split(':')
    const t = m?.tiempo
    switch (tipo) {
      case 'tiempo':
        t?.alternarPausa()
        break
      case 'vel':
        t?.fijarVelocidad(t.velocidades[Number(valor)].valor)
        break
      case 'salto':
        t?.saltar(t.saltos[Number(valor)].horas)
        break
      case 'escena': {
        const e = m?.escenas?.find((x) => x.id === valor)
        if (e) this.iniciarEscena(e)
        return
      }
      case 'lugar': {
        const l = m?.lugares?.[Number(valor)]
        if (l) {
          this.menu.cerrar()
          this.irALugar(l)
        }
        return
      }
      case 'app':
        m?.opciones?.find((o) => o.id === valor)?.accion()
        break
      case 'op':
        if (valor === 'inicio') (this.menu.cerrar(), this.salirDeEscena(), this.irAlInicio())
        else if (valor === 'tutorial') (this.salirDeEscena(), this.verTutorial(0))
        else if (valor === 'narracion') (this.opciones.narracion = !this.opciones.narracion, this.opciones.narracion || callar())
        else if (valor === 'viñeta') (this.opciones.viñeta = !this.opciones.viñeta, (this.locomocion.viñetaActiva = this.opciones.viñeta))
        else if (valor === 'salir') void this.renderer.xr.getSession()?.end()
        break
      case 'guia':
        if (valor === 'siguiente') {
          const e = this.guia.escena!
          if (this.guia.paso >= e.pasos.length - 1) this.salirDeEscena()
          else this.irAPaso(this.guia.paso + 1)
        } else if (valor === 'anterior') this.irAPaso(this.guia.paso - 1)
        else if (valor === 'repetir') this.irAPaso(this.guia.paso)
        else if (valor === 'salir') this.salirDeEscena()
        return
    }
    this.menu.invalidar()
  }

  /** Llamar en cada cuadro mientras haya sesión. Devuelve los mandos leídos (para que la app use el gatillo). */
  actualizar(dt: number): EstadoMando[] {
    if (!this.activo) return []
    estadoVR.activo = true
    this.cabeza.getWorldPosition(estadoVR.ojo)
    const mandos = (this._mandos = this.lector.leer(this.renderer.xr.getSession()))
    this.gatilloConsumido = false
    if (this.pendiente && this.renderer.xr.getFrame()) {
      this.pendiente = false
      this.irAlInicio()
      this.verTutorial(tutorialVistoEnPantalla() ? this.config.tarjetas.length - 1 : 0)
    }

    const izq = mandos.find((m) => m.mano === 'left')
    const der = mandos.find((m) => m.mano === 'right')
    if (this.tutorial.activo) {
      if (mandos.some((m) => m.flanco[BOTON.gatillo] || m.flanco[BOTON.a])) this.tutorial.siguiente()
      else if (mandos.some((m) => m.flanco[BOTON.grip])) this.tutorial.anterior()
      if (!this.tutorial.activo) this.config.alCambiar?.('recorriendo')
      this.gatilloConsumido = true
    } else {
      // Gatillo izquierdo (dedo índice): abre y cierra el menú.
      if (izq?.flanco[BOTON.gatillo]) this.menu.alternar()
      if (izq?.flanco[BOTON.b]) this.irAlInicio() // Y
      if (der?.flanco[BOTON.b]) (this.salirDeEscena(), this.verTutorial(0)) // B

      // El rayo derecho apunta al menú (si está abierto) o a la guía; el gatillo derecho aprieta el botón.
      const r = this.rayo('right')
      if (r) this.rayoMenu.copy(r)
      const rayo = r ? this.rayoMenu : null
      const enMenu = this.menu.abierto ? this.menu.apuntado(rayo) : null
      const enGuia = !enMenu && this.guia.activa ? this.guia.apuntado(rayo) : (this.guia.apuntado(null), null)
      const objetivo = enMenu ?? enGuia
      if (objetivo) {
        // Sobre un panel el gatillo nunca selecciona lo de atrás.
        if (der?.flanco[BOTON.gatillo]) {
          this.gatilloConsumido = true
          if (objetivo !== '__panel') this.accion(objetivo)
        }
      }
      this.menu.seguir(this.pose('left', true), this.cabeza, dt)
      this.guia.actualizarTextura()
    }
    // Mientras está el tutorial, el jugador queda quieto (se decide en cada cuadro, sin esperas).
    this.locomocion.habilitada = !this.tutorial.activo
    this.locomocion.actualizar(dt, mandos, this.rig, this.cabeza, this.rayo('right'))
    return mandos
  }

  /**
   * Rayo (o empuñadura, con `agarre`) del control en coordenadas de mundo, o null si no hay pose.
   * Devuelve objetos reutilizados por mano: copiarlos si se guardan.
   */
  rayo(mano: XRHandedness, agarre = false): THREE.Ray | null {
    const m = this.pose(mano, agarre)
    if (!m) return null
    const r = mano === 'left' ? this.rayoIzq : this.rayoDer
    r.origin.setFromMatrixPosition(m)
    r.direction.set(0, 0, -1).transformDirection(m)
    return r
  }

  /** Matriz de mundo del rayo o de la empuñadura del control (reutilizada). */
  pose(mano: XRHandedness, agarre = false): THREE.Matrix4 | null {
    const frame = this.renderer.xr.getFrame()
    const ref = this.renderer.xr.getReferenceSpace()
    const sesion = this.renderer.xr.getSession()
    if (!frame || !ref || !sesion) return null
    for (const fuente of sesion.inputSources) {
      if (fuente.handedness !== mano) continue
      const espacio = agarre ? (fuente.gripSpace ?? fuente.targetRaySpace) : fuente.targetRaySpace
      const pose = frame.getPose(espacio, ref)
      if (!pose) return null
      const m = mano === 'left' ? this.matIzq : this.matDer
      return m.fromArray(pose.transform.matrix).premultiply(this.rig.matrixWorld)
    }
    return null
  }

  terminar() {
    if (!this.activo) return
    this.activo = false
    estadoVR.activo = false
    callar()
    this.tutorial.cerrar()
    this.menu.cerrar()
    this.guia.ocultar()
    for (const o of [this.tutorial.grupo, this.ficha.malla, this.menu.malla, this.guia.malla, ...this.plataformas.values()]) o.removeFromParent()
    this.locomocion.desmontar()
    this.config.alCambiar?.('fuera')
  }
}
