// Mundo de colisión: junta en una sola malla (en coordenadas de mundo) los triángulos de los objetos que se pueden
// tocar y arma un BVH con three-mesh-bvh. El jugador es una cápsula que se resuelve contra esos triángulos, así
// las paredes con puertas, las estanterías y los camiones bloquean el paso con su forma real.
// Las piezas que se suman después (plataformas de observación) van en BVH chicos aparte: no hace falta rehacer todo.
import * as THREE from 'three'
import { MeshBVH, type ExtendedTriangle } from 'three-mesh-bvh'

export interface OpcionesMundo {
  /** Solo se incluyen triángulos que tocan esta caja (zona caminable con margen). */
  limites?: THREE.Box3
  /** Devuelve true para dejar afuera un objeto y todo lo que cuelga de él. */
  excluir?: (o: THREE.Object3D) => boolean
  /** Tope de triángulos para no trabar el visor (se avisa en consola si se alcanza). */
  maxTriangulos?: number
}

const _v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
const _m = new THREE.Matrix4()
const _mi = new THREE.Matrix4()
const _caja = new THREE.Box3()
const _tri = new THREE.Box3()
// Reutilizados en cada consulta (rayos y cápsula se usan muchas veces por cuadro).
const _rayo = new THREE.Ray()
const _cajaCap = new THREE.Box3()
const _enTri = new THREE.Vector3()
const _enSeg = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _segCabe = new THREE.Line3()
const _antes = new THREE.Vector3()

/** Recorre los objetos y arma un BVH con sus triángulos en coordenadas de mundo. */
function armarBVH(raices: THREE.Object3D[], op: OpcionesMundo): { bvh: MeshBVH; n: number } {
  const max = op.maxTriangulos ?? 600_000
  let datos = new Float32Array(9 * 4096)
  let n = 0
  const agregar = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    if (op.limites) {
      _tri.makeEmpty().expandByPoint(a).expandByPoint(b).expandByPoint(c)
      if (!_tri.intersectsBox(op.limites)) return
    }
    if (n + 9 > datos.length) {
      const mas = new Float32Array(datos.length * 2)
      mas.set(datos)
      datos = mas
    }
    datos[n++] = a.x; datos[n++] = a.y; datos[n++] = a.z
    datos[n++] = b.x; datos[n++] = b.y; datos[n++] = b.z
    datos[n++] = c.x; datos[n++] = c.y; datos[n++] = c.z
  }

  const malla = (mesh: THREE.Mesh, mundo: THREE.Matrix4) => {
    const geo = mesh.geometry as THREE.BufferGeometry
    const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) return
    if (op.limites) {
      if (!geo.boundingBox) geo.computeBoundingBox()
      _caja.copy(geo.boundingBox!).applyMatrix4(mundo)
      if (!_caja.intersectsBox(op.limites)) return
    }
    const idx = geo.index
    const total = idx ? idx.count : pos.count
    const inicio = geo.drawRange.start
    const fin = Math.min(total, inicio + geo.drawRange.count)
    for (let i = inicio; i + 2 < fin; i += 3) {
      if (n / 9 >= max) return
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getX(i + k) : i + k
        _v[k].fromBufferAttribute(pos, vi).applyMatrix4(mundo)
      }
      agregar(_v[0], _v[1], _v[2])
    }
  }

  const visitar = (o: THREE.Object3D) => {
    if (!o.visible || o.userData.sinColision || op.excluir?.(o)) return
    const m = o as THREE.Mesh
    if (m.isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) {
      const inst = o as THREE.InstancedMesh
      if (inst.isInstancedMesh) {
        for (let i = 0; i < inst.count; i++) {
          inst.getMatrixAt(i, _mi)
          _m.multiplyMatrices(inst.matrixWorld, _mi)
          malla(inst, _m)
        }
      } else malla(m, m.matrixWorld)
    }
    for (const h of o.children) visitar(h)
  }
  for (const r of raices) {
    r.updateWorldMatrix(true, true)
    visitar(r)
  }

  if (n / 9 >= max) console.warn(`[vr] mundo de colisión recortado a ${max} triángulos`)
  const geometria = new THREE.BufferGeometry()
  geometria.setAttribute('position', new THREE.BufferAttribute(datos.slice(0, Math.max(n, 9)), 3))
  if (n === 0) geometria.setDrawRange(0, 0)
  return { bvh: new MeshBVH(geometria, { targetLeafSize: 8 }), n: n / 9 }
}

export class MundoColision {
  bvh: MeshBVH | null = null
  /** Piezas agregadas después (plataformas de observación). */
  extras: MeshBVH[] = []
  triangulos = 0
  msConstruccion = 0
  private _lista: MeshBVH[] = []

  /** Arma el BVH a partir de los objetos dados. Respeta `visible` y `userData.sinColision`. */
  construir(raices: THREE.Object3D[], op: OpcionesMundo = {}) {
    const t0 = performance.now()
    const { bvh, n } = armarBVH(raices, op)
    this.bvh = bvh
    this.triangulos = n
    this.msConstruccion = performance.now() - t0
    return this
  }

  /** Suma objetos al mundo sin rehacer lo que ya estaba (barato para piezas chicas). */
  agregar(raices: THREE.Object3D[]) {
    const { bvh, n } = armarBVH(raices, {})
    if (n > 0) this.extras.push(bvh)
  }

  private lista(): MeshBVH[] {
    const l = this._lista
    l.length = 0
    if (this.bvh && this.triangulos > 0) l.push(this.bvh)
    for (const e of this.extras) l.push(e)
    return l
  }

  /** Primer impacto de un rayo en el mundo (o null). */
  rayo(origen: THREE.Vector3, direccion: THREE.Vector3, lejos = Infinity): THREE.Intersection | null {
    _rayo.origin.copy(origen)
    _rayo.direction.copy(direccion)
    let mejor: THREE.Intersection | null = null
    for (const b of this.lista()) {
      const hit = b.raycastFirst(_rayo, THREE.DoubleSide, 0, lejos) as THREE.Intersection | null
      if (hit && hit.distance <= lejos && (!mejor || hit.distance < mejor.distance)) mejor = hit
    }
    return mejor
  }

  /**
   * Empuja el segmento de la cápsula (radio dado) fuera de todos los triángulos que lo tocan.
   * Modifica `segmento` y devuelve true si hubo contacto.
   */
  resolverCapsula(segmento: THREE.Line3, radio: number): boolean {
    let toca = false
    const enTri = _enTri
    const enSeg = _enSeg
    const dir = _dir
    for (const b of this.lista()) {
      // Dos pasadas: la segunda corrige lo que la primera empujó contra otra cara (esquinas).
      for (let pasada = 0; pasada < 2; pasada++) {
        const caja = _cajaCap.makeEmpty().expandByPoint(segmento.start).expandByPoint(segmento.end)
        caja.min.addScalar(-radio)
        caja.max.addScalar(radio)
        b.shapecast({
          intersectsBounds: (bb: THREE.Box3) => bb.intersectsBox(caja),
          intersectsTriangle: (tri: ExtendedTriangle) => {
            const d = tri.closestPointToSegment(segmento, enTri, enSeg)
            if (d < radio) {
              const prof = radio - d
              if (d > 1e-6) dir.subVectors(enSeg, enTri).divideScalar(d)
              else tri.getNormal(dir)
              segmento.start.addScaledVector(dir, prof)
              segmento.end.addScaledVector(dir, prof)
              toca = true
            }
            return false
          },
        })
      }
    }
    return toca
  }

  /** ¿Entra una cápsula parada en `pies` sin tocar nada? (para validar el teletransporte). */
  cabe(pies: THREE.Vector3, radio: number, altura: number): boolean {
    const seg = _segCabe
    seg.start.set(pies.x, pies.y + radio + 0.05, pies.z)
    seg.end.set(pies.x, pies.y + altura - radio, pies.z)
    const antes = _antes.copy(seg.start)
    this.resolverCapsula(seg, radio * 0.9)
    return seg.start.distanceToSquared(antes) < 0.0004
  }
}
