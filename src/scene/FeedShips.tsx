import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { poseAt, type PositionTrack } from '../feeds/positions'
import { useStore } from '../store'
import { ShipBody } from './Ships'

/** Buques de una fuente externa de posiciones (hoy ninguna; ver docs/datos-reales.md), a su tamaño informado. */
export default function FeedShips() {
  const tracks = useStore((s) => s.feedTracks)
  return (
    <>
      {tracks.map((tr) => (
        <FeedShip key={tr.ship.id} track={tr} />
      ))}
    </>
  )
}

function FeedShip({ track }: { track: PositionTrack }) {
  const group = useRef<THREE.Group>(null)
  const tag = useRef<HTMLDivElement>(null)
  const { id, name } = track.ship
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selection?.kind === 'feed' && s.selection.id === id)
  // Sin dimensiones informadas se dibuja un buque chico genérico.
  const length = track.ship.length ?? 60
  const beam = track.ship.beam ?? 12
  const cargoShip = (track.ship.typeCode ?? 0) >= 70 && (track.ship.typeCode ?? 0) < 80 && length > 150

  useFrame(() => {
    const pose = poseAt(track, useStore.getState().t)
    const g = group.current!
    g.visible = pose.visible
    if (tag.current) tag.current.style.display = pose.visible ? 'block' : 'none'
    if (!pose.visible) return
    g.position.set(pose.x, 0, pose.z)
    g.rotation.y = pose.yaw
  })

  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation()
        select({ kind: 'feed', id })
      }}
    >
      <ShipBody length={length} beam={beam} seed={id.length * 97} selected={selected} label={selected ? name : name.slice(0, 18)} cargo={cargoShip} tagRef={tag} />
    </group>
  )
}
