import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Environment, Lightformer, Sky } from '@react-three/drei'
import * as THREE from 'three'
import { TERMINAL } from './layout'

/** Dirección del sol: de la tarde, desde el noroeste (hemisferio sur), alto para sombras cortas. */
const SUN = new THREE.Vector3(-0.45, 0.78, -0.43).normalize()

/**
 * Cielo, reflejos y sol con sombras. Las sombras cubren la terminal (±750 m): es donde se miran de cerca.
 * Todo es procedural: no se descarga ningún mapa de entorno.
 */
export default function Lighting() {
  const sun = useRef<THREE.DirectionalLight>(null)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const light = sun.current
    if (!light) return
    light.target.position.set(TERMINAL.x, 0, TERMINAL.z)
    scene.add(light.target)
    return () => {
      scene.remove(light.target)
    }
  }, [scene])

  const pos = SUN.clone().multiplyScalar(2200).add(new THREE.Vector3(TERMINAL.x, 0, TERMINAL.z))
  return (
    <>
      <Sky distance={45000} sunPosition={SUN.toArray()} turbidity={5} rayleigh={1.1} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <fog attach="fog" args={['#cfdfeb', 7000, 32000]} />
      <hemisphereLight args={['#eaf4ff', '#9fb1c2', 1.1]} />
      <directionalLight
        ref={sun}
        position={pos.toArray()}
        intensity={2.4}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.6}
        shadow-camera-left={-750}
        shadow-camera-right={750}
        shadow-camera-top={750}
        shadow-camera-bottom={-750}
        shadow-camera-near={100}
        shadow-camera-far={5000}
      />
      <Environment resolution={128} environmentIntensity={0.55}>
        <Lightformer intensity={2} position={[0, 8, -6]} scale={[14, 4, 1]} color="#ffffff" />
        <Lightformer intensity={1.2} position={[-8, 4, 4]} scale={[8, 3, 1]} color="#dbeafe" />
        <Lightformer intensity={0.8} position={[8, 3, 2]} scale={[6, 2, 1]} color="#fff1db" />
        <Lightformer intensity={0.6} rotation-x={Math.PI / 2} position={[0, -4, 0]} scale={[20, 20, 1]} color="#93a4b5" />
      </Environment>
    </>
  )
}
