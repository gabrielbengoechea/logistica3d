# Conectar datos reales (para más adelante)

Hoy la app usa **solo datos simulados** para la operación: buques, llegadas, grúas, patio y camiones salen
del simulador (`src/sim/terminalSim.ts`). El mapa sí es real (relieve, imagen satelital y edificios,
generados con `pnpm zone`).

La app quedó preparada para sumar posiciones reales sin tocar el motor 3D. Esta nota explica dónde va cada cosa.

## La puerta de entrada

1. **Formato de eventos común** (`src/sim/events.ts`). Una fuente real produce eventos de tipo `position`:

   ```ts
   { t: 3.25, entity: '770576100', type: 'position', pos: [x, z], data: { sog: 11.2, cog: 45, heading: 47, status: 0 } }
   ```

   `t` en horas desde el inicio del período, `pos` en metros del mapa de la zona (x al este, z al sur, origen
   y proyección en `public/zones/<zona>/zone.json`).

2. **Recorridos** (`src/feeds/positions.ts`). `buildPositionTracks(ships, events)` arma un recorrido por
   vehículo e interpola entre reportes; `poseAt(track, t)` da posición, rumbo y estado en cualquier instante.
   Si un vehículo pasa más de 20 minutos sin reportar, deja de mostrarse.

3. **Carga en la app** (`src/store.ts`). `useStore.getState().setFeed(ships, events)` y los buques aparecen
   en la escena (`src/scene/FeedShips.tsx`) a su tamaño informado, con su ficha y la opción de seguirlos.

## Fuentes posibles

| Qué | Fuente | Nota |
| --- | --- | --- |
| Buques | [aisstream.io](https://aisstream.io) (AIS en vivo, websocket) | Gratis con clave. La clave no puede ir en el navegador: hace falta un intermediario chico (por ejemplo una función *serverless* en JavaScript) que la guarde y reenvíe los mensajes. |
| Estadísticas de puertos | [IMF PortWatch](https://portwatch.imf.org/) | Tránsitos diarios por puerto y estrecho. |
| Aviones (módulo aéreo) | [OpenSky Network](https://opensky-network.org/) | ADS-B, gratis para uso académico. |
| Operación de la terminal | ANP, terminal | Ver `docs/pedidos-de-datos.md`. |

Para convertir lon/lat a metros del mapa en JavaScript: `proj4` con la proyección de `zone.json`, restando el
origen (es lo mismo que hace `tools/zone/build-zone.ts`).

## Calibrar el simulador con datos reales

Con historial AIS se pueden medir atraques por día, estadía en muelle y espera en el fondeadero, y pasarlos a
los parámetros del simulador (`shipsPerDay`, `movesPerCraneHour`, `berthingH`...). Las reglas que se probaron:
atraque = quieto (menos de 1 nudo) junto al muelle de la terminal al menos 1 hora; espera = quieto fuera de las
escolleras hasta 6 horas antes de atracar.
