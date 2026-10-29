// Ficha flotante en el visor: muestra el título y los datos de lo que el jugador seleccionó con el gatillo.
import * as THREE from 'three'

const W = 1024
const H = 768

export class FichaVR {
  readonly malla: THREE.Mesh
  private canvas = document.createElement('canvas')
  private textura: THREE.CanvasTexture
  private clave = ''

  constructor() {
    this.canvas.width = W
    this.canvas.height = H
    this.textura = new THREE.CanvasTexture(this.canvas)
    this.textura.colorSpace = THREE.SRGBColorSpace
    this.malla = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, (0.72 * H) / W),
      new THREE.MeshBasicMaterial({ map: this.textura, transparent: true, depthTest: false, toneMapped: false }),
    )
    this.malla.renderOrder = 997
    this.malla.visible = false
    this.malla.userData.sinColision = true
    this.malla.raycast = () => undefined
  }

  /** Muestra la ficha frente a la cabeza, un poco abajo y a la izquierda (no tapa lo seleccionado). */
  mostrar(cabeza: THREE.Object3D, titulo: string, lineas: string[], etiqueta = '') {
    const clave = [etiqueta, titulo, ...lineas].join('\n')
    if (clave !== this.clave || !this.malla.visible) {
      const p = new THREE.Vector3()
      const d = new THREE.Vector3()
      cabeza.getWorldPosition(p)
      cabeza.getWorldDirection(d)
      d.y = 0
      if (d.lengthSq() < 1e-6) d.set(0, 0, -1)
      d.normalize()
      const izquierda = new THREE.Vector3(d.z, 0, -d.x)
      this.malla.position.copy(p).addScaledVector(d, 0.9).addScaledVector(izquierda, 0.32)
      this.malla.position.y -= 0.22
      this.malla.lookAt(p)
    }
    if (clave !== this.clave) {
      this.clave = clave
      this.dibujar(titulo, lineas, etiqueta)
    }
    this.malla.visible = true
  }

  ocultar() {
    this.malla.visible = false
  }

  private dibujar(titulo: string, lineas: string[], etiqueta: string) {
    const g = this.canvas.getContext('2d')!
    g.clearRect(0, 0, W, H)
    g.fillStyle = 'rgba(11,22,36,0.94)'
    g.strokeStyle = 'rgba(255,181,71,0.8)'
    g.lineWidth = 4
    g.beginPath()
    g.roundRect(4, 4, W - 8, H - 8, 32)
    g.fill()
    g.stroke()
    const f = 'system-ui, -apple-system, "Segoe UI", sans-serif'
    let y = 70
    g.textBaseline = 'alphabetic'
    if (etiqueta) {
      g.fillStyle = '#ffb547'
      g.font = `700 26px ${f}`
      g.fillText(etiqueta.toUpperCase(), 44, y, W - 88)
      y += 52
    }
    g.fillStyle = '#ffffff'
    g.font = `800 46px ${f}`
    g.fillText(titulo, 44, y, W - 88)
    y += 30
    g.strokeStyle = 'rgba(255,255,255,0.15)'
    g.lineWidth = 2
    for (const l of lineas) {
      if (y > H - 60) break
      const [k, v] = l.includes('\t') ? l.split('\t') : [l, '']
      y += 46
      g.font = `400 28px ${f}`
      g.fillStyle = v ? '#9fb3c8' : '#d6e0ea'
      g.textAlign = 'left'
      g.fillText(k, 44, y, v ? W * 0.5 : W - 88)
      if (v) {
        g.fillStyle = '#ffffff'
        g.font = `600 28px ${f}`
        g.textAlign = 'right'
        g.fillText(v, W - 44, y, W * 0.42)
        g.textAlign = 'left'
      }
      g.beginPath()
      g.moveTo(44, y + 14)
      g.lineTo(W - 44, y + 14)
      g.stroke()
    }
    g.fillStyle = '#9fb3c8'
    g.font = `500 22px ${f}`
    g.fillText('Gatillo en otro lugar: cerrar', 44, H - 30)
    this.textura.needsUpdate = true
  }

  dispose() {
    this.textura.dispose()
    this.malla.geometry.dispose()
    ;(this.malla.material as THREE.Material).dispose()
  }
}

/**
 * Convierte una ficha de la página (texto visible de un elemento) en título y filas para el visor.
 * Pares de definición (dt/dd) se vuelven filas «clave\tvalor»; el resto, líneas sueltas.
 */
export function fichaDesdeDOM(el: Element | null): { etiqueta: string; titulo: string; lineas: string[] } | null {
  if (!el) return null
  const filas: string[] = []
  const dts = el.querySelectorAll('dt')
  dts.forEach((dt) => {
    const dd = dt.nextElementSibling
    filas.push(`${dt.textContent?.trim() ?? ''}\t${dd?.textContent?.trim() ?? ''}`)
  })
  const texto = (el as HTMLElement).innerText ?? el.textContent ?? ''
  const sueltas = texto
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && !/^(cerrar|×)$/i.test(s))
  if (!sueltas.length) return null
  const [etiqueta, titulo] = sueltas.length > 1 ? [sueltas[0], sueltas[1]] : ['', sueltas[0]]
  const enFilas = new Set(filas.flatMap((f) => f.split('\t')))
  const resto = sueltas.slice(2).filter((s) => !enFilas.has(s) && s.length < 160)
  return { etiqueta, titulo, lineas: [...filas, ...resto.slice(0, 3)].slice(0, 12) }
}
