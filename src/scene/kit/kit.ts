/**
 * Kit portuario (tools/blender/kit_portuario): grúas STS y RTG, buques, contenedores, camiones.
 *
 * Se cargan tres paquetes glTF (uno por familia, cada uno con un solo juego de texturas WebP en un atlas 2048²):
 *   Kit_Industrial_web.glb   STS_Crane, RTG_Crane, Truck_Tractor, Trailer_Skeletal40, Yard_Tractor, Yard_Chassis40
 *   Kit_Buques_web.glb       Ship_Feeder, Ship_Panamax, Ship_PostPanamax
 *   Kit_Contenedores_web.glb Container_20, Container_40, Container_40HC
 *
 * Convenciones del kit (ver el README del kit):
 * - Las mallas visibles terminan en _LOD0/_LOD1/_LOD2; `Lods` muestra un solo nivel por instancia según la distancia.
 * - UCX_*: colisiones convexas. Acá se vuelven invisibles para el render pero siguen visibles para el BVH de la
 *   caminata en VR; las mallas de render se marcan `sinColision` (el mundo de colisión usa solo las UCX).
 * - Nodos móviles: su eje es el Y local (en Blender era el Z local). `ejeLocal()` da ese eje en el marco del padre.
 */
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { registerGlow } from '../environment'

const base = `${import.meta.env.BASE_URL}modelos/kit/`
export const KIT_URL = {
  industrial: `${base}Kit_Industrial_web.glb`,
  buques: `${base}Kit_Buques_web.glb`,
  contenedores: `${base}Kit_Contenedores_web.glb`,
}

/** Precarga (sin suspender) para que los modelos ya estén al abrir la terminal. */
export function precargarKit() {
  for (const u of Object.values(KIT_URL)) useGLTF.preload(u)
}

const preparados = new WeakSet<THREE.Object3D>()

/** Ajustes de una sola vez por paquete: sombras, colisiones, brillo nocturno de los emisivos. */
function preparar(scene: THREE.Object3D) {
  if (preparados.has(scene)) return
  preparados.add(scene)
  const mats = new Set<THREE.MeshStandardMaterial>()
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    if (m.name.startsWith('UCX_')) {
      m.material = COLISION
      m.castShadow = false
      m.receiveShadow = false
      return
    }
    m.userData.sinColision = true
    m.castShadow = true
    m.receiveShadow = true
    const mat = m.material as THREE.MeshStandardMaterial
    if (mat?.isMeshStandardMaterial) mats.add(mat)
  })
  for (const mat of mats) {
    if (mat.emissiveMap) registerGlow(mat, 0.12, 1.6)
    // los recortes alfa (barandas, escaleras, puentes de trinca) se dibujan de los dos lados
    if (mat.alphaTest > 0 || mat.transparent) {
      mat.transparent = false
      mat.alphaTest = 0.5
      mat.side = THREE.DoubleSide
    }
  }
}

/** Material de las colisiones: no se dibuja (colorWrite apagado) pero el objeto sigue visible para el BVH. */
export const COLISION = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, visible: false })

export function usePaquete(url: string) {
  const g = useGLTF(url)
  preparar(g.scene)
  return g
}

/** Copia de un activo del paquete (comparte geometrías y materiales). */
export function clonar(scene: THREE.Object3D, nombre: string): THREE.Object3D {
  const src = scene.getObjectByName(nombre)
  if (!src) throw new Error(`El kit no tiene ${nombre}`)
  const c = src.clone(true)
  c.position.set(0, 0, 0)
  c.quaternion.identity()
  c.updateMatrixWorld(true)
  return c
}

/** Geometría de una malla expresada en el marco de la raíz del activo (para InstancedMesh). */
export function geometriaEn(scene: THREE.Object3D, raiz: string, malla: string): THREE.BufferGeometry {
  const r = scene.getObjectByName(raiz)!
  const m = r.getObjectByName(malla) as THREE.Mesh
  if (!m) throw new Error(`El kit no tiene ${raiz}/${malla}`)
  r.updateMatrixWorld(true)
  const rel = new THREE.Matrix4().copy(r.matrixWorld).invert().multiply(m.matrixWorld)
  const g = m.geometry.clone()
  g.applyMatrix4(rel)
  return g
}

/** Matriz de un nodo respecto de la raíz del activo. */
export function matrizEn(scene: THREE.Object3D, raiz: string, nodo: string): THREE.Matrix4 {
  const r = scene.getObjectByName(raiz)!
  const n = r.getObjectByName(nodo)!
  r.updateMatrixWorld(true)
  return new THREE.Matrix4().copy(r.matrixWorld).invert().multiply(n.matrixWorld)
}

/** Eje de traslación o giro de un nodo móvil (su Y local) expresado en el marco del padre. */
export function ejeLocal(o: THREE.Object3D): THREE.Vector3 {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion)
}

// ---------------------------------------------------------------------------------------------------------------------
// LOD por instancia: muestra solo las mallas *_LOD{n} del nivel que corresponde a la distancia a la cámara
// ---------------------------------------------------------------------------------------------------------------------
export class Lods {
  private niveles: THREE.Object3D[][] = [[], [], []]
  private soloLod0: THREE.Object3D[] = []
  private actual = -1
  readonly distancias: number[]
  private _p = new THREE.Vector3()

  constructor(raiz: THREE.Object3D, distancias = [0, 200, 800], soloLod0Prefijos: string[] = []) {
    this.distancias = distancias
    raiz.traverse((o) => {
      const m = /_LOD(\d)$/.exec(o.name)
      if (m) this.niveles[Number(m[1])]?.push(o)
      else if (soloLod0Prefijos.some((p) => o.name.startsWith(p))) this.soloLod0.push(o)
    })
    this.raiz = raiz
  }

  raiz: THREE.Object3D

  /** Elige el nivel según la distancia (con histéresis del 10 %) y devuelve el nivel activo. */
  actualizar(camara: THREE.Camera, escala = 1): number {
    this.raiz.getWorldPosition(this._p)
    const d = camara.position.distanceTo(this._p) / escala
    let n = 0
    for (let i = 1; i < this.distancias.length; i++) if (d > this.distancias[i] * (n >= i || this.actual >= i ? 0.9 : 1.0)) n = i
    while (n > 0 && !this.niveles[n].length) n--
    if (n !== this.actual) {
      this.actual = n
      this.niveles.forEach((lista, i) => lista.forEach((o) => (o.visible = i === n)))
      this.soloLod0.forEach((o) => (o.visible = n === 0))
    }
    return n
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Contenedores instanciados con librea por instancia (8 navieras en filas del atlas)
// ---------------------------------------------------------------------------------------------------------------------
/** Alto de cada librea en el atlas (en UV de glTF: la librea k está corrida k·DV hacia abajo en la imagen). */
export const LIBREA_DV = 200 / 2048
export const LIBREAS = 8

const materialesLibrea = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>()

/** Copia del material del contenedor que lee el atributo de instancia `aLibrea` y corre las UV a esa fila. */
export function materialLibrea(src: THREE.Material): THREE.MeshStandardMaterial {
  const hit = materialesLibrea.get(src)
  if (hit) return hit
  const m = (src as THREE.MeshStandardMaterial).clone()
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLibrea;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        float dvL = aLibrea * ${LIBREA_DV.toFixed(6)};
        #ifdef USE_MAP
          vMapUv.y += dvL;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv.y += dvL;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv.y += dvL;
        #endif
        #ifdef USE_METALNESSMAP
          vMetalnessMapUv.y += dvL;
        #endif
        #ifdef USE_AOMAP
          vAoMapUv.y += dvL;
        #endif`,
      )
  }
  m.customProgramCacheKey = () => 'contenedor-librea'
  materialesLibrea.set(src, m)
  return m
}

/** Malla instanciada de contenedores: cada instancia lleva su librea. */
export function mallaContenedores(scene: THREE.Object3D, tipo: '20' | '40' | '40HC', capacidad: number, lod: 0 | 1 = 1) {
  const geo = geometriaEn(scene, `Container_${tipo}`, `Container_${tipo}_LOD${lod}`)
  const lib = new THREE.InstancedBufferAttribute(new Float32Array(capacidad), 1)
  lib.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('aLibrea', lib)
  const src = (scene.getObjectByName(`Container_${tipo}_LOD${lod}`) as THREE.Mesh).material as THREE.Material
  const mesh = new THREE.InstancedMesh(geo, materialLibrea(src), capacidad)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.sinColision = false
  return mesh
}

/** Medidas exteriores ISO (m): largo, ancho, alto. */
export const ISO = { '20': [6.058, 2.438, 2.591], '40': [12.192, 2.438, 2.591], '40HC': [12.192, 2.438, 2.896] } as const
