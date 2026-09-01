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

> *"Ya tengo implementado y configurado el servidor MCP de mi aplicación (La Bóveda). Cuenta con las herramientas `crear_clase`, `actualizar_clase`, `cancelar_clase`, `consultar_clases`, `parse_class_email` y `generate_calendar_event` conectadas a la base de datos de clases.*
>
> *Por favor, actualiza la instrucción de la tarea programada diaria con las siguientes directivas estrictas:*
>
> 1. **Lectura de correos**: Revisa los correos recibidos del remitente del *Centro de Estudios Turing* (CET) o relacionados a asignación, reprogramación o cancelación de clases.
> 2. **Procesamiento**: Usa la herramienta `parse_class_email` o analiza el correo para extraer alumno, materia, fecha, horario, duración y modalidad.
> 3. **Formato del Nombre del Alumno (MUY IMPORTANTE)**:
>    - El parámetro `alumno` debe ser **ÚNICAMENTE** el nombre y apellido del alumno (ej: `"Manuel"`, `"Thiago"`, `"Lucas Gómez"`).
>    - **NUNCA** incluyas `(Presencial)`, `(Virtual)`, `(Pres)` o modalidades dentro del nombre del alumno. La modalidad va en el parámetro dedicado `modalidad: "presencial"` o `modalidad: "virtual"`.
> 4. **La Bóveda (Base de Datos)**:
>    - Si es **nueva clase**: Ejecuta `crear_clase(alumno, materia, fecha, hora_inicio, duracion_minutos, modalidad, tipo="CET")` y guarda el `classId` devuelto.
>    - Si es **reprogramación**: Ejecuta `actualizar_clase(id_clase, nueva_fecha, nuevo_horario, duracion_minutos)`.
>    - Si es **cancelación**: Ejecuta `cancelar_clase(id_clase)`.
> 5. **Google Calendar (Sincronización de ID)**:
>    - Crea o actualiza el evento en Google Calendar.
>    - En la descripción del evento de Google Calendar, incluye al final una **ÚNICA** línea con el ID de La Bóveda:
>      `ID_BOVEDA: <classId>`
>    - Si el evento ya tiene una línea `ID_BOVEDA: ...`, **reemplázala**, nunca agregues una segunda línea con otro ID.
> 6. **Reporte Unificado**: Genera el resumen diario indicando las clases agendadas/modificadas en Google Calendar y en La Bóveda, horas totales y honorarios estimados."*

---

## 3. Ejemplo de Ejecución Unificada de la Tarea

Cuando Gemini Spark se ejecute a las 23:00 hs:
1. Detecta el correo: *"Se asigna clase de Análisis Matemático para el alumno Lucas Gómez el 25/08 a las 18:00hs (2 horas) presencial"*.
2. Ejecuta `parse_class_email`:
   ```json
   {
     "action": "new",
     "studentName": "Lucas Gómez",
     "subject": "Análisis Matemático",
     "date": "2026-08-25",
     "startTime": "18:00",
     "durationMinutes": 120,
     "modality": "presencial",
     "type": "CET"
   }
   ```
3. Crea el evento en Google Calendar: `[CET] Análisis Matemático - Lucas Gómez (Presencial)`.
4. Ejecuta `crear_clase(...)` en La Bóveda, guardando la clase y calculando automáticamente la tarifa presencial.
5. Te envía el reporte nocturno consolidado.
