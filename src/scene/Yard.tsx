import { Suspense, useLayoutEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from '../sim/rng'
import { sampleAt } from '../sim/terminalSim'
import { useStore } from '../store'
import { yardSlots } from './layout'
import { KIT_URL, LIBREAS, mallaContenedores, usePaquete } from './kit/kit'

/**
 * Pilas de contenedores del patio con los contenedores ISO del kit: 40' y, en algunos lugares, dos de 20' en el
 * mismo espacio. Cada uno con la librea de una naviera (8 libreas en el atlas, elegidas por instancia).
 * Se muestran tantos como indique el simulador en el instante actual (se llenan por niveles, de abajo hacia arriba).
 */
export default function Yard() {
  return (
    <Suspense fallback={null}>
      <YardKit />
    </Suspense>
  )
}

function YardKit() {
  const cont = usePaquete(KIT_URL.contenedores)
  const tiers = useStore((s) => s.params.yardTiers)
  const slots = useMemo(() => yardSlots(tiers), [tiers])
  const select = useStore((s) => s.select)

  const { m40, m20, orden40, orden20 } = useMemo(() => {
    const rand = mulberry32(17)
    const doble = slots.map(() => rand() < 0.18)
    const n20 = doble.filter(Boolean).length * 2
    const m40 = mallaContenedores(cont.scene, '40', Math.max(1, slots.length - n20 / 2))
    const m20 = mallaContenedores(cont.scene, '20', Math.max(1, n20))
    // para cada posición del patio (en orden de llenado): cuántas instancias de cada malla hay hasta ahí
    const orden40 = new Int32Array(slots.length + 1)
    const orden20 = new Int32Array(slots.length + 1)
    const o = new THREE.Object3D()
    const l40 = m40.geometry.getAttribute('aLibrea') as THREE.InstancedBufferAttribute
    const l20 = m20.geometry.getAttribute('aLibrea') as THREE.InstancedBufferAttribute
    let i40 = 0
    let i20 = 0
    slots.forEach(([x, y, z], k) => {
      // el contenedor va a lo largo de la bahía (eje z del patio) y apoya en el piso o en el de abajo
      const y0 = y - 1.3
      const yaw = Math.PI / 2 + (rand() - 0.5) * 0.01
      if (doble[k]) {
        for (const dz of [-3.05, 3.05]) {
          o.position.set(x, y0, z + dz)
          o.rotation.set(0, yaw, 0)
          o.updateMatrix()
          m20.setMatrixAt(i20, o.matrix)
          l20.setX(i20++, Math.floor(rand() * LIBREAS))
        }
      } else {
        o.position.set(x, y0, z)
        o.rotation.set(0, yaw, 0)
        o.updateMatrix()
        m40.setMatrixAt(i40, o.matrix)
        l40.setX(i40++, Math.floor(rand() * LIBREAS))
      }
      orden40[k + 1] = i40
      orden20[k + 1] = i20
    })
    for (const m of [m40, m20]) {
      m.instanceMatrix.needsUpdate = true
      ;(m.geometry.getAttribute('aLibrea') as THREE.InstancedBufferAttribute).needsUpdate = true
      m.frustumCulled = false
    }
    return { m40, m20, orden40, orden20 }
  }, [slots, cont.scene])

  useLayoutEffect(() => () => {
    m40.dispose()
    m20.dispose()
  }, [m40, m20])

  useFrame(() => {
    const { result, t } = useStore.getState()
    const yard = sampleAt(result, t).yard
    const k = Math.round((yard / result.yardCapacity) * slots.length)
    m40.count = orden40[Math.min(k, slots.length)]
    m20.count = orden20[Math.min(k, slots.length)]
  })

  const click = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    select({ kind: 'yard' })
  }
  return (
    <>
      <primitive object={m40} onClick={click} />
      <primitive object={m20} onClick={click} />
    </>
  )
}
