import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { useStore } from '../store'
import { useEnXR } from '../vr/r3f'
import { SHARED } from './environment'
import { getWaterNormal } from './materials'
import { shipPose } from './pose'

/**
 * Agua: velo transparente sobre la imagen satelital, con reflejo del cielo, oleaje, brillo del sol y:
 * - Reflejos dinámicos (calidad alta, fuera del visor): espejo plano a 512² que dibuja solo la capa 1 (buques y
 *   grúas del kit), con la distorsión del oleaje. En el visor y en calidad baja no se hace ese segundo render.
 * - Espuma alrededor de los cascos (hasta 8 buques): banda en la distancia al contorno del casco, más fuerte en la
 *   proa y con la velocidad (ola de proa).
 */
const MAX_BARCOS = 8

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  uniform mat4 textureMatrix;
  varying vec3 vWorld;
  varying vec4 vRefl;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vRefl = textureMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uNormal;
  uniform sampler2D tDiffuse;
  uniform float uReflejo;
  uniform float uTime;
  uniform float uNight;
  uniform float uSunIntensity;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uHorizonColor;
  uniform vec4 uBarco[${MAX_BARCOS}];   // x, z, cos(rumbo), sin(rumbo)
  uniform vec4 uBarcoDim[${MAX_BARCOS}]; // media eslora, media manga, velocidad (m/s), activo
  varying vec3 vWorld;
  varying vec4 vRefl;
  #include <common>
  #include <fog_pars_fragment>

  vec3 waveNormal(vec2 uv) { return texture2D(uNormal, uv).xyz * 2.0 - 1.0; }

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  /** Espuma: distancia al contorno del casco (rectángulo redondeado con proa en punta). */
  float espuma(vec2 p) {
    float f = 0.0;
    for (int i = 0; i < ${MAX_BARCOS}; i++) {
      vec4 b = uBarco[i];
      vec4 d = uBarcoDim[i];
      if (d.w < 0.5) continue;
      vec2 q = p - b.xy;
      // marco del buque: proa hacia +x local (rotation.y = rumbo → adelante = (cos, −sin))
      vec2 l = vec2(dot(q, vec2(b.z, -b.w)), dot(q, vec2(b.w, b.z)));
      float hl = d.x, hb = d.y;
      // la proa se afina: la manga útil baja en el último 15 %
      float fin = clamp((l.x - hl * 0.7) / (hl * 0.3), 0.0, 1.0);
      vec2 k = abs(l) - vec2(hl, hb * (1.0 - 0.85 * fin * fin));
      float dist = length(max(k, 0.0)) + min(max(k.x, k.y), 0.0);
      if (dist > 40.0) continue;
      float vel = d.z;
      float banda = smoothstep(4.0 + vel * 0.8, 0.0, dist) * (0.28 + min(vel, 8.0) * 0.08);
      float proa = smoothstep(hl * 0.6, hl, l.x) * smoothstep(10.0 + vel * 2.0, 0.0, dist) * min(vel, 8.0) * 0.12;
      float ruido = vnoise(p * 0.35 + vec2(uTime * 0.6, -uTime * 0.4)) * 0.6 + vnoise(p * 1.3 - uTime * 0.9) * 0.4;
      f = max(f, (banda + proa) * smoothstep(0.25, 0.75, ruido + 0.35 * smoothstep(3.0, 0.0, dist)));
    }
    return clamp(f, 0.0, 1.0);
  }

  void main() {
    vec2 p = vWorld.xz;
    vec3 n1 = waveNormal(p / 170.0 + vec2(uTime * 0.010, uTime * 0.006));
    vec3 n2 = waveNormal(p / 43.0 + vec2(-uTime * 0.018, uTime * 0.013));
    vec3 n3 = waveNormal(p / 950.0 + vec2(uTime * 0.002, -uTime * 0.003));
    vec3 nt = normalize(n1 * 0.45 + n2 * 0.3 + n3 * 0.12 + vec3(0.0, 0.0, 2.8));
    vec3 n = normalize(vec3(nt.x, nt.z, nt.y));
    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam);
    vec3 V = toCam / dist;
    n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(1500.0, 9000.0, dist)));

    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 R = reflect(-V, n);
    vec3 sky = mix(uHorizonColor, uSkyColor, smoothstep(0.0, 0.55, R.y));
    vec3 body = mix(vec3(0.05, 0.20, 0.27), vec3(0.015, 0.035, 0.07), uNight);
    vec3 col = mix(body, sky, fresnel);
    float refl = 0.0;
    if (uReflejo > 0.5) {
      // reflejo de buques y grúas, movido por el oleaje
      vec2 uv = vRefl.xy / vRefl.w + nt.xy * 0.035 * smoothstep(3000.0, 200.0, dist);
      vec4 r = texture2D(tDiffuse, uv);
      refl = r.a * (0.35 + 0.65 * fresnel);
      col = mix(col, r.rgb * 0.85, refl);
    }

    float sunDot = max(dot(R, uSunDir), 0.0);
    float glint = (pow(sunDot, 500.0) * 7.0 + pow(sunDot, 48.0) * 0.22) * uSunIntensity * step(0.0, uSunDir.y);
    col += uSunColor * glint;
    vec3 moon = normalize(vec3(0.35, 0.75, 0.55));
    col += vec3(0.62, 0.72, 1.0) * pow(max(dot(R, moon), 0.0), 300.0) * 2.5 * uNight;

    float foam = espuma(p) * smoothstep(4000.0, 300.0, dist);
    col = mix(col, vec3(0.92, 0.95, 0.96) * mix(1.0, 0.25, uNight), foam);

    float alpha = clamp(mix(0.36, 0.94, fresnel) + glint + foam + refl * 0.6, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

function uniformsAgua() {
  return {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uNormal: { value: null as THREE.Texture | null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: new THREE.Matrix4() },
    color: { value: new THREE.Color(0xffffff) },
    uReflejo: { value: 0 },
    uTime: SHARED.uTime,
    uNight: SHARED.uNight,
    uSunDir: SHARED.uSunDir,
    uSunColor: SHARED.uSunColor,
    uSunIntensity: SHARED.uSunIntensity,
    uSkyColor: SHARED.uSkyColor,
    uHorizonColor: SHARED.uHorizonColor,
    uBarco: { value: Array.from({ length: MAX_BARCOS }, () => new THREE.Vector4()) },
    uBarcoDim: { value: Array.from({ length: MAX_BARCOS }, () => new THREE.Vector4()) },
  }
}

export default function Water() {
  const enXR = useEnXR()
  const quality = useStore((s) => s.quality)
  const reflejo = !enXR && quality === 'alta'

  const obj = useMemo(() => {
    const geo = new THREE.PlaneGeometry(60000, 60000)
    let mesh: THREE.Mesh
    let mat: THREE.ShaderMaterial
    if (reflejo) {
      const r = new Reflector(geo, {
        textureWidth: 512,
        textureHeight: 512,
        clipBias: 0.003,
        shader: { name: 'AguaReflejo', uniforms: uniformsAgua(), vertexShader, fragmentShader },
      })
      r.camera.layers.set(1)
      mat = r.material as THREE.ShaderMaterial
      mat.uniforms.uReflejo.value = 1
      mesh = r
    } else {
      mat = new THREE.ShaderMaterial({ uniforms: uniformsAgua(), vertexShader, fragmentShader })
      mesh = new THREE.Mesh(geo, mat)
    }
    // los uniformes compartidos (tiempo, sol, cielo) se reponen: Reflector clona los uniformes
    Object.assign(mat.uniforms, {
      uTime: SHARED.uTime,
      uNight: SHARED.uNight,
      uSunDir: SHARED.uSunDir,
      uSunColor: SHARED.uSunColor,
      uSunIntensity: SHARED.uSunIntensity,
      uSkyColor: SHARED.uSkyColor,
      uHorizonColor: SHARED.uHorizonColor,
    })
    mat.uniforms.uNormal.value = getWaterNormal()
    mat.transparent = true
    mat.depthWrite = false
    mat.fog = true
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 0.4
    mesh.renderOrder = 1
    mesh.userData.sinColision = true
    return { mesh, mat }
  }, [reflejo])

  useEffect(
    () => () => {
      obj.mesh.geometry.dispose()
      ;(obj.mesh as Reflector).dispose?.()
    },
    [obj],
  )

  // buques visibles → espuma
  const prev = useMemo(() => new Map<string, { x: number; z: number; v: number }>(), [])
  useFrame((_, delta) => {
    const { tracks, t, params } = useStore.getState()
    const pos = obj.mat.uniforms.uBarco.value as THREE.Vector4[]
    const dim = obj.mat.uniforms.uBarcoDim.value as THREE.Vector4[]
    let k = 0
    for (const tr of tracks) {
      if (k >= MAX_BARCOS) break
      const p = shipPose(tr, t, params)
      if (p.phase === 'hidden') continue
      const pr = prev.get(tr.ship.id)
      const v = pr && delta > 0 ? Math.min(12, Math.hypot(p.x - pr.x, p.z - pr.z) / Math.max(delta, 1e-3) / 20) : 0
      const vs = pr ? pr.v + (v - pr.v) * Math.min(1, delta * 2) : 0
      prev.set(tr.ship.id, { x: p.x, z: p.z, v: vs })
      pos[k].set(p.x, p.z, Math.cos(p.yaw), Math.sin(p.yaw))
      dim[k].set(tr.ship.length / 2, tr.ship.beam / 2, vs, 1)
      k++
    }
    for (; k < MAX_BARCOS; k++) dim[k].w = 0
  })

  return <primitive object={obj.mesh} />
}
