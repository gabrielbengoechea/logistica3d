# Logística 3D

Explorador 3D didáctico de la cadena logística, empezando por el puerto de Montevideo. El valor didáctico
está en el **simulador**: el alumno cambia condiciones (más buques, menos grúas, un muelle cerrado) y ve en 3D
cómo cambian las colas, la espera y el patio.

Estado: **Hito 0, demo de estilo.** La terminal es ilustrativa y todos los datos son simulados.
Los datos reales (terreno, OpenStreetMap, AIS) llegan en los hitos 1 y 2.

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
  scene/               escena 3D con React Three Fiber: terminal, buques, grúas, patio, camiones, escalas
  ui/                  indicadores, panel del simulador, fichas y línea de tiempo
tools/ais_recorder/    grabador e informe de cobertura AIS (Python)
docs/                  borradores de pedidos de datos a ANP y SOHMA
```

El 3D es una capa sobre los datos: el simulador escribe eventos (`arrive`, `berth`, `work-start`,
`work-end`, `depart`) y la escena solo los reproduce. El replay AIS va a escribir el mismo formato.

### Simplificaciones del simulador (a revisar con el perfil logístico)

- Los buques solo descargan; la carga de exportación no está modelada.
- Llegadas al azar (Poisson), sin ventanas de atraque ni prioridades.
- Cada contenedor queda en promedio 20 h en el patio, con un tope de camiones por hora.
- Medidas típicas de una terminal de contenedores, no las de la terminal real de Montevideo.

## Publicación

Cada push a `main` corre las pruebas y publica la build en GitHub Pages
(hay que activar *Settings → Pages → Source: GitHub Actions* una vez).
