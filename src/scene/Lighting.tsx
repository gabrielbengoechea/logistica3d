import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, Sky, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'
import { useEnXR } from '../vr/r3f'
import { SHARED, dayLight, updateGlow, type DayLight } from './environment'
import { TERMINAL } from './layout'

const CENTER = new THREE.Vector3(TERMINAL.x, 0, TERMINAL.z)
const MOON_DIR = new THREE.Vector3(0.35, 0.75, 0.55).normalize()
const DAY_SKY = new THREE.Color('#7fb0d6')
const NIGHT_SKY = new THREE.Color('#0a1426')
const DAY_HORIZON = new THREE.Color('#d6e5ef')
const DUSK_HORIZON = new THREE.Color('#f2b98a')
const NIGHT_HORIZON = new THREE.Color('#1a2a44')
const DAY_HEMI_SKY = new THREE.Color('#eaf4ff')
const NIGHT_HEMI_SKY = new THREE.Color('#33476b')
const DAY_HEMI_GROUND = new THREE.Color('#9fb1c2')
const NIGHT_HEMI_GROUND = new THREE.Color('#0b1220')

/**
 * Cielo, sol, luna, reflejos y niebla según la hora simulada. Las sombras cubren la terminal (±750 m),
 * que es donde se miran de cerca. Todo es procedural: no se descarga ningún mapa de entorno.
 */
export default function Lighting() {
  const sun = useRef<THREE.DirectionalLight>(null)
  const moon = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const sky = useRef<React.ComponentRef<typeof Sky>>(null)
  const stars = useRef<THREE.Points>(null)
  const scene = useThree((s) => s.scene)
  const quality = useStore((s) => s.quality)
  // En el visor el cielo se acerca para que entre en el plano lejano (el sombreador solo usa la dirección).
  const enXR = useEnXR()
  const light = useRef<DayLight | undefined>(undefined)
  const shadows = quality !== 'baja'

  // El sol apunta siempre a la terminal. Se vuelve a enganchar si la luz se recrea al cambiar la calidad.
  useEffect(() => {
    const s = sun.current
    if (!s) return
    s.target.position.copy(CENTER)
    scene.add(s.target)
    return () => {
      scene.remove(s.target)
    }
  }, [scene, shadows])

  useFrame((_, delta) => {
    const { t, dayNight } = useStore.getState()
    const d = (light.current = dayLight(t, dayNight, light.current))
    SHARED.uTime.value += delta
    SHARED.uNight.value = d.night
    SHARED.uSunDir.value.copy(d.sun)
    SHARED.uSunColor.value.copy(d.sunColor)
    SHARED.uSunIntensity.value = d.sunIntensity
    SHARED.uSkyColor.value.copy(DAY_SKY).lerp(NIGHT_SKY, d.night)
    SHARED.uHorizonColor.value.copy(DAY_HORIZON).lerp(DUSK_HORIZON, d.dusk).lerp(NIGHT_HORIZON, d.night)
    updateGlow(d.night)

    if (sun.current) {
      sun.current.position.copy(d.sun).multiplyScalar(2200).add(CENTER)
      sun.current.color.copy(d.sunColor)
      sun.current.intensity = d.sunIntensity
      sun.current.visible = d.sunIntensity > 0.01
    }
    if (moon.current) moon.current.intensity = 0.45 * d.night
    if (hemi.current) {
      hemi.current.intensity = d.ambient
      hemi.current.color.copy(DAY_HEMI_SKY).lerp(NIGHT_HEMI_SKY, d.night)
      hemi.current.groundColor.copy(DAY_HEMI_GROUND).lerp(NIGHT_HEMI_GROUND, d.night)
    }
    const mat = sky.current?.material as THREE.ShaderMaterial | undefined
    if (mat?.uniforms?.sunPosition) mat.uniforms.sunPosition.value.copy(d.sun)
    if (stars.current) stars.current.visible = d.night > 0.35
    scene.environmentIntensity = d.envIntensity
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(d.fog)
  })

  return (
    <>
      <Sky ref={sky} distance={enXR ? 9000 : 45000} turbidity={5} rayleigh={1.1} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <Stars ref={stars} radius={20000} depth={4000} count={3000} factor={60} saturation={0} fade />
      <fog attach="fog" args={['#cfdfeb', 7000, 32000]} />
      <hemisphereLight ref={hemi} args={['#eaf4ff', '#9fb1c2', 1.1]} />
      <directionalLight
        key={shadows ? 'con-sombras' : 'sin-sombras'}
        ref={sun}
        castShadow={shadows}
        shadow-mapSize={quality === 'alta' ? [4096, 4096] : [2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.6}
        shadow-camera-left={-750}
        shadow-camera-right={750}
        shadow-camera-top={750}
        shadow-camera-bottom={-750}
        shadow-camera-near={100}
        shadow-camera-far={5000}
      />
      <directionalLight ref={moon} position={MOON_DIR.clone().multiplyScalar(3000).add(CENTER).toArray()} color="#9db4ff" intensity={0} />
      <Environment resolution={128}>
        <Lightformer intensity={2} position={[0, 8, -6]} scale={[14, 4, 1]} color="#ffffff" />
        <Lightformer intensity={1.2} position={[-8, 4, 4]} scale={[8, 3, 1]} color="#dbeafe" />
        <Lightformer intensity={0.8} position={[8, 3, 2]} scale={[6, 2, 1]} color="#fff1db" />
        <Lightformer intensity={0.6} rotation-x={Math.PI / 2} position={[0, -4, 0]} scale={[20, 20, 1]} color="#93a4b5" />
      </Environment>
    </>
  )
}
