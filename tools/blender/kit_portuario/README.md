# Kit portuario (Blender 5.2 · bpy)

Activos para la terminal de Logística 3D y para Estiba. Todo se genera con estos scripts: no hay modelos hechos a mano.
Se puede volver a generar con otras medidas, colores o niveles de detalle.

| Activo | LOD0 / LOD1 / LOD2 (triángulos) | Nodos móviles (pivote = origen, eje = Z local en Blender / Y local en glTF) | Colisiones |
|---|---|---|---|
| `STS_Crane`: grúa pórtico de muelle, trocha 28 m, alcance 60 m | 5.032 / 708 / 320 (+ 320 de carro y spreader) | `Boom_Hinge` (giro de la pluma), `Trolley` (traslación), `STS_Hoist_Ropes` (escala = largo del cable), `Spreader` (baja), `Spreader_Tele_A/B` (20'/40'), `Twistlock_A1…B2` (giro de 90°) | 19 `UCX_` (patas, vigas, pórtico, pluma, sala de máquinas, bogies, carro, spreader) |
| `RTG_Crane`: grúa sobre neumáticos 6+1, 1 sobre 5 | 742 / 192 / 108 (+ 1.332 de bogies y ruedas) | `Trolley`, `Hoist_Ropes`, `Spreader`, telescópicos, twistlocks, `Bogie_FL/FR/RL/RR` (giro de 90°), `RTG_Wheel_*` | 10 `UCX_` |
| `Ship_Feeder` / `Ship_Panamax` / `Ship_PostPanamax`: 170 × 27, 262 × 32, 300 × 46 m | ~5.000 / ~1.000 / 250 | `Rudder` (mecha del timón), `Propeller` | 7 `UCX_` por buque (5 tramos de casco convexos, superestructura, bodegas) |
| `Container_20` / `Container_40` / `Container_40HC` (ISO 668) | 108 / 12 | `Socket_{tipo}_{B\|T}{1…4}`: centro de cada esquinero (ISO 1161), para encastrar pilas | `UCX_Container_*` |
| `Truck_Tractor`: tractor 6×4, cabina en 3 colores | 1.542 / 696 (+ ruedas) | `Steer_FL/FR` (dirección), `Wheel_*` (giro), `Hitch` (perno rey) | cabina y chasis |
| `Trailer_Skeletal40`: semirremolque esqueleto de 3 ejes | 346 / 250 (+ ruedas) | `Trailer_Wheel_*`, `Mount_40`, `Mount_20A/B` | cama y ejes |
| `Yard_Tractor` + `Yard_Chassis40`: tractor de patio y chasis de terminal | 280 / 196 · 60 / 80 | `Steer_*`, `Wheel_*`, `Hitch`, `Mount_40` | 1 cada uno |

Animaciones glTF: `Ciclo_Descarga` (STS, 24 s), `Ciclo_Patio` (RTG, 20 s), `Navegacion` (hélice y timón), `Rodar` (ruedas).

## Materiales: un atlas 2048² por familia

- **Industrial**: es un *trim sheet*, con tiras que se repiten a lo largo:
  - acero pintado azul, blanco, amarillo y gris, con cantos gastados, chorreaduras de óxido y suciedad;
  - persianas, rejilla, barandas y escaleras con recorte alfa;
  - franjas de peligro, vidrio, goma, galvanizado;
  - pintura de cabina en 3 colores, chasis, cromo, luces emisivas y cable de acero;
  - calcomanías: números de grúa, carteles, señales, frente del camión, puerta, matrícula y llanta.

  Dos materiales usan el mismo atlas: `M_Industrial` y `M_Industrial_Alpha` (este último para las barandas).
- **Buque**:
  - costado en 3 colores, obra viva, línea de flotación, cubierta, tapas de bodega;
  - superestructura con ventanas, vidrio del puente, chimenea, puentes de trinca, barandas, guías de celda, maquinaria y bote;
  - marcas de calado, IMO y disco de Plimsoll.

  El nombre del buque y la franja de la chimenea tienen su propio material, para que el visor los cambie por buque.
- **Contenedor**: 8 libreas de navieras inventadas, cada una en una fila de 200 px con costado de 40', costado de 20', puertas y frente.
  - La normal y la AO del corrugado (trapezoidal, paso 278 mm) se **hornean en Cycles** desde un modelo de alta resolución. Ese modelo incluye rieles, postes, barras de cierre y bisagras.
  - El visor elige la librea por instancia: corre las UV `k·200/2048` en V.

Cada atlas sale en `texturas/` como BaseColor, ORM (R = AO, G = rugosidad, B = metálico), Normal (OpenGL), Emisivo, y además Roughness y Metallic sueltos.

## Scripts

| Script | Qué hace |
|---|---|
| `construir_todo.py --out DIR [--solo sts,rtg,buque,camiones,contenedores]` | Arma todo y exporta cada activo como `.glb`, `_web.glb` (WebP), `gltf/*.gltf` y `.usdz`. También exporta los paquetes por familia para la web (`Kit_Industrial_web.glb`, `Kit_Buques_web.glb`, `Kit_Contenedores_web.glb`), `kit.blend` y `reporte.json`. |
| `hornear_atlas.py modelo.blend --destino OBJ [--origen OBJ_ALTO] --res 2048` | Re-hornea BaseColor, Normal, Metálico, Rugosidad y AO en un atlas nuevo. Junta materiales o hornea un LOD bajo desde el alto, y crea el material `M_<obj>_Atlas`. |
| `pivotes.py modelo.blend [--guardar out.blend]` | Calcula y congela los pivotes por nombre (carros, spreaders, twistlocks, direcciones, ruedas, bogies, timones, hélices) sin mover la geometría ni a los hijos. |
| `render_kit.py archivo.blend salida.png az,el,dist,tx,ty,tz` | Render de control en Cycles. |

`kit/nucleo.py` reúne lo común: constructor de mallas con UV de trim sheet, vigas, celosías, cilindros, tubos y tarjetas alfa, pivotes, colisiones convexas, materiales y exportación. Los atlas se pintan en `kit/texturas.py`.

```bash
# con el bpy de pip (Python 3.13) o con Blender 5.2:
python3 construir_todo.py --out ../../../public/modelos/kit-completo
blender -b -P construir_todo.py -- --out salida
```

La terminal usa solo los tres `Kit_*_web.glb` (3,8 MB en total). Los `.glb`, `.gltf` y `.usdz` por activo (≈ 140 MB con las texturas PNG) se generan con el script y no se guardan en el repositorio.
