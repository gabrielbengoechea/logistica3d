import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getWaterNormal } from './materials'

/** Plano de agua: velo azul con oleaje suave y reflejos del cielo, sobre la imagen satelital. */
export default function Water() {
  const normal = useMemo(() => {
    const t = getWaterNormal().clone()
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(220, 220)
    t.needsUpdate = true
    return t
  }, [])

  useFrame((_, delta) => {
    normal.offset.x += delta * 0.0012
    normal.offset.y += delta * 0.0008
  })

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.4, 0]} receiveShadow>
      <planeGeometry args={[60000, 60000]} />
      <meshStandardMaterial
        color="#4d8fae"
        transparent
        opacity={0.42}
        roughness={0.16}
        metalness={0.05}
        normalMap={normal}
        normalScale={new THREE.Vector2(0.3, 0.3)}
        depthWrite={false}
      />
    </mesh>
  )
}
