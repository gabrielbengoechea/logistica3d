# Pipeline de zona

Prepara una zona para el explorador 3D y la deja en `public/zones/<zona>/`:

| Archivo | Qué es | Fuente |
| --- | --- | --- |
| `terrain.png` | Relieve en PNG con codificación Terrarium (altura = R·256 + G + B/256 − 32768 m), filas de norte a sur | Copernicus DEM GLO-30 (~30 m) |
| `imagery.jpg` | Imagen satelital color verdadero, 10 m por píxel | Copernicus Sentinel-2 L2A, una escena sin nubes |
| `vectors.json` | Edificios con altura, muelles y escolleras, calles principales, vías | Overture Maps (incluye OpenStreetMap, ODbL) |
| `zone.json` | Extensión, resolución, fuentes y archivos | — |

Todo queda en metros, en UTM 21S trasladado al origen de la zona: x hacia el este, z hacia el sur.
Las fuentes se leen directo de los buckets abiertos de AWS, bajando solo el recorte necesario.

```bash
cd tools/pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python build_zone.py montevideo                    # todo (~5 min, casi todo es Overture)
python build_zone.py montevideo terrain imagery    # solo relieve e imagen (segundos)
```

Para sumar una zona, agregarla en `ZONES` de `build_zone.py` con su recorte, el origen, la escena
Sentinel-2 (buscar una con poca nube en el bucket `sentinel-cogs`) y la hoja del DEM.
