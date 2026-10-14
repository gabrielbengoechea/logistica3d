# Guía docente

Logística 3D muestra el puerto de Montevideo sobre el mapa real, con una terminal de contenedores **simulada**. Las cosas que hay que tener claras:

- La ubicación, el relieve, la imagen satelital, los edificios y el frente del muelle son reales.
- Los buques, las grúas, el patio y los números de operación salen de un simulador.

El valor didáctico está en **cambiar una cosa y ver qué pasa en toda la cadena**.

Esta guía cubre los dos recorridos guiados y las cuatro actividades de clase. Todo funciona en el navegador, sin instalar nada.

## Antes de la clase

- Abrí la página en la computadora que va al proyector. Si la animación va a tirones, bajá la **Calidad** (abajo a la derecha) a *Media* o *Baja*.
- **Presentar** (arriba a la izquierda) agranda la interfaz y pasa a pantalla completa, para leer desde el fondo del aula.
- **Luz → Siempre de día** es más fácil de ver con proyector. *Según la hora* muestra la noche, que sirve para hablar de los turnos.

## Recorridos guiados (5 minutos cada uno)

Están arriba a la izquierda, en **Recorridos**. La cámara vuela sola de un punto a otro con un texto corto en cada uno. Avanzan cada 9 segundos; con **Auto** se pausa el avance, y también se puede ir y volver con las flechas del teclado. **Esc** termina el recorrido.

| Recorrido | Pasos | Para qué sirve |
| --- | --- | --- |
| **Del río al muelle** | Río de la Plata, canal de acceso, fondeadero, boca entre escolleras, terminal, puerto y ciudad | Ubicar el puerto y entender por qué un buque no llega directo al muelle |
| **La terminal por dentro** | Muelle, grúas pórtico, tractores, patio y RTG, portería, todo junto | Presentar la cadena buque → grúa → tractor → patio → camión antes de las actividades |

Conviene hacer los dos recorridos al principio de la primera clase.

## Actividades (15 minutos cada una)

Están en el panel de la derecha, en la pestaña **Actividades**. Todas siguen el mismo esquema:

1. **Contexto y pregunta.** Se lee en voz alta.
2. **Predicción.** Cada estudiante (o grupo) elige una opción *antes* de simular. El botón *Simular* no se habilita sin una predicción.
3. **Simular.** Se corren 14 días con el cambio y se comparan con 14 días de la terminal en condiciones normales, con las mismas llegadas. La escena 3D reproduce la corrida: con el reloj en 4 o 12 h/s se ve cómo se forma la cola en el fondeadero.
4. **Resultado.** Muestra la opción correcta, la explicación con los números de esa corrida, la idea para llevarse y preguntas para discutir.

Cada actividad cambia **un solo parámetro**. La respuesta correcta se calcula con la simulación, no está escrita de antemano. **Otra semana** repite la prueba con otras llegadas al azar: los números cambian, la conclusión no (las pruebas automáticas lo verifican en 12 semanas distintas).

Los valores de referencia que aparecen abajo son de la semana que se abre por defecto (n.º 4).

### 1. Temporada alta

- **Cambio:** de 2,5 a 3,5 buques por día (40 % más).
- **Pregunta:** ¿cuánto crece la espera media en el fondeadero?
- **Respuesta esperada:** mucho más que el tráfico. En la semana de referencia la espera se multiplica por 4 (de 6,7 h a 27 h), con los muelles ocupados el 90 % del tiempo.
- **Por qué:** cerca del límite de capacidad, cada buque extra tiene que esperar a que termine otro, y los atrasos se encadenan. Las colas no son lineales.
- **Error común:** pensar que con 40 % más buques la espera crece un 40 %.
- **Para seguir:** probar con 3 buques por día en la pestaña *Simulador* y buscar dónde empieza a dispararse la espera.

### 2. Paro de camiones

- **Cambio:** el retiro en camión baja de 100 a 50 contenedores por hora.
- **Pregunta:** ¿qué pasa con la espera de los buques en el fondeadero?
- **Respuesta esperada:** aumenta mucho, más del doble. En la referencia pasa de 6,7 h a 38 h.
- **Por qué:** el patio se llena, las grúas no tienen dónde dejar los contenedores y frenan. Cada buque se queda más tiempo amarrado y los que llegan esperan afuera. Un problema en tierra termina demorando a los buques en el agua.
- **Error común:** pensar que "el paro es en tierra, no afecta al agua".
- **Para seguir:** subir la altura de apilado a 5 y ver si alcanza para aguantar el paro.

### 3. Un solo turno

- **Cambio:** las grúas pasan de trabajar las 24 h a solo de 8 a 16 h.
- **Pregunta:** ¿cuánto más se queda cada buque amarrado?
- **Respuesta esperada:** más del doble (de 14 h a 36 h en la referencia), y la espera en el fondeadero se dispara.
- **Por qué:** el buque sigue ocupando el muelle aunque nadie lo esté trabajando. La capacidad depende de las horas de trabajo, no solo de las máquinas.
- **Error común:** pensar que "las grúas son igual de rápidas, así que no cambia nada".
- **Para seguir:** poner la luz en *Según la hora* y mirar de noche las grúas paradas con el buque amarrado.

### 4. Llegadas con itinerario

- **Cambio:** los buques siguen siendo 2,5 por día, pero llegan con un itinerario regular (hasta 3 h de atraso) en vez de al azar.
- **Pregunta:** con la misma cantidad de buques, ¿qué pasa con la espera?
- **Respuesta esperada:** baja muchísimo (de 6,7 h a 1,3 h en la referencia), y casi nunca hay más de un buque esperando.
- **Por qué:** cuando las llegadas son al azar, a veces vienen varios juntos y se forma cola aunque después el muelle quede vacío. Ordenar las llegadas reduce la espera sin agregar capacidad: la variabilidad, por sí sola, genera colas.
- **Error común:** pensar que "llegan los mismos buques, así que es lo mismo".
- **Para seguir:** itinerario con 3,5 buques por día. ¿El orden alcanza cuando hay mucho tráfico?

## Después de las actividades: el simulador libre

La pestaña **Simulador** tiene escenarios listos y todos los parámetros, cada uno con una explicación en el botón **?**. Al terminar una actividad, la comparación ya queda armada: la *base* es la terminal normal y *ahora* es el escenario de la actividad. Así los estudiantes pueden seguir cambiando cosas desde ahí.

- **Fijar como base** guarda el escenario actual para comparar contra él.
- **Volver a la base** deshace los cambios.
- El gráfico muestra la cola y el patio hora por hora, comparando con la base.

Una consigna abierta que funciona bien: *"Con temporada alta, encontrá el cambio más barato que deje la espera por debajo de 10 horas"*. Se puede discutir cuánto cuesta en la realidad cada opción: más grúas, más turnos, un tercer muelle o itinerarios.

## Límites del modelo (para no enseñar de más)

- La operación es simulada. No reproduce la terminal real ni sus números. Los valores por defecto son razonables, no oficiales.
- Solo modela la descarga de contenedores. No modela la carga, los vacíos, los reefers ni el ferrocarril.
- Los tractores, camiones y RTG de la escena son ilustrativos: su cantidad y su recorrido no salen del simulador.
- El muelle 3 es una ampliación hipotética.

Estos límites también son material de clase: *¿qué le falta al modelo para parecerse más a la realidad?*
