import * as THREE from 'three'

/**
 * Texturas procedurales (se dibujan en un canvas, sin descargar nada).
 * Se crean una vez y se comparten entre todos los objetos.
 */

let containerTexture: THREE.CanvasTexture | null = null

/** Chapa corrugada de contenedor: blanco con nervaduras y bordes, para teñir con el color de cada instancia. */
export function getContainerTexture(): THREE.CanvasTexture {
  if (containerTexture) return containerTexture
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 32
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 128, 32)
  // Nervaduras verticales.
  for (let x = 2; x < 126; x += 4) {
    g.fillStyle = 'rgba(0,0,0,0.10)'
    g.fillRect(x, 2, 1.5, 28)
    g.fillStyle = 'rgba(255,255,255,0.6)'
    g.fillRect(x + 1.5, 2, 1, 28)
  }
  // Marco y esquineros.
  g.strokeStyle = 'rgba(0,0,0,0.28)'
  g.lineWidth = 2
  g.strokeRect(1, 1, 126, 30)
  g.fillStyle = 'rgba(0,0,0,0.25)'
  g.fillRect(0, 0, 4, 32)
  g.fillRect(124, 0, 4, 32)
  containerTexture = new THREE.CanvasTexture(c)
  containerTexture.colorSpace = THREE.SRGBColorSpace
  containerTexture.anisotropy = 4
  return containerTexture
}

let waterNormal: THREE.CanvasTexture | null = null

/** Mapa de normales de oleaje suave, repetible sin costuras: ruido aleatorio en varias escalas (sin patrón visible). */
export function getWaterNormal(): THREE.CanvasTexture {
  if (waterNormal) return waterNormal
  const N = 256
  const height = new Float32Array(N * N)
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  // Ruido de valor periódico: grillas de 8, 16 y 32 celdas interpoladas suavemente.
  for (const [cells, amp] of [
    [8, 1],
    [16, 0.5],
    [32, 0.25],
  ] as const) {
    const grid = Array.from({ length: cells * cells }, rand)
    const at = (i: number, j: number) => grid[((j + cells) % cells) * cells + ((i + cells) % cells)]
    const step = N / cells
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const fx = x / step
        const fy = y / step
        const i = Math.floor(fx)
        const j = Math.floor(fy)
        const u = (fx - i) * (fx - i) * (3 - 2 * (fx - i))
        const v = (fy - j) * (fy - j) * (3 - 2 * (fy - j))
        const top = at(i, j) * (1 - u) + at(i + 1, j) * u
        const bottom = at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u
        height[y * N + x] += amp * (top * (1 - v) + bottom * v)
      }
  }
  const c = document.createElement('canvas')
  c.width = N
  c.height = N
  const g = c.getContext('2d')!
  const img = g.createImageData(N, N)
  const h = (x: number, y: number) => height[((y + N) % N) * N + ((x + N) % N)]
  const n = new THREE.Vector3()
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      n.set(-(h(x + 1, y) - h(x - 1, y)) * 6, -(h(x, y + 1) - h(x, y - 1)) * 6, 1).normalize()
      const i = (y * N + x) * 4
      img.data[i] = (n.x * 0.5 + 0.5) * 255
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  g.putImageData(img, 0, 0)
  waterNormal = new THREE.CanvasTexture(c)
  waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping
  waterNormal.anisotropy = 8
  return waterNormal
}

/** Caja orientada entre dos puntos (para tensores, diagonales y brazos inclinados). */
export function strut(a: THREE.Vector3, b: THREE.Vector3, thickness: number): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a)
  const g = new THREE.BoxGeometry(thickness, dir.length(), thickness)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()))
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return g
}

/** Caja con centro y tamaño dados. */
export function box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz)
  g.translate(cx, cy, cz)
  return g
}
