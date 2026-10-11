import { Canvas } from '@react-three/fiber'
import Scene, { VIEWS } from './scene/Scene'
import { useStore } from './store'
import Hud from './ui/Hud'

const [px, py, pz] = VIEWS.terminal

export default function App() {
  const select = useStore((s) => s.select)
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#eef3f8]">
      <Canvas camera={{ position: [px, py, pz], fov: 35, near: 1, far: 20000 }} dpr={[1, 2]} onPointerMissed={() => select(null)}>
        <Scene />
      </Canvas>
      <Hud />
    </div>
  )
}
