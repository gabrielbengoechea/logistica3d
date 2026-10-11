# Servicio AIS

Recibe posiciones de buques desde [aisstream.io](https://aisstream.io), las guarda y se las sirve a la app
en el formato de eventos común (`src/sim/events.ts`), con las coordenadas en metros del mapa de la zona.

| Ruta | Qué devuelve |
| --- | --- |
| `GET /api/health` | Estado, rango de datos guardados, si graba en vivo y si los datos son sintéticos |
| `GET /api/days` | Días con datos (hora de Montevideo) y cantidad de posiciones |
| `GET /api/replay?date=AAAA-MM-DD` | Buques (con eslora y manga del propio AIS) y eventos de posición del día |
| `GET /api/stats?start=…&end=…` | Calibración del simulador: atraques por día, estadía en muelle, espera en fondeadero |
| `GET /api/live/snapshot` | Última posición de cada buque en los últimos 20 minutos |
| `WS /api/live` | Cada posición nueva, apenas llega |

## Correr

```bash
cd services/ais
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export AISSTREAM_API_KEY=...          # sin clave, sirve lo que haya en la base pero no graba
uvicorn ais.server:main_app --factory --port 8000
```

Y la app, apuntando al servicio: `http://localhost:5173/?ais=http://localhost:8000`
(o `VITE_AIS_API=http://localhost:8000 pnpm dev`). En el panel de la derecha aparecen
**Simulación · AIS día · AIS vivo**.

## Probar sin clave

```bash
python -m ais.synthetic --date 2026-10-10 --out data/synthetic.jsonl.gz
python -m ais.importer data/synthetic.jsonl.gz --synthetic
```

Genera un día de mensajes con el formato exacto de aisstream: cinco portacontenedores que fondean, atracan
en la terminal y zarpan, y tres buques que cruzan el río. **No son datos reales**: la base queda marcada
como sintética y la app lo muestra en rojo.

Los archivos del grabador (`tools/ais_recorder`) también se importan: `python -m ais.importer ruta/*.jsonl.gz`.

## Cómo se calculan las estadísticas

- **Atraque en la terminal:** el buque está quieto (menos de 1 nudo) en la franja de agua junto al muelle
  al menos 1 hora. Un hueco de datos de más de 2 horas corta la estadía.
- **Espera en el fondeadero:** estuvo quieto fuera de las escolleras y lo dejó hasta 6 horas antes de atracar.
- Las estadías que siguen abiertas al final de los datos se cuentan como atraque pero no entran en la
  estadía media.

Pruebas: `python -m pytest`.
