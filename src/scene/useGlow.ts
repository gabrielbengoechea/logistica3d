import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { registerFade, registerGlow } from './environment'

/** Material que se enciende de noche: brillo `day` de día y `night` de noche (con el posprocesado, > 1 destella). */
export function useGlowMaterial(color: string, day: number, night: number) {
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive: color, toneMapped: true }), [color])
  useEffect(() => registerGlow(material, day, night), [material, day, night])
  return material
}

/** Halo de luz sobre el piso: invisible de día, con opacidad `night` de noche. */
export function useHaloMaterial(texture: THREE.Texture, night: number) {
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
    [texture],
  )
  useEffect(() => registerFade(material, 0, night), [material, night])
  return material
}
