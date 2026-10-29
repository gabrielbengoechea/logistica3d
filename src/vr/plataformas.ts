// Plataforma de observación: un piso circular de vidrio esmerilado con baranda, flotando donde haga falta mirar
// desde arriba (la cabina de una grúa, sobre el patio, frente al buque). Se puede caminar sobre ella y la baranda
// frena: tiene su propio mundo de colisión, que se suma al de la escena.
import * as THREE from 'three'

const piso = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide })
const borde = new THREE.MeshStandardMaterial({ color: 0xffb547, roughness: 0.5, metalness: 0.3 })
const vidrio = new THREE.MeshStandardMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.18, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false })

/** Crea una plataforma con el piso en `pies` (centro) y radio en metros. */
export function crearPlataforma(pies: THREE.Vector3, radio = 2.6): THREE.Group {
  const g = new THREE.Group()
  g.name = 'plataforma-observacion'
  g.position.copy(pies)
  const disco = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, 0.08, 40), piso)
  disco.position.y = -0.04
  const aro = new THREE.Mesh(new THREE.TorusGeometry(radio, 0.035, 8, 48).rotateX(Math.PI / 2), borde)
  aro.position.y = 1.05
  const pared = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, 1.05, 40, 1, true), vidrio)
  pared.position.y = 0.525
  const filo = new THREE.Mesh(new THREE.TorusGeometry(radio, 0.05, 8, 48).rotateX(Math.PI / 2), borde)
  g.add(disco, pared, aro, filo)
  for (const m of [disco, pared, aro, filo]) m.raycast = () => undefined
  g.updateMatrixWorld(true)
  return g
}
