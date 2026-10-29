import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useEnXR } from '../vr/r3f'

const v = new THREE.Vector3()

/** Etiqueta que se oculta cuando la cámara está más lejos que maxDistance (evita amontonar textos al alejarse). */
export default function FarLabel({ position, maxDistance, children }: { position: [number, number, number]; maxDistance: number; children: ReactNode }) {
  const group = useRef<THREE.Group>(null)
  const div = useRef<HTMLDivElement>(null)
  // En el visor las etiquetas HTML no se ven y proyectarlas en cada cuadro cuesta.
  const enXR = useEnXR()
  useFrame(({ camera }) => {
    if (!group.current || !div.current) return
    group.current.getWorldPosition(v)
    div.current.style.display = camera.position.distanceTo(v) > maxDistance ? 'none' : 'block'
  })
  if (enXR) return null
  return (
    <group ref={group} position={position}>
      <Html center zIndexRange={[10, 0]}>
        <div ref={div}>{children}</div>
      </Html>
    </group>
  )
}
