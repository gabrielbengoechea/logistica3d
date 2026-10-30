import { useMemo } from 'react'
import * as THREE from 'three'
import { LAND_Y, YARD } from './layout'
import { ROAD_N } from './trafico/gestor'
import { BAHIAS_X, GATE_IN_X, GATE_OUT_X, Z_BOLSILLO, Z_CABINA_IN, Z_CABINA_OUT, rutasRepresentativas } from './trafico/red'
import type { Camino } from './trafico/camino'

/**
 * Señalización horizontal de la terminal, generada desde la red de tránsito: bordes de carril, flechas de sentido,
 * líneas de detención en las cabinas y en las bahías, números de carril y de bahía, velocidad máxima, numeración de
 * las filas de cada bloque del patio (A01…X10), franja de peligro de la zona de trabajo de las grúas y cruces peatonales.
 *
 * Un solo mesh: quads con UV en un atlas de glifos (canvas 1024², 8×8 casillas) y color por vértice (blanco o amarillo).
 */
const Y = LAND_Y + 0.18
const BLANCO = new THREE.Color('#f4f4f0')
const AMARILLO = new THREE.Color('#f2c230')
const GLIFOS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const T = {
  flecha: 36,
  flechaIzq: 37,
  flechaDer: 38,
  pare: 39,
  peligro: 40,
  cebra: 41,
  vel20: 42,
  salida: 43,
  entrada: 44,
  lleno: 45,
}

function atlas() {
  const c = document.createElement('canvas')
  c.width = c.height = 1024
  const g = c.getContext('2d')!
  const cell = 128
  const at = (i: number) => [(i % 8) * cell, Math.floor(i / 8) * cell] as const
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (let i = 0; i < GLIFOS.length; i++) {
    const [x, y] = at(i)
    g.font = '700 112px "Inter", Arial, sans-serif'
    g.fillText(GLIFOS[i], x + 64, y + 70)
  }
  const tile = (i: number, draw: (x: number, y: number) => void) => {
    const [x, y] = at(i)
    g.save()
    draw(x, y)
    g.restore()
  }
  const flecha = (x: number, y: number, turn: number) => {
    g.translate(x + 64, y + 64)
    g.beginPath()
    g.moveTo(-14, 60)
    g.lineTo(14, 60)
    g.lineTo(14, -10 + turn * 0)
    g.lineTo(34, -10)
    g.lineTo(0, -62)
    g.lineTo(-34, -10)
    g.lineTo(-14, -10)
    g.closePath()
    g.fill()
  }
  tile(T.flecha, (x, y) => flecha(x, y, 0))
  tile(T.flechaIzq, (x, y) => {
    g.translate(x + 64, y + 64)
    g.beginPath()
    g.moveTo(10, 60)
    g.lineTo(36, 60)
    g.lineTo(36, -10)
    g.quadraticCurveTo(36, -30, 10, -30)
    g.lineTo(-10, -30)
    g.lineTo(-10, -56)
    g.lineTo(-60, -18)
    g.lineTo(-10, 20)
    g.lineTo(-10, -6)
    g.lineTo(10, -6)
    g.closePath()
    g.fill()
  })
  tile(T.flechaDer, (x, y) => {
    g.translate(x + 64, y + 64)
    g.scale(-1, 1)
    g.beginPath()
    g.moveTo(10, 60)
    g.lineTo(36, 60)
    g.lineTo(36, -10)
    g.quadraticCurveTo(36, -30, 10, -30)
    g.lineTo(-10, -30)
    g.lineTo(-10, -56)
    g.lineTo(-60, -18)
    g.lineTo(-10, 20)
    g.lineTo(-10, -6)
    g.lineTo(10, -6)
    g.closePath()
    g.fill()
  })
  const palabra = (i: number, w: string) =>
    tile(i, (x, y) => {
      g.font = '800 46px "Inter", Arial, sans-serif'
      g.fillText(w, x + 64, y + 66, 124)
    })
  palabra(T.pare, 'PARE')
  palabra(T.salida, 'SALIDA')
  palabra(T.entrada, 'ENTRADA')
  tile(T.peligro, (x, y) => {
    g.beginPath()
    g.rect(x, y, cell, cell)
    g.clip()
    g.fillStyle = '#fff'
    g.fillRect(x, y, cell, cell)
    g.fillStyle = '#111'
    for (let k = -2; k < 4; k++) {
      g.beginPath()
      g.moveTo(x + k * 64, y + cell)
      g.lineTo(x + k * 64 + 32, y + cell)
      g.lineTo(x + k * 64 + 32 + cell, y)
      g.lineTo(x + k * 64 + cell, y)
      g.closePath()
      g.fill()
    }
  })
  tile(T.cebra, (x, y) => g.fillRect(x + 4, y + 30, 120, 68))
  tile(T.vel20, (x, y) => {
    g.strokeStyle = '#fff'
    g.lineWidth = 12
    g.beginPath()
    g.arc(x + 64, y + 64, 54, 0, Math.PI * 2)
    g.stroke()
    g.font = '800 66px "Inter", Arial, sans-serif'
    g.fillText('20', x + 64, y + 68)
  })
  tile(T.lleno, (x, y) => g.fillRect(x + 8, y + 8, 112, 112))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

class Pintura {
  pos: number[] = []
  uv: number[] = []
  col: number[] = []
  /** Quad sobre el piso: centro (x, z), rumbo h (hacia donde apunta la "arriba" del glifo), largo y ancho. */
  glifo(i: number, x: number, z: number, h: number, largo: number, ancho: number, color = BLANCO, uvRect?: [number, number, number, number]) {
    const fx = Math.cos(h)
    const fz = Math.sin(h)
    const rx = -fz
    const rz = fx
    const p = (a: number, b: number) => [x + fx * a + rx * b, Y, z + fz * a + rz * b]
    const [u0, v0, u1, v1] = uvRect ?? [(i % 8) / 8 + 0.004, 1 - (Math.floor(i / 8) + 1) / 8 + 0.004, (i % 8) / 8 + 0.121, 1 - Math.floor(i / 8) / 8 - 0.004]
    // abajo-izq, abajo-der, arriba-der, arriba-izq (arriba del glifo = adelante)
    const q = [p(-largo / 2, -ancho / 2), p(-largo / 2, ancho / 2), p(largo / 2, ancho / 2), p(largo / 2, -ancho / 2)]
    const uv = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ]
    for (const k of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(...q[k])
      this.uv.push(...uv[k])
      this.col.push(color.r, color.g, color.b)
    }
  }

  linea(ax: number, az: number, bx: number, bz: number, ancho = 0.15, color = BLANCO) {
    const L = Math.hypot(bx - ax, bz - az)
    if (L < 1e-3) return
    this.glifo(T.lleno, (ax + bx) / 2, (az + bz) / 2, Math.atan2(bz - az, bx - ax), L, ancho, color, [0.71, 0.26, 0.74, 0.29])
  }

  texto(s: string, x: number, z: number, h: number, alto: number, color = BLANCO) {
    // los caracteres se leen de izquierda a derecha mirando hacia el rumbo h
    const paso = alto * 0.72
    const rx = -Math.sin(h)
    const rz = Math.cos(h)
    const x0 = -((s.length - 1) * paso) / 2
    for (let k = 0; k < s.length; k++) {
      const i = GLIFOS.indexOf(s[k])
      if (i < 0) continue
      this.glifo(i, x + rx * (x0 + k * paso), z + rz * (x0 + k * paso), h, alto, alto * 0.8, color)
    }
  }

  geometria() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }
}

/** Bordes de carril: polilíneas desplazadas ±1,75 m del eje, sin repetir donde dos carriles comparten el borde. */
function bordes(p: Pintura, caminos: Camino[]) {
  const vistos = new Map<string, true>()
  const k = (x: number, z: number) => `${Math.round(x / 0.6)},${Math.round(z / 0.6)}`
  for (const c of caminos) {
    for (const lado of [-1.75, 1.75]) {
      let prev: [number, number] | null = null
      for (let s = 0; s <= c.len; s += 2) {
        const q = c.at(s)
        const x = q.x - Math.sin(q.h) * lado
        const z = q.z + Math.cos(q.h) * lado
        const key = k(x, z)
        if (vistos.has(key)) {
          prev = null
          continue
        }
        vistos.set(key, true)
        if (prev) p.linea(prev[0], prev[1], x, z)
        prev = [x, z]
      }
    }
  }
}

export default function Senalizacion() {
  const { geo, mat } = useMemo(() => {
    const p = new Pintura()
    const rutas = rutasRepresentativas()
    bordes(p, rutas.map((r) => r.camino))
    // flechas de sentido cada ~45 m (una por lugar)
    const puestas: [number, number][] = []
    for (const r of rutas)
      for (let s = 20; s < r.camino.len - 10; s += 45) {
        const q = r.camino.at(s)
        if (Math.abs(q.k) > 0.02) continue
        if (puestas.some(([x, z]) => Math.hypot(x - q.x, z - q.z) < 25)) continue
        puestas.push([q.x, q.z])
        p.glifo(T.flecha, q.x, q.z, q.h, 5.0, 1.8)
      }
    // portería: líneas de detención, PARE, número de carril, cebra
    GATE_IN_X.forEach((x, i) => {
      p.linea(x - 1.7, Z_CABINA_IN - 1.5, x + 1.7, Z_CABINA_IN - 1.5, 0.45)
      p.glifo(T.pare, x, Z_CABINA_IN + 6, -Math.PI / 2, 3.2, 3.2)
      p.texto(String(i + 1), x, Z_CABINA_IN + 14, -Math.PI / 2, 2.4)
      p.glifo(T.vel20, x, Z_CABINA_IN + 40, -Math.PI / 2, 3.0, 3.0)
    })
    GATE_OUT_X.forEach((x) => {
      p.linea(x - 1.7, Z_CABINA_OUT + 1.5, x + 1.7, Z_CABINA_OUT + 1.5, 0.45)
      p.glifo(T.salida, x, Z_CABINA_OUT - 8, Math.PI / 2, 3.2, 3.2)
    })
    p.glifo(T.entrada, 200, 760, -Math.PI / 2, 4, 4)
    for (let k = 0; k < 6; k++) p.glifo(T.cebra, 187 + k * 1.2, 722, 0, 1.0, 5.5)
    // bahías de intercambio: recuadro amarillo, línea de detención y número
    BAHIAS_X.forEach((x, i) => {
      const z = Z_BOLSILLO
      const [x0, x1, z0, z1] = [x - 14, x + 8, z - 1.9, z + 1.9]
      p.linea(x0, z0, x1, z0, 0.2, AMARILLO)
      p.linea(x0, z1, x1, z1, 0.2, AMARILLO)
      p.linea(x1, z0, x1, z1, 0.2, AMARILLO)
      p.linea(x - 15, z - 1.9, x - 15, z + 1.9, 0.45)
      p.texto(`B${i + 1}`, x - 4, z - 4.5, Math.PI, 2.6, AMARILLO)
    })
    // velocidad máxima en la calle de entrega
    p.glifo(T.vel20, 120, 632, Math.PI, 3.0, 3.0)
    p.glifo(T.vel20, -150, 656, 0, 3.0, 3.0)
    // patio: numeración de filas (bloque A…X, fila 01…10) en la cabecera de cada fila
    let bloque = 0
    for (const bz of YARD.blocksZ)
      for (const bx of YARD.blocksX) {
        const letra = GLIFOS[10 + (bloque++ % 26)]
        const top = bz - (YARD.bays * YARD.bay) / 2 - 2.4
        for (let r = 0; r < YARD.rows; r++) {
          const x = bx + (r - (YARD.rows - 1) / 2) * YARD.rowPitch
          p.texto(`${letra}${String(r + 1).padStart(2, '0')}`, x, top, Math.PI / 2, 1.1, AMARILLO)
        }
        p.texto(letra, bx, top - 4, -Math.PI / 2, 3.2)
      }
    // calle del muelle de los straddle carriers: 4 carriles (separadores a trazos)
    for (const z of [ROAD_N - 3, ROAD_N + 3, ROAD_N + 9])
      for (let x = -340; x < 200; x += 9) p.linea(x, z, x + 4.5, z, 0.15)
    // zona de trabajo de las grúas: franja de peligro a lo largo del muelle (lado tierra de las patas)
    for (let x = -314; x < 314; x += 2.4) p.glifo(T.peligro, x + 1.2, 37.4, 0, 2.4, 1.2)
    const geo = p.geometria()
    const map = atlas()
    const mat = new THREE.MeshStandardMaterial({
      map,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.35,
      depthWrite: false,
      roughness: 0.75,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
    return { geo, mat }
  }, [])
  return <mesh geometry={geo} material={mat} receiveShadow userData={{ sinColision: true }} renderOrder={2} />
}
