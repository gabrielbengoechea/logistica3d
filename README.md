# Logística 3D

Explorador 3D didáctico de la cadena logística, empezando por el puerto de Montevideo. El valor didáctico
está en el **simulador**: el alumno cambia condiciones (más buques, menos grúas, un muelle cerrado, un paro de
camiones) y ve en 3D cómo cambian las colas, la espera y el patio.

Todo es web: React, Three.js (React Three Fiber) y TypeScript. No hay servidor: la app es una página estática.

- **Mapa real:** relieve (Copernicus DEM), imagen satelital (Sentinel-2) y edificios (Overture / OpenStreetMap).
  La terminal está en su ubicación real y con su frente de muelle real.
- **Operación simulada:** buques, llegadas, grúas, patio y camiones salen del simulador. Por ahora no se usan
  datos reales de operación; la puerta queda abierta (ver `docs/datos-reales.md`).

## Correr

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm test     # pruebas del simulador y del motor
pnpm build    # build estática en dist/
pnpm zone montevideo   # regenera el mapa de la zona (descarga ~1 min de datos abiertos)
```

Se maneja con mouse o con el dedo (pizarrón): arrastrar para girar, rueda o pellizco para el zoom,
dos dedos para desplazar. Tocar un buque, una grúa o el patio abre su ficha.

## Gráficos

- La luz sigue la hora simulada: amanecer, día, atardecer y noche, con faroles, reflectores de las grúas,
  luces de navegación de los buques y ventanas de la ciudad encendidas. Se puede fijar "siempre de día".
- Sombras del sol, oclusión ambiental (sombras de contacto), brillo de las luces y suavizado.
- Agua con sombreador propio: reflejo del cielo según el ángulo, oleaje y brillo del sol o la luna.
- Operación animada: grúas de muelle, grúas de patio (RTG), tractores que llevan contenedores al patio,
  camiones, estelas, remolcadores al atracar y amarras al muelle.
- Calidad **alta**, **media** o **baja** (barra inferior). Si el equipo no da abasto, baja sola un nivel;
  elegirla a mano la deja fija.

## El simulador

Pasos de 5 minutos, rápido de recalcular cada vez que se mueve un control. Parámetros:

| Grupo | Parámetros |
| --- | --- |
| Llegadas | buques por día, al azar o con itinerario, mezcla de clases (Feeder, Panamax, Post-Panamax) |
| Muelle y grúas | muelles (1 a 3), grúas por muelle, productividad, turnos (1, 2 o 3), tiempo de atraque y desatraque |
| Patio y camiones | altura de apilado (capacidad), permanencia media, retiro máximo en camión, ocupación inicial |
| Escenario | duración (3 a 14 días) y semana (semilla de las llegadas) |

Escenarios listos para clase: semana típica, temporada alta, muelle en obra, paro de camiones, grúas nuevas,
un solo turno y llegadas programadas. Cada uno trae su pregunta. Los resultados se comparan contra un escenario
base, en una tabla y en un gráfico hora por hora (buques esperando y ocupación del patio).

### Simplificaciones (a revisar con el perfil logístico)

- Los buques solo descargan; la carga de exportación no está modelada.
- Sin ventanas de atraque ni prioridades: el primero que llega, primero atraca.
- El frente de muelle (~630 m, dos sitios) es el real; el muelle 3 es una ampliación hipotética.
  Patio, grúas y productividad son típicos, no los de la terminal real.

## Cómo está armado

```
src/
  sim/terminalSim.ts   simulador: llegadas, fondeadero, muelles, grúas, turnos, patio y camiones
  sim/presets.ts       escenarios listos para clase
  sim/events.ts        formato de eventos común (simulador hoy, datos reales después)
  sim/tracks.ts        recorrido de cada buque a partir de los eventos
  feeds/positions.ts   recorridos a partir de posiciones externas (la puerta para datos reales)
  scene/               escena 3D: mapa, terminal, buques, grúas, patio, tractores, agua, cielo, luz del día, efectos
  ui/                  indicadores, panel del simulador, gráfico de la semana, fichas y línea de tiempo
public/zones/          datos de cada zona (relieve, imagen, geometría)
tools/zone/            script que genera los datos de una zona (TypeScript, corre con Node)
docs/                  datos reales para el futuro y borradores de pedidos de datos
```

El 3D es una capa sobre los datos: el simulador escribe eventos (`arrive`, `berth`, `work-start`,
`work-end`, `depart`) y la escena solo los reproduce.

## Fuentes y licencias

- Relieve: Copernicus DEM GLO-30, © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, provisto bajo COPERNICUS por la Unión Europea y la ESA.
- Imagen: Copernicus Sentinel-2 (escena del 8 de febrero de 2026), datos abiertos de Copernicus.
- Edificios y geometría: Overture Maps Foundation, con datos © colaboradores de OpenStreetMap (ODbL).

## Publicación

Cada push a `main` corre las pruebas y publica la build en GitHub Pages
(hay que activar *Settings → Pages → Source: GitHub Actions* una vez).
