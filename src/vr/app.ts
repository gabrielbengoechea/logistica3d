// Recorrido en VR de la terminal de contenedores: tutorial, punto de partida y zona caminable.
import * as THREE from 'three'
import { LAND_Y, PAD, TERMINAL, toWorld } from '../scene/layout'
import type { ConfigRecorrido } from './recorrido'
import { tarjetaResumen, tarjetasControles, type Tarjeta } from './tarjetas'

export const TITULO = 'Logística 3D · Terminal de Montevideo'

const portada: Tarjeta = {
  portada: true,
  etiqueta: 'Logística 3D · Recorrido en VR',
  titulo: 'Bienvenido a la terminal',
  texto: 'Vas a recorrer a pie la terminal de contenedores del puerto de Montevideo, en su ubicación real.',
  items: [
    'Caminá por el muelle, entre las grúas pórtico y los bloques del patio',
    'Apuntá a un buque, una grúa o el patio y apretá el gatillo para ver su ficha con los datos de la simulación',
    'Usá el teletransporte para cruzar distancias largas: la terminal mide casi 800 m',
  ],
}

const pantalla: Tarjeta = {
  etiqueta: 'Sin visor',
  titulo: 'En la computadora',
  texto:
    'Botón con el muñeco (arriba a la derecha): recorrer a pie la terminal, sin atravesar contenedores ni grúas.\n\nW A S D o flechas para caminar, Shift para correr y arrastrar para mirar. Esc para volver a la vista de siempre.',
}

const controles = tarjetasControles(
  'Apuntá con el control derecho a un buque, una grúa o un bloque del patio y apretá el gatillo: aparece su ficha con lo que pasa en la simulación.\n\nApretá el gatillo en el agua o en el cielo para cerrarla.',
)
const resumen = tarjetaResumen('ficha de buques, grúas y patio')

export const TARJETAS: Tarjeta[] = [portada, ...controles, resumen]
export const TARJETAS_PANTALLA: Tarjeta[] = [portada, pantalla, ...controles, resumen]

/** Zona de la terminal (con el muelle y un margen de agua para poder caer y volver) en el marco del mapa. */
function limites(): THREE.Box3 {
  const [x0, x1, z0, z1] = PAD
  const caja = new THREE.Box3()
  for (const [x, z] of [
    [x0 - 40, z0 - 70],
    [x1 + 140, z0 - 70],
    [x0 - 40, z1 + 40],
    [x1 + 140, z1 + 40],
  ]) {
    const [wx, wz] = toWorld(x, z)
    caja.expandByPoint(new THREE.Vector3(wx, -15, wz))
    caja.expandByPoint(new THREE.Vector3(wx, 110, wz))
  }
  return caja
}

export function configRecorrido(...raices: React.RefObject<THREE.Object3D | null>[]): ConfigRecorrido {
  const [x, z] = toWorld(40, 120)
  return {
    tarjetas: TARJETAS,
    // En la explanada del muelle, detrás de las grúas, mirando hacia el agua.
    inicio: { pos: new THREE.Vector3(x, LAND_Y + 1, z), yaw: TERMINAL.yaw },
    limites: limites(),
    colisionables: () => raices.map((r) => r.current).filter((o): o is THREE.Object3D => o !== null),
    excluir: (o) => 'isSky' in o || (o as THREE.Points).isPoints === true || (o as THREE.Line).isLine === true,
    velocidad: 3,
  }
}
