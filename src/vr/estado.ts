// Estado del recorrido visible para el resto de la app sin pasar por React: si se está en el visor y dónde está
// la cabeza del jugador. Lo usan los componentes pesados para no dibujar lo que queda lejos (buques en el
// fondeadero, estelas) y así sostener 72 cuadros por segundo en el Quest 2.
import * as THREE from 'three'

export const estadoVR = {
  /** true mientras hay una sesión inmersiva. */
  activo: false,
  /** Posición de los ojos en el mundo (se actualiza en cada cuadro). */
  ojo: new THREE.Vector3(),
  /** Más allá de esta distancia (m) los objetos «lejanos» no se dibujan en el visor. */
  lejania: 2500,
}

/** En el visor, ¿está el punto (x, z) más lejos que la distancia de corte? Fuera del visor siempre es false. */
export function lejosEnVR(x: number, z: number, distancia = estadoVR.lejania): boolean {
  if (!estadoVR.activo) return false
  const dx = x - estadoVR.ojo.x
  const dz = z - estadoVR.ojo.z
  return dx * dx + dz * dz > distancia * distancia
}
