import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Track } from '../sim/tracks'
import { useStore } from '../store'
import { SHARED } from './environment'
import { shipPose } from './pose'
import { lejosEnVR } from '../vr/estado'

/** Puntos a lo largo de la estela (más puntos, curvas más suaves). */
const N = 56
/** Medio ángulo de la V de Kelvin (19,5°), algo cerrado para que se lea mejor desde arriba. */
const SPREAD = Math.tan((19.5 * Math.PI) / 180) * 0.55
const Y = 0.62

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec2 aWake;   // x: metros detrás de la proa, y: lado (-1 a 1)
  attribute float aHalf;  // medio ancho de la estela en ese punto, en metros
  varying vec2 vWake;
  varying float vHalf;
  varying vec2 vWorld;
  void main() {
    vWake = aWake;
    vHalf = aHalf;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  uniform float uTime;
  uniform float uLength;
  uniform float uShip;
  uniform float uBeam;
  uniform float uNight;
  varying vec2 vWake;
  varying float vHalf;
  varying vec2 vWorld;
  #include <common>
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.13 + 7.1) * 0.3 + noise(p * 4.7 + 3.3) * 0.15; }

  void main() {
    float d = vWake.x;
    float side = abs(vWake.y) * vHalf;     // metros desde el eje de la estela
    float edge = vHalf - side;             // metros hasta el borde de la V
    float age = clamp(d / uLength, 0.0, 1.0);
    float fade = pow(1.0 - age, 1.6);

    // Brazos de la V: espuma fina sobre el borde, que se abre y se desarma con la distancia.
    float armW = 2.0 + d * 0.022;
    float arm = exp(-pow(edge / armW, 2.0)) * pow(1.0 - age, 2.6);
    // Ondas transversales entre los brazos, apenas marcadas.
    float trans = (0.5 + 0.5 * sin(d * 0.11 - uTime * 1.6)) * smoothstep(0.0, 6.0, edge) * 0.16 * fade;
    // Agua revuelta por la hélice: desde la popa hacia atrás, del ancho del buque y cada vez más difusa.
    float behind = smoothstep(uShip - 6.0, uShip + 14.0, d);
    float washW = uBeam * 0.42 + (d - uShip) * 0.035;
    float wash = exp(-pow(side / max(washW, 1.0), 2.0)) * behind * exp(-max(d - uShip, 0.0) / (uLength * 0.45));
    // Junto al casco (de la proa a la popa), espuma de la ola de proa pegada al costado.
    float hull = (1.0 - smoothstep(uShip * 0.15, uShip, d)) * exp(-pow(edge / 3.0, 2.0)) * 0.6;

    vec2 flow = vWorld * 0.09 + vec2(uTime * 0.35, -uTime * 0.21);
    float n = fbm(flow);
    float n2 = fbm(vWorld * 0.31 - uTime * 0.5);
    float foam = arm * (0.45 + 0.9 * n2) + wash * (0.35 + 0.85 * n) + trans * n + hull * (0.5 + n2);
    foam = clamp(foam, 0.0, 1.0);

    // El agua aireada de la hélice es más clara y turquesa; la espuma, blanca.
    vec3 aerated = vec3(0.55, 0.78, 0.80);
    vec3 col = mix(aerated, vec3(1.0), smoothstep(0.25, 0.7, foam));
    col *= mix(1.0, 0.32, uNight);
    float alpha = clamp(foam * 1.1 + wash * 0.25, 0.0, 1.0) * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

interface Sample {
  x: number
  z: number
}

/**
 * Recorrido del centro del buque hacia atrás, sacado del mismo simulador: se piden posiciones en instantes
 * anteriores hasta juntar `need` metros. Funciona igual al reproducir, al pausar o al mover la línea de tiempo.
 */
function pathBehind(track: Track, t: number, params: Parameters<typeof shipPose>[2], need: number): Sample[] {
  const now = shipPose(track, t, params)
  const out: Sample[] = [{ x: now.x, z: now.z }]
  let tt = t
  let dt = 0.01
  let total = 0
  for (let i = 0; i < 260 && total < need && tt > t - 10; i++) {
    const p = shipPose(track, tt - dt, params)
    if (p.phase === 'hidden') break
    const last = out[out.length - 1]
    const step = Math.hypot(p.x - last.x, p.z - last.z)
    if (step > 18 && dt > 1e-4) {
      dt /= 2
      continue
    }
    tt -= dt
    if (step < 6) dt *= 1.7
    if (step > 0.5) {
      out.push({ x: p.x, z: p.z })
      total += step
    }
  }
  return out
}

/** Punto a una distancia s a lo largo de una polilínea (y la dirección del tramo). */
function pointAt(pts: Sample[], cum: number[], s: number): { x: number; z: number; dx: number; dz: number } {
  let i = 1
  while (i < pts.length - 1 && cum[i] < s) i++
  const a = pts[i - 1]
  const b = pts[i]
  const len = cum[i] - cum[i - 1] || 1
  const u = Math.min(1, Math.max(0, (s - cum[i - 1]) / len))
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len }
}

/**
 * Estela de un buque: una cinta sobre el agua que sigue el camino que hizo. Tiene la V de Kelvin que nace en la
 * proa y se abre hacia atrás, el agua revuelta de la hélice detrás de la popa y espuma animada.
 */
export default function Wake({ track }: { track: Track }) {
  const { length: L, beam: B } = track.ship
  const maxLen = Math.min(L * 4, 1200)
  const opacity = useRef(0)
  const mesh = useRef<THREE.Mesh>(null)

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aWake', new THREE.BufferAttribute(new Float32Array(N * 2 * 2), 2).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aHalf', new THREE.BufferAttribute(new Float32Array(N * 2), 1).setUsage(THREE.DynamicDrawUsage))
    const index: number[] = []
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
    g.setIndex(index)
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        uniforms: {
          ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
          uOpacity: { value: 0 },
          uTime: SHARED.uTime,
          uNight: SHARED.uNight,
          uLength: { value: maxLen },
          uShip: { value: L },
          uBeam: { value: B },
        },
      }),
    [maxLen, L, B],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((_, delta) => {
    const m = mesh.current!
    const { t, params } = useStore.getState()
    const pose = shipPose(track, t, params)
    // Intensidad según la maniobra: navegando, fuerte; empujado por remolcadores, apenas; quieto, nada.
    const { phase, u } = pose
    const target =
      phase === 'approaching' || phase === 'leaving' ? 1 : phase === 'berthing' ? (u < 0.7 ? 0.85 : 0.1) : phase === 'unberthing' ? (u > 0.5 ? 0.4 : 0.06) : 0
    opacity.current += (target - opacity.current) * Math.min(1, delta * 2.5)
    material.uniforms.uOpacity.value = opacity.current
    m.visible = phase !== 'hidden' && opacity.current > 0.01 && !lejosEnVR(pose.x, pose.z, 3200)
    if (!m.visible) return

    // Camino del centro hacia atrás; la estela empieza en la proa, L/2 por delante del centro.
    const back = pathBehind(track, t, params, maxLen)
    const cum = [0]
    for (let i = 1; i < back.length; i++) cum.push(cum[i - 1] + Math.hypot(back[i].x - back[i - 1].x, back[i].z - back[i - 1].z))
    const traveled = cum[cum.length - 1]
    const fx = Math.cos(pose.yaw)
    const fz = -Math.sin(pose.yaw)
    const length = Math.max(L, Math.min(maxLen, traveled + L / 2))

    const pos = geometry.attributes.position.array as Float32Array
    const wake = geometry.attributes.aWake.array as Float32Array
    const half = geometry.attributes.aHalf.array as Float32Array
    for (let i = 0; i < N; i++) {
      const d = (i / (N - 1)) * length
      const s = d - L / 2
      let x: number
      let z: number
      let dx: number
      let dz: number
      if (s <= 0 || back.length < 2) {
        // Tramo junto al casco: sobre el rumbo actual.
        x = pose.x + fx * -s
        z = pose.z + fz * -s
        dx = -fx
        dz = -fz
      } else {
        const p = pointAt(back, cum, Math.min(s, traveled))
        x = p.x
        z = p.z
        dx = p.dx
        dz = p.dz
        if (s > traveled) {
          x += dx * (s - traveled)
          z += dz * (s - traveled)
        }
      }
      const w = B * 0.56 + d * SPREAD
      // Normal al camino (a la izquierda del avance hacia atrás).
      const nx = -dz
      const nz = dx
      for (const k of [0, 1]) {
        const sign = k === 0 ? -1 : 1
        const j = i * 2 + k
        pos[j * 3] = x + nx * w * sign
        pos[j * 3 + 1] = Y
        pos[j * 3 + 2] = z + nz * w * sign
        wake[j * 2] = d
        wake[j * 2 + 1] = sign
        half[j] = w
      }
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aWake.needsUpdate = true
    geometry.attributes.aHalf.needsUpdate = true
    geometry.computeBoundingSphere()
  })

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={2} frustumCulled={false} visible={false} />
}
