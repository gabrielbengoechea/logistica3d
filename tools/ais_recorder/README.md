# Grabador AIS

Graba el tráfico de buques del Río de la Plata desde [aisstream.io](https://aisstream.io) (gratis, solo en vivo).
Sirve para dos cosas del plan:

1. **Hito 0:** medir si la cobertura gratuita alcanza para ver el tráfico de Montevideo (`coverage.py`).
2. **Hitos 2 y 3:** tener historial propio para el replay y para calibrar el simulador (llegadas por día, tiempo en muelle, espera en fondeadero).

## Uso

```bash
cd tools/ais_recorder
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export AISSTREAM_API_KEY=...   # clave gratuita: registrarse en aisstream.io
python record.py               # graba en data/ais/ais-AAAA-MM-DD.jsonl.gz
python coverage.py             # informe de cobertura
```

Conviene dejarlo corriendo sin parar al menos 2 semanas en una máquina que esté siempre prendida
(un servidor de UTEC, una Raspberry Pi o un VPS chico). La clave nunca va en el código ni en el navegador.
