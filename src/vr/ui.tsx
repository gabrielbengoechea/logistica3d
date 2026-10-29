// Botones de VR para la interfaz de la app (mismo estilo que los controles de la derecha) y aviso del modo a pie.
import { useEffect, useState } from 'react'
import { abrirPortada, entrarVR, listoVR, modoVR, useEnXR } from './r3f'
import type { Tarjeta } from './tarjetas'

const glifo = {
  vr: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v6a2.5 2.5 0 0 1-2.5 2.5h-3.2l-2-2.5h-2.6l-2 2.5H5.5A2.5 2.5 0 0 1 3 14.5z" />
      <circle cx="8" cy="11.5" r="1.6" />
      <circle cx="16" cy="11.5" r="1.6" />
    </svg>
  ),
  pie: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="13" cy="4" r="2" />
      <path d="m9 20 3-6 3 3v4M7.5 12.5 10 9l4 1 2 3M10 9l-1 5" />
    </svg>
  ),
  ayuda: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01" />
    </svg>
  ),
}

function Boton({ etiqueta, onClick, activo = false, children }: { etiqueta: string; onClick: () => void; activo?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={etiqueta} title={etiqueta} aria-pressed={activo} className={`flex h-11 w-11 items-center justify-center ${activo ? 'text-[var(--accent)]' : 'text-[var(--ink)]'} hover:bg-white/60`}>
      {children}
    </button>
  )
}

/** Entrar en VR, recorrer a pie y volver a ver el tutorial. Abre la portada al cargar la app. */
export function BotonesVR({ titulo, tarjetas, tarjetasPantalla }: { titulo: string; tarjetas: Tarjeta[]; tarjetasPantalla?: Tarjeta[] }) {
  const soporta = modoVR((s) => s.soportaVR)
  const aPie = modoVR((s) => s.aPie)
  const enXR = useEnXR()
  const [, forzar] = useState(0)

  useEffect(() => {
    let cerrar: (() => void) | null = null
    let vivo = true
    void listoVR.then(() => {
      if (vivo) cerrar = abrirPortada(titulo, tarjetasPantalla ?? tarjetas)
      forzar((n) => n + 1)
    })
    return () => {
      vivo = false
      cerrar?.()
    }
  }, [titulo, tarjetas, tarjetasPantalla])

  useEffect(() => {
    if (!aPie) return
    const salir = (e: KeyboardEvent) => e.key === 'Escape' && modoVR.setState({ aPie: false })
    window.addEventListener('keydown', salir)
    return () => window.removeEventListener('keydown', salir)
  }, [aPie])

  if (enXR) return null
  return (
    <div className="material pointer-events-auto flex flex-col overflow-hidden rounded-[13px] [&>*+*]:border-t [&>*+*]:border-[var(--separator)]">
      {soporta && (
        <Boton etiqueta="Entrar en VR (Meta Quest)" onClick={() => void entrarVR()}>
          {glifo.vr}
        </Boton>
      )}
      <Boton etiqueta={aPie ? 'Dejar de caminar (Esc)' : 'Recorrer a pie'} activo={aPie} onClick={() => modoVR.setState({ aPie: !aPie })}>
        {glifo.pie}
      </Boton>
      <Boton etiqueta="Ver el tutorial" onClick={() => abrirPortada(titulo, tarjetasPantalla ?? tarjetas)}>
        {glifo.ayuda}
      </Boton>
    </div>
  )
}

/** Aviso con los controles mientras se camina a pie en la pantalla. */
export function AvisoAPie() {
  const aPie = modoVR((s) => s.aPie)
  if (!aPie) return null
  return (
    <div className="material pointer-events-auto rounded-[13px] px-4 py-2.5 text-[13px] text-[var(--ink)]">
      <b>A pie:</b> W A S D o flechas para caminar · Shift para correr · arrastrá para mirar ·{' '}
      <button className="font-semibold text-[var(--accent)]" onClick={() => modoVR.setState({ aPie: false })}>
        Salir (Esc)
      </button>
    </div>
  )
}
