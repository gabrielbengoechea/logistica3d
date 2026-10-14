# Logística 3D

Explorador 3D didáctico de la cadena logística, empezando por el puerto de Montevideo. El valor didáctico
está en el **simulador**: el alumno cambia condiciones (más buques, menos grúas, un muelle cerrado, un paro de
camiones) y ve en 3D cómo cambian las colas, la espera y el patio.

Todo es web: React, Three.js (React Three Fiber) y TypeScript. No hay servidor: la app es una página estática.

- **Mapa real:** relieve (Copernicus DEM), imagen satelital (Sentinel-2) y edificios (Overture / OpenStreetMap). En el
  centro de la ciudad, el suelo se dibuja con las calles, plazas y parques del mapa, nítido de cerca.
  La terminal está en su ubicación real y con su frente de muelle real.
- **Operación simulada:** buques, llegadas, grúas, patio y camiones salen del simulador. Por ahora no se usan
  datos reales de operación; la puerta queda abierta (ver `docs/datos-reales.md`).

## Correr

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm test     # pruebas del simulador, del motor y de las actividades
pnpm build    # build estática en dist/
pnpm zone montevideo   # regenera el mapa de la zona (descarga ~1 min de datos abiertos)
```

Se maneja con mouse o con el dedo (pizarrón): arrastrar para girar, dos dedos para desplazar, rueda o pellizco
para acercarse hacia donde se apunta, doble clic o doble toque para ir a un lugar. La cámara puede bajar casi
hasta el agua. Con teclado: WASD o flechas, Q/E para girar, R/F para subir y bajar, Shift para ir más rápido.
El botón **Mover** despliega los mismos controles en pantalla. Tocar un buque, una grúa o el patio abre su ficha.

## En clase

Ver `docs/guia-docente.md`.

- **Actividades** (panel izquierdo, Explorar): Temporada alta, Paro de camiones, Un solo turno y Llegadas con
  itinerario. Cada una cambia un solo parámetro. El alumno predice antes de simular; después ve la respuesta
  correcta (calculada con la simulación, no escrita de antemano), la explicación con los números de esa corrida
  y preguntas para discutir.
- **Recorridos guiados**: "Del río al muelle" y "La terminal por dentro". La cámara vuela entre encuadres con un
  texto corto en cada uno (flechas para avanzar, Esc para salir).
- **Presentar**: agranda la interfaz y pasa a pantalla completa para el pizarrón.

## Interfaz

Al estilo de las apps de Apple (Mapas, Ajustes): materiales claros translúcidos, listas agrupadas y la letra del
sistema. Barra lateral con el título, "Ahora" (indicadores) y "Explorar" (simulador, actividades, recorridos); la ficha
de lo que se toca en la escena aparece ahí mismo. Arriba, las vistas; a la derecha, presentar, luz y ajustes; abajo, el
reproductor. El color de los íconos se elige en Ajustes (sistema, azul, grafito, puerto o solo trazo).

## Gráficos

- La luz sigue la hora simulada: amanecer, día, atardecer y noche, con faroles, reflectores de las grúas,
  luces de navegación de los buques y ventanas de la ciudad encendidas. Se puede fijar "siempre de día".
- Sombras del sol, oclusión ambiental (sombras de contacto), brillo de las luces y suavizado.
- Agua con sombreador propio: reflejo del cielo según el ángulo, oleaje y brillo del sol o la luna.
- Estela de cada buque calculada sobre el camino que hizo: la V de Kelvin desde la proa, el agua revuelta de la
  hélice detrás de la popa y espuma animada. Las rutas redondean las esquinas, así los buques giran de a poco.
- Comparación de tamaños en mar abierto (interruptor "Comparar tamaños" y vista "Tamaños"): buques de 170, 300
  y 400 m con regla, la cancha del Centenario, una manzana del Centro, contenedores, el Palacio Salvo, la Torre
  Antel y un Post-Panamax puesto de pie.
- Operación animada: grúas de muelle, straddle carriers que llevan los contenedores entre el muelle y el patio,
  camiones, estelas, remolcadores al atracar y amarras al muelle.
- Calidad **alta**, **media** o **baja** (Ajustes, botón ⋯ arriba a la derecha). Si el equipo no da abasto, baja sola un nivel;
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
- El puerto es el real: su contorno sale de OpenStreetMap y sus partes, del plano de la ANP ("Muelles y
  Terminales"). En TCP, el Muelle de Escala (638 m, dos puestos), las 6 grúas de muelle y el uso de straddle
  carriers siguen el folleto de la ANP 2025; el muelle 3 es la ampliación de la cara oeste (730 m, en
  construcción), con trazado aproximado.
  Patio, grúas y productividad son típicos, no los de la terminal real.

## Cómo está armado

```
src/
  sim/terminalSim.ts   simulador: llegadas, fondeadero, muelles, grúas, turnos, patio y camiones
  sim/presets.ts       escenarios listos para clase
  didactic/            actividades de clase (predecir, simular, comparar) y recorridos guiados
  sim/events.ts        formato de eventos común (simulador hoy, datos reales después)
  sim/tracks.ts        recorrido de cada buque a partir de los eventos
  feeds/positions.ts   recorridos a partir de posiciones externas (la puerta para datos reales)
  scene/               escena 3D: mapa, puerto, terminal, buques, grúas, patio, straddle carriers, agua, cielo, luz, efectos
  ui/                  interfaz al estilo de las apps de Apple: barra lateral (indicadores, simulador, actividades,
                       recorridos, fichas), controles del mapa, ajustes y reproductor
public/zones/          datos de cada zona (relieve, imagen, geometría)
tools/zone/            script que genera los datos de una zona (TypeScript, corre con Node)
docs/                  guía docente, datos reales para el futuro y borradores de pedidos de datos
```

El 3D es una capa sobre los datos: el simulador escribe eventos (`arrive`, `berth`, `work-start`,
`work-end`, `depart`) y la escena solo los reproduce.

## Fuentes y licencias

- Relieve: Copernicus DEM GLO-30, © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, provisto bajo COPERNICUS por la Unión Europea y la ESA.
- Imagen: Copernicus Sentinel-2 (escena del 8 de febrero de 2026), datos abiertos de Copernicus.
- Edificios, calles, plazas y parques: Overture Maps Foundation, con datos © colaboradores de OpenStreetMap (ODbL).
- Puerto: contorno del recinto, escolleras y dique de cintura de OpenStreetMap (vía Overture). Nombres y usos de
  muelles, dársenas y terminales según el plano "Muelles y Terminales" de la ANP; datos de TCP (muelle, grúas,
  straddle carriers, ampliación) según el folleto del puerto de Montevideo 2025 de la ANP
  (https://www.anp.com.uy/es/inicio/puertos/comerciales/montevideo).

## Publicación

Cada push a `main` corre las pruebas y publica la build en GitHub Pages
(hay que activar *Settings → Pages → Source: GitHub Actions* una vez).
