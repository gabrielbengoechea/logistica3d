# Logística 3D

Explorador 3D didáctico de la cadena logística, empezando por el puerto de Montevideo. El valor didáctico
está en el **simulador**: el alumno cambia condiciones (más buques, menos grúas, un muelle cerrado) y ve en 3D
cómo cambian las colas, la espera y el patio.

Estado: **Hito 1 en curso.** El mapa es real: relieve (Copernicus DEM), imagen satelital (Sentinel-2) y
edificios (Overture / OpenStreetMap) del puerto de Montevideo. La terminal está en su ubicación real y con
su frente de muelle real; el patio, las grúas, los buques y la operación son simulados.

**Hito 2 en curso:** el servicio AIS (`services/ais`) ya graba, reproduce un día, muestra el vivo y mide
atraques, estadías y esperas para calibrar el simulador. Falta la clave de aisstream.io para tener datos reales;
mientras tanto se prueba con un día sintético, marcado como tal en la app.

## Correr la demo

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm test     # pruebas del simulador
pnpm build    # build estática en dist/
```

Se maneja con mouse o con el dedo (pizarrón): arrastrar para girar, rueda o pellizco para el zoom,
dos dedos para desplazar. Tocar un buque, una grúa o el patio abre su ficha.

## Cómo está armado

```
src/
  sim/terminalSim.ts   simulador básico (pasos de 5 min): llegadas, fondeadero, muelles, grúas, patio y camiones
  sim/events.ts        formato de eventos común (simulador hoy, replay AIS después)
  sim/tracks.ts        reconstruye el recorrido de cada buque a partir de los eventos
  scene/               escena 3D con React Three Fiber: mapa real, terminal, buques, grúas, patio, camiones, escalas
public/zones/          datos de cada zona generados por el pipeline (relieve, imagen, geometría)
tools/pipeline/        pipeline de zona en Python (Copernicus DEM, Sentinel-2, Overture Maps)
services/ais/          servicio AIS (FastAPI): ingesta de aisstream.io, replay, vivo y estadísticas para calibrar
  ui/                  indicadores, panel del simulador, fichas y línea de tiempo
tools/ais_recorder/    grabador e informe de cobertura AIS (Python)
docs/                  borradores de pedidos de datos a ANP y SOHMA
```

El 3D es una capa sobre los datos: el simulador escribe eventos de estado (`arrive`, `berth`, `work-start`,
`work-end`, `depart`) y el servicio AIS eventos de posición (`position`), en el mismo formato; la escena
solo los reproduce.

### Simplificaciones del simulador (a revisar con el perfil logístico)

- Los buques solo descargan; la carga de exportación no está modelada.
- Llegadas al azar (Poisson), sin ventanas de atraque ni prioridades.
- Cada contenedor queda en promedio 20 h en el patio, con un tope de camiones por hora.
- El frente de muelle (~630 m, dos sitios) es el real; el muelle 3 es una ampliación hipotética.
  Patio, grúas y productividad son típicos, no los de la terminal real.

## Fuentes y licencias

- Relieve: Copernicus DEM GLO-30, © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, provisto bajo COPERNICUS por la Unión Europea y la ESA.
- Imagen: Copernicus Sentinel-2 (escena del 8 de febrero de 2026), datos abiertos de Copernicus.
- Edificios y geometría: Overture Maps Foundation, con datos © colaboradores de OpenStreetMap (ODbL).

## Publicación

Cada push a `main` corre las pruebas y publica la build en GitHub Pages
(hay que activar *Settings → Pages → Source: GitHub Actions* una vez).
