import { PerformanceMonitor } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useStore, type Quality } from '../store'

const LOWER: Record<Quality, Quality> = { alta: 'media', media: 'baja', baja: 'baja' }

/**
 * Posprocesado según la calidad elegida:
 * - alta: oclusión ambiental (sombras de contacto entre contenedores, grúas y piso), brillo de luces, suavizado.
 * - media: brillo de luces y suavizado, oclusión a media resolución.
 * - baja: sin efectos (lo dibuja el renderizador directo).
 * Si el equipo no llega a una fluidez razonable, baja un nivel solo, salvo que la calidad se haya elegido a mano.
 */
export default function Effects() {
  const quality = useStore((s) => s.quality)

  const monitor = (
    <PerformanceMonitor
      flipflops={2}
      onDecline={() => {
        const { quality: q, qualityLocked, setQuality } = useStore.getState()
        if (!qualityLocked && q !== 'baja') setQuality(LOWER[q])
      }}
    />
  )

  if (quality === 'baja') return monitor
  if (quality === 'media')
    return (
      <>
        {monitor}
        <EffectComposer key="media" multisampling={0} enableNormalPass={false}>
          <N8AO aoRadius={7} distanceFalloff={1.2} intensity={1.8} halfRes quality="performance" color="#1c2433" />
          <Bloom mipmapBlur luminanceThreshold={0.92} luminanceSmoothing={0.2} intensity={0.85} radius={0.72} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette offset={0.32} darkness={0.38} />
          <SMAA />
        </EffectComposer>
      </>
    )
  return (
    <>
      {monitor}
      <EffectComposer key="alta" multisampling={4} enableNormalPass={false}>
        <N8AO aoRadius={7} distanceFalloff={1.2} intensity={2.4} quality="medium" color="#1c2433" />
        <Bloom mipmapBlur luminanceThreshold={0.92} luminanceSmoothing={0.2} intensity={0.85} radius={0.72} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.32} darkness={0.38} />
      </EffectComposer>
    </>
  )
}
