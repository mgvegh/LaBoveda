# Guía de Vinculación con Gemini Spark: Tarea "Actualizar clases de Turing"

Esta guía contiene la configuración exacta para responderle a **Gemini Spark** y vincularlo con tu aplicación web *La Bóveda*.

---

## 1. ¿Cómo vincular el Servidor MCP con Gemini Spark?

Tu aplicación ya cuenta con el servidor MCP implementado y con las herramientas solicitadas por Gemini Spark:
- `crear_clase` (alumno, materia, fecha, hora_inicio, duracion_minutos / hora_fin, modalidad, tipo, tarifa_ars, notas)
- `consultar_clases` (fecha_inicio, fecha_fin, alumno)
- `actualizar_clase` (id_clase, nueva_fecha, nuevo_horario, duracion_minutos, alumno, materia, modalidad)
- `cancelar_clase` (id_clase)
- `parse_class_email` (analiza correos del Centro de Estudios Turing / CET)
- `generate_calendar_event` (genera eventos listos para Google Calendar)

### Opción A: Configuración MCP en archivo `mcp_config.json` o Ajustes de Gemini

Pegá esta configuración en la sección de herramientas MCP de tu cliente o entorno:

```json
{
  "mcpServers": {
    "la-boveda": {
      "command": "npx",
      "args": ["-y", "tsx", "c:/Users/veghm/.gemini/antigravity/scratch/investment-tracker/src/mcp/server.ts"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

### Opción B: Integración Vía API REST (para despliegues en la nube o Vercel)
Si Gemini Spark llama a tu web por HTTP, el endpoint está listo en:
`POST /api/mcp/clases`, `GET /api/mcp/clases`, `PUT /api/mcp/clases`, `DELETE /api/mcp/clases?id_clase=...`

---

## 2. Mensaje de Respuesta / Instrucciones para Gemini Spark

Podés copiar y pegar este texto directamente a Gemini Spark (o pegarlo en el prompt de la tarea programada):

> *"Actualizá las directivas de la tarea programada de agendamiento de clases con las siguientes reglas estrictas:*
>
> 1. **Lectura de correos**: Revisa los correos recibidos del remitente del *Centro de Estudios Turing* (CET) o relacionados a asignación, reprogramación o cancelación de clases.
> 2. **Extracción de Datos**: Extraé alumno, materia, fecha, horario, duración y modalidad.
> 3. **Formato del Evento en Google Calendar (MUY IMPORTANTE)**:
>    - **Título del Evento**: Debe ser **estrictamente** `[CET] {Materia} - {Nombre Alumno}` (por ejemplo: `[CET] Matemática - Manuel`, `[CET] Análisis Matemático - Lucas Gómez`).
>    - **PROHIBIDO** poner `(Presencial)`, `(Virtual)`, `(Pres)` ni modalidades en el título del evento o al lado del nombre del alumno. El título debe quedar 100% limpio.
>    - **Detalles / Descripción**: La modalidad se indica **exclusivamente** en el cuerpo/descripción del evento:
>      ```text
>      Clase de {Materia} con el alumno/a {Nombre Alumno}.
>      Modalidad: {Presencial/Virtual}
>      Tipo: CET
>      Duración: {minutos} minutos
>      ```
>    - **Ubicación**: Poné `Centro de Estudios Turing (CET)` si es presencial, o `Google Meet / Virtual` si es virtual.
> 4. **Reprogramación y Cancelación**:
>    - Si es **reprogramación**: Modifica la fecha/hora del evento existente manteniendo el mismo título limpio.
>    - Si es **cancelación**: Elimina el evento del calendario."*

---

## 3. Ejemplo de Ejecución de la Tarea

Cuando Gemini Spark se ejecute:
1. Detecta el correo: *"Se asigna clase de Análisis Matemático para el alumno Lucas Gómez el 25/08 a las 18:00hs (2 horas) presencial"*.
2. Crea el evento en Google Calendar:
   - **Título**: `[CET] Análisis Matemático - Lucas Gómez` *(¡limpio, sin sufijos!)*
   - **Descripción**: 
     ```text
     Clase de Análisis Matemático con el alumno/a Lucas Gómez.
     Modalidad: Presencial
     Tipo: CET
     Duración: 120 minutos
     ```
   - **Ubicación**: `Centro de Estudios Turing (CET)`
3. Luego, tu Google Apps Script lee el evento con el nombre limpio `Lucas Gómez` y lo guarda en La Bóveda sin ensuciar la base de datos.
