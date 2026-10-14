import * as THREE from 'three'

/**
 * Luz del día según la hora simulada. El sol sale por el este a las 6, pasa por el norte al mediodía
 * (hemisferio sur) y se pone por el oeste a las 20. Con el ciclo apagado queda fijo a media tarde.
 */
export interface DayLight {
  /** Dirección hacia el sol (normalizada; y < 0 de noche). */
  sun: THREE.Vector3
  /** 0 de día, 1 de noche cerrada. */
  night: number
  /** 0 fuera del atardecer o amanecer, 1 con el sol en el horizonte. */
  dusk: number
  sunColor: THREE.Color
  sunIntensity: number
  ambient: number
  envIntensity: number
  fog: THREE.Color
}

const SUNRISE = 6
const SUNSET = 20
const FIXED_HOUR = 15.5

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const DAY_FOG = new THREE.Color('#cfdfeb')
const DUSK_FOG = new THREE.Color('#e9c7a6')
const NIGHT_FOG = new THREE.Color('#0c1424')
const NOON_SUN = new THREE.Color('#fff4e2')
const LOW_SUN = new THREE.Color('#ff9550')

export function dayLight(t: number, cycle: boolean, out?: DayLight): DayLight {
  const h = cycle ? ((t % 24) + 24) % 24 : FIXED_HOUR
  // Fracción del arco diurno; fuera de [0, 1] el sol está bajo el horizonte.
  const f = (h - SUNRISE) / (SUNSET - SUNRISE)
  // Pasa suave por el horizonte y de noche queda unos 30° por debajo.
  const e = Math.sin(Math.PI * Math.min(1.15, Math.max(-0.15, f))) * ((68 * Math.PI) / 180)
  const az = Math.PI * Math.min(1, Math.max(0, f))
  const r = out ?? {
    sun: new THREE.Vector3(),
    night: 0,
    dusk: 0,
    sunColor: new THREE.Color(),
    sunIntensity: 0,
    ambient: 0,
    envIntensity: 0,
    fog: new THREE.Color(),
  }
  r.sun.set(Math.cos(az) * Math.cos(e), Math.sin(e), -Math.sin(az) * Math.cos(e)).normalize()
  const s = r.sun.y
  r.night = 1 - smooth(-0.12, 0.06, s)
  r.dusk = (1 - smooth(0.05, 0.3, s)) * (1 - r.night)
  r.sunColor.copy(LOW_SUN).lerp(NOON_SUN, smooth(0.02, 0.4, s))
  r.sunIntensity = 2.7 * smooth(-0.02, 0.22, s)
  r.ambient = 0.22 + 0.9 * (1 - r.night)
  r.envIntensity = 0.1 + 0.45 * (1 - r.night)
  r.fog.copy(DAY_FOG).lerp(DUSK_FOG, r.dusk * 0.8).lerp(NIGHT_FOG, r.night)
  return r
}

/**
 * Valores compartidos por los materiales con sombreador propio (agua, edificios) y por las luces que
 * se encienden de noche. Lighting los actualiza en cada cuadro.
 */
export const SHARED = {
  uNight: { value: 0 },
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color('#fff4e2') },
  uSunIntensity: { value: 1 },
  uSkyColor: { value: new THREE.Color('#9cc3dd') },
  uHorizonColor: { value: new THREE.Color('#cfdfeb') },
}

/** Materiales que brillan de noche (faroles, luces de navegación, reflectores). */
const glowing = new Set<{ material: THREE.MeshStandardMaterial; day: number; night: number }>()

export function registerGlow(material: THREE.MeshStandardMaterial, day: number, night: number) {
  const entry = { material, day, night }
  glowing.add(entry)
  material.emissiveIntensity = day
  return () => {
    glowing.delete(entry)
  }
}

/** Materiales que aparecen de noche (halos de luz en el piso). */
const fading = new Set<{ material: THREE.Material; day: number; night: number }>()

export function registerFade(material: THREE.Material, day: number, night: number) {
  const entry = { material, day, night }
  fading.add(entry)
  material.opacity = day
  return () => {
    fading.delete(entry)
  }
}

export function updateGlow(night: number) {
  for (const g of glowing) g.material.emissiveIntensity = g.day + (g.night - g.day) * night
  for (const f of fading) {
    f.material.opacity = f.day + (f.night - f.day) * night
    f.material.visible = f.material.opacity > 0.01
  }
}
