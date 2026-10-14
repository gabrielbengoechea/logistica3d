import { useMemo } from 'react'
import * as THREE from 'three'
import { SHARED } from './environment'
import { getWaterNormal } from './materials'

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uNormal;
  uniform float uTime;
  uniform float uNight;
  uniform float uSunIntensity;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uHorizonColor;
  varying vec3 vWorld;
  #include <common>
  #include <fog_pars_fragment>

  vec3 waveNormal(vec2 uv) { return texture2D(uNormal, uv).xyz * 2.0 - 1.0; }

  void main() {
    vec2 p = vWorld.xz;
    // Tres escalas de oleaje que se mueven en direcciones distintas: no se nota la repetición.
    vec3 n1 = waveNormal(p / 170.0 + vec2(uTime * 0.010, uTime * 0.006));
    vec3 n2 = waveNormal(p / 43.0 + vec2(-uTime * 0.018, uTime * 0.013));
    vec3 n3 = waveNormal(p / 950.0 + vec2(uTime * 0.002, -uTime * 0.003));
    vec3 nt = normalize(n1 * 0.45 + n2 * 0.3 + n3 * 0.12 + vec3(0.0, 0.0, 2.8));
    vec3 n = normalize(vec3(nt.x, nt.z, nt.y));
    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam);
    vec3 V = toCam / dist;
    // A lo lejos el oleaje se aplana: evita el centelleo.
    n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(1500.0, 9000.0, dist)));

    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 R = reflect(-V, n);
    vec3 sky = mix(uHorizonColor, uSkyColor, smoothstep(0.0, 0.55, R.y));
    vec3 body = mix(vec3(0.05, 0.20, 0.27), vec3(0.015, 0.035, 0.07), uNight);
    vec3 col = mix(body, sky, fresnel);

    float sunDot = max(dot(R, uSunDir), 0.0);
    float glint = (pow(sunDot, 500.0) * 7.0 + pow(sunDot, 48.0) * 0.22) * uSunIntensity * step(0.0, uSunDir.y);
    col += uSunColor * glint;
    vec3 moon = normalize(vec3(0.35, 0.75, 0.55));
    col += vec3(0.62, 0.72, 1.0) * pow(max(dot(R, moon), 0.0), 300.0) * 2.5 * uNight;

    float alpha = clamp(mix(0.36, 0.94, fresnel) + glint, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

/** Agua: velo transparente sobre la imagen satelital, con reflejo del cielo, oleaje y brillo del sol. */
export default function Water() {
  const material = useMemo(() => {
    const normal = getWaterNormal()
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uNormal: { value: normal },
        uTime: SHARED.uTime,
        uNight: SHARED.uNight,
        uSunDir: SHARED.uSunDir,
        uSunColor: SHARED.uSunColor,
        uSunIntensity: SHARED.uSunIntensity,
        uSkyColor: SHARED.uSkyColor,
        uHorizonColor: SHARED.uHorizonColor,
      },
    })
  }, [])

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.4, 0]} material={material} renderOrder={1}>
      <planeGeometry args={[60000, 60000]} />
    </mesh>
  )
}
