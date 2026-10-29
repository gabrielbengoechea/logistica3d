import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { XR } from '@react-three/xr'
import Scene, { VIEWS } from './scene/Scene'
import { xrStore } from './vr/r3f'
import { useStore } from './store'
import Hud from './ui/Hud'

const [px, py, pz] = VIEWS.bahia
const DPR = { alta: [1, 2], media: [1, 1.5], baja: [1, 1] } as const

export default function App() {
  const select = useStore((s) => s.select)
  const quality = useStore((s) => s.quality)
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0c1424]">
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ position: [px, py, pz], fov: 35, near: 5, far: 60000 }}
        gl={{ antialias: quality === 'baja', powerPreference: 'high-performance', stencil: false }}
        dpr={[...DPR[quality]]}
        onPointerMissed={() => select(null)}
      >
        <XR store={xrStore}>
          <Scene />
        </XR>
      </Canvas>
      <Hud />
    </div>
  )
}
