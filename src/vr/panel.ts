// Panel con botones dibujado en un canvas: se apunta con el rayo del control y se aprieta con el gatillo.
// Base del menú del control izquierdo y de la guía de escenas.
import * as THREE from 'three'

export interface Boton {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export const COLOR = {
  fondo: 'rgba(9,20,34,0.94)',
  borde: 'rgba(255,181,71,0.75)',
  tinta: '#f2f6fa',
  tenue: '#9fb3c8',
  acento: '#ffb547',
  acentoTinta: '#1b1204',
  boton: '#1d3248',
  botonHover: '#2c4a6a',
  activo: '#4fd1c5',
}
export const FUENTE = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export function redondeado(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

export function partir(g: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const out: string[] = []
  for (const parrafo of texto.split('\n')) {
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

const _rc = new THREE.Raycaster()
const _hits: THREE.Intersection[] = []

export abstract class PanelInteractivo {
  readonly malla: THREE.Mesh<THREE.PlaneGeometry>
  protected canvas = document.createElement('canvas')
  protected g: CanvasRenderingContext2D
  protected textura: THREE.CanvasTexture
  protected botones: Boton[] = []
  hover: string | null = null
  private sucio = true

  constructor(readonly anchoPx: number, readonly altoPx: number, anchoM: number) {
    this.canvas.width = anchoPx
    this.canvas.height = altoPx
    this.g = this.canvas.getContext('2d')!
    this.textura = new THREE.CanvasTexture(this.canvas)
    this.textura.colorSpace = THREE.SRGBColorSpace
    this.textura.anisotropy = 4
    this.malla = new THREE.Mesh(
      new THREE.PlaneGeometry(anchoM, (anchoM * altoPx) / anchoPx),
      new THREE.MeshBasicMaterial({ map: this.textura, transparent: true, depthTest: false, toneMapped: false }),
    )
    this.malla.renderOrder = 1002
    this.malla.visible = false
    this.malla.userData.sinColision = true
    // Para @react-three/xr: el panel recibe el rayo aunque no tenga eventos, así no se tocan objetos detrás.
    ;(this.malla as unknown as { pointerEvents: string }).pointerEvents = 'auto'
  }

  /** Dibuja el contenido y declara los botones (en píxeles del canvas). */
  protected abstract dibujar(g: CanvasRenderingContext2D): void

  /** Marca el panel para volver a dibujarlo en el próximo `actualizarTextura`. */
  invalidar() {
    this.sucio = true
  }

  /** Redibuja solo si algo cambió (subir la textura cuesta: no se hace en cada cuadro). */
  actualizarTextura() {
    if (!this.sucio || !this.malla.visible) return
    this.sucio = false
    this.botones = []
    this.g.clearRect(0, 0, this.anchoPx, this.altoPx)
    this.dibujar(this.g)
    this.textura.needsUpdate = true
  }

  /** Botón bajo el rayo (o null). Actualiza el resaltado. */
  apuntado(rayo: THREE.Ray | null): string | null {
    let id: string | null = null
    if (rayo && this.malla.visible) {
      _rc.ray.copy(rayo)
      _rc.far = 5
      _hits.length = 0
      this.malla.raycast(_rc, _hits)
      const uv = _hits[0]?.uv
      if (uv) {
        const px = uv.x * this.anchoPx
        const py = (1 - uv.y) * this.altoPx
        id = this.botones.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h)?.id ?? '__panel'
      }
    }
    const nuevo = id === '__panel' ? null : id
    if (nuevo !== this.hover) {
      this.hover = nuevo
      this.invalidar()
    }
    return id
  }

  /** Botón con texto centrado. `estado` = 'activo' lo pinta con el color de acento. */
  protected boton(id: string, x: number, y: number, w: number, h: number, texto: string, estado: 'normal' | 'activo' | 'primario' = 'normal', tam = 26) {
    const g = this.g
    const hover = this.hover === id
    g.fillStyle = estado === 'primario' ? COLOR.acento : estado === 'activo' ? COLOR.activo : hover ? COLOR.botonHover : COLOR.boton
    redondeado(g, x, y, w, h, 14)
    g.fill()
    if (hover) {
      g.strokeStyle = COLOR.acento
      g.lineWidth = 4
      g.stroke()
    }
    g.fillStyle = estado === 'normal' ? COLOR.tinta : COLOR.acentoTinta
    g.font = `600 ${tam}px ${FUENTE}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(texto, x + w / 2, y + h / 2 + 1, w - 16)
    g.textAlign = 'left'
    g.textBaseline = 'alphabetic'
    this.botones.push({ id, x, y, w, h })
  }

  /** Centro de un botón en coordenadas de mundo (o null si no está dibujado). Útil para pruebas y ayudas. */
  centroDe(id: string): THREE.Vector3 | null {
    const b = this.botones.find((x) => x.id === id)
    if (!b) return null
    const p = this.malla.geometry.parameters as { width: number; height: number }
    const x = ((b.x + b.w / 2) / this.anchoPx - 0.5) * p.width
    const y = (0.5 - (b.y + b.h / 2) / this.altoPx) * p.height
    this.malla.updateMatrixWorld(true)
    return this.malla.localToWorld(new THREE.Vector3(x, y, 0))
  }

  protected fondo() {
    const g = this.g
    g.fillStyle = COLOR.fondo
    redondeado(g, 3, 3, this.anchoPx - 6, this.altoPx - 6, 26)
    g.fill()
    g.strokeStyle = COLOR.borde
    g.lineWidth = 3
    g.stroke()
  }

  dispose() {
    this.textura.dispose()
    this.malla.geometry.dispose()
    ;(this.malla.material as THREE.Material).dispose()
  }
}
