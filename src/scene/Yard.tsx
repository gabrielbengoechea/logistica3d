import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sampleAt } from '../sim/terminalSim'
import { useStore } from '../store'
import { CONTAINER_COLORS, yardSlots } from './layout'
import { getContainerTexture } from './materials'

/** Pilas de contenedores del patio: se muestran tantos como indique el simulador en el instante actual. */
export default function Yard() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const tiers = useStore((s) => s.params.yardTiers)
  const slots = useMemo(() => yardSlots(tiers), [tiers])
  const select = useStore((s) => s.select)

  useLayoutEffect(() => {
    const mesh = ref.current!
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    slots.forEach(([x, y, z, color], i) => {
      o.position.set(x, y, z)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      mesh.setColorAt(i, c.set(CONTAINER_COLORS[color]))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    ;(mesh.material as THREE.Material).needsUpdate = true
  }, [slots])

  useFrame(() => {
    const { result, t } = useStore.getState()
    const yard = sampleAt(result, t).yard
    ref.current!.count = Math.round((yard / result.yardCapacity) * slots.length)
  })

  return (
    <instancedMesh
      key={slots.length}
      ref={ref}
      args={[undefined, undefined, slots.length]}
      frustumCulled={false}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation()
        select({ kind: 'yard' })
      }}
    >
      <boxGeometry args={[2.44, 2.5, 12.19]} />
      <meshStandardMaterial map={getContainerTexture()} roughness={0.75} />
    </instancedMesh>
  )
}
