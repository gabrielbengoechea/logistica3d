// Tutorial ilustrado. En el visor: un panel flotante delante del jugador, con el escenario oscurecido detrás
// (como en Mission:ISS). En la pantalla: una portada con las mismas imágenes antes de arrancar la app.
import * as THREE from 'three'
import { ALTO, ANCHO, dibujarTarjeta, type Tarjeta } from './tarjetas'

const ANCHO_PANEL = 1.5 // m
const DISTANCIA = 1.6 // m delante de la cabeza

/** Panel del tutorial dentro del visor. Se avanza con el gatillo (o A/X) y se retrocede con el grip. */
export class TutorialVR {
  readonly grupo = new THREE.Group()
  activo = false
  indice = 0
  private canvas = document.createElement('canvas')
  private textura: THREE.CanvasTexture
  private panel: THREE.Mesh
  private fondo: THREE.Mesh
  private alTerminar: (() => void) | null = null

  constructor(private tarjetas: Tarjeta[]) {
    this.textura = new THREE.CanvasTexture(this.canvas)
    this.textura.colorSpace = THREE.SRGBColorSpace
    this.textura.anisotropy = 4
    this.panel = new THREE.Mesh(
      new THREE.PlaneGeometry(ANCHO_PANEL, (ANCHO_PANEL * ALTO) / ANCHO),
      new THREE.MeshBasicMaterial({ map: this.textura, transparent: true, toneMapped: false, depthTest: false }),
    )
    this.panel.renderOrder = 1001
    // Esfera oscura alrededor del jugador: el escenario queda de fondo, tenue.
    this.fondo = new THREE.Mesh(
      new THREE.SphereGeometry(3, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x050b14, transparent: true, opacity: 0.88, side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false }),
    )
    this.fondo.renderOrder = 1000
    this.grupo.add(this.fondo, this.panel)
    this.grupo.visible = false
    this.grupo.userData.sinColision = true
    for (const o of [this.grupo, this.panel, this.fondo]) o.raycast = () => undefined
  }

  /** Muestra el tutorial frente a la cabeza. `desde` permite empezar en otra tarjeta (por ejemplo el resumen). */
  mostrar(cabeza: THREE.Object3D, desde = 0): Promise<void> {
    this.indice = Math.min(desde, this.tarjetas.length - 1)
    this.activo = true
    this.grupo.visible = true
    this.colocar(cabeza)
    this.dibujar()
    return new Promise((res) => (this.alTerminar = res))
  }

  /** Ubica el panel a la altura de los ojos, frente a donde mira el jugador. */
  colocar(cabeza: THREE.Object3D) {
    const p = new THREE.Vector3()
    const d = new THREE.Vector3()
    cabeza.getWorldPosition(p)
    cabeza.getWorldDirection(d) // la cámara mira hacia -Z: getWorldDirection devuelve hacia dónde mira
    d.y = 0
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1)
    d.normalize()
    // El grupo (fondo oscuro) se centra en la cabeza; el panel queda delante, a la altura de los ojos.
    this.grupo.position.copy(p)
    this.grupo.updateMatrixWorld(true)
    this.panel.position.copy(d).multiplyScalar(DISTANCIA)
    this.panel.position.y = -0.05
    // lookAt trabaja en coordenadas de mundo: mirar a la cabeza deja el frente del panel hacia el jugador.
    this.panel.lookAt(p.x, p.y - 0.05, p.z)
  }

  siguiente() {
    if (!this.activo) return
    if (this.indice < this.tarjetas.length - 1) {
      this.indice++
      this.dibujar()
    } else this.cerrar()
  }

  anterior() {
    if (!this.activo || this.indice === 0) return
    this.indice--
    this.dibujar()
  }

  cerrar() {
    this.activo = false
    this.grupo.visible = false
    const f = this.alTerminar
    this.alTerminar = null
    f?.()
  }

  private dibujar() {
    const ultimo = this.indice === this.tarjetas.length - 1
    dibujarTarjeta(this.canvas, this.tarjetas[this.indice], this.indice, this.tarjetas.length,
      ultimo ? 'Gatillo: comenzar' : 'Gatillo: siguiente · Grip: anterior')
    this.textura.needsUpdate = true
  }

  dispose() {
    this.textura.dispose()
    for (const m of [this.panel, this.fondo]) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
  }
}

export interface OpcionesPortada {
  titulo: string
  tarjetas: Tarjeta[]
  /** Se muestra solo si el navegador puede entrar en VR. */
  entrarVR?: () => void
  /** Texto del botón para seguir en la pantalla. */
  textoPantalla?: string
  alCerrar?: () => void
}

/**
 * Portada con el tutorial en imágenes, encima de la app. Devuelve una función para cerrarla.
 * Se navega con las flechas del teclado, tocando los puntos o con los botones.
 */
export function mostrarPortada(op: OpcionesPortada): () => void {
  const raiz = document.createElement('div')
  raiz.setAttribute('role', 'dialog')
  raiz.setAttribute('aria-label', `Tutorial de ${op.titulo}`)
  raiz.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(4,10,18,.82);' +
    'backdrop-filter:blur(6px);padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) ' +
    'max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));box-sizing:border-box;' +
    'font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#f2f6fa'
  const caja = document.createElement('div')
  caja.style.cssText = 'width:min(960px,100%);display:grid;gap:14px'
  const img = document.createElement('img')
  img.alt = ''
  img.style.cssText = 'width:100%;height:auto;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.5);display:block'
  const barra = document.createElement('div')
  barra.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between'
  const nav = document.createElement('div')
  nav.style.cssText = 'display:flex;gap:8px'
  const acciones = document.createElement('div')
  acciones.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'
  const boton = (texto: string, principal = false) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = texto
    b.style.cssText =
      `font:600 15px/1 system-ui,sans-serif;padding:12px 18px;border-radius:12px;cursor:pointer;border:1px solid ${principal ? '#ffb547' : '#3b4a5e'};` +
      `background:${principal ? '#ffb547' : 'transparent'};color:${principal ? '#1b1204' : '#f2f6fa'}`
    return b
  }
  const ant = boton('‹ Anterior')
  const sig = boton('Siguiente ›')
  nav.append(ant, sig)
  const pantalla = boton(op.textoPantalla ?? 'Explorar en la pantalla')
  acciones.append(pantalla)
  let vr: HTMLButtonElement | null = null
  if (op.entrarVR) {
    vr = boton('Entrar en VR', true)
    acciones.append(vr)
  }
  barra.append(nav, acciones)
  caja.append(img, barra)
  raiz.append(caja)

  const canvas = document.createElement('canvas')
  let i = 0
  const pintar = () => {
    const ultimo = i === op.tarjetas.length - 1
    dibujarTarjeta(canvas, op.tarjetas[i], i, op.tarjetas.length, ultimo ? '' : '→ siguiente')
    img.src = canvas.toDataURL('image/png')
    img.alt = `${op.tarjetas[i].titulo}. ${op.tarjetas[i].texto}`
    ant.disabled = i === 0
    ant.style.opacity = i === 0 ? '0.4' : '1'
    sig.style.display = ultimo ? 'none' : ''
  }
  const cerrar = () => {
    window.removeEventListener('keydown', teclas)
    raiz.remove()
    op.alCerrar?.()
  }
  const teclas = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' && i < op.tarjetas.length - 1) (i++, pintar())
    else if (e.key === 'ArrowLeft' && i > 0) (i--, pintar())
    else if (e.key === 'Escape') cerrar()
  }
  ant.onclick = () => i > 0 && (i--, pintar())
  sig.onclick = () => i < op.tarjetas.length - 1 && (i++, pintar())
  img.onclick = () => (i < op.tarjetas.length - 1 ? (i++, pintar()) : undefined)
  pantalla.onclick = cerrar
  if (vr) vr.onclick = () => {
    try { sessionStorage.setItem('vr-tutorial-visto', '1') } catch { /* sin almacenamiento */ }
    cerrar()
    op.entrarVR!()
  }
  window.addEventListener('keydown', teclas)
  pintar()
  document.body.append(raiz)
  sig.focus()
  return cerrar
}

/** ¿El jugador ya pasó por la portada en esta pestaña? (en el visor se arranca entonces por el resumen). */
export function tutorialVistoEnPantalla(): boolean {
  try { return sessionStorage.getItem('vr-tutorial-visto') === '1' } catch { return false }
}
