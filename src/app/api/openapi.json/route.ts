import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const spec = {
    openapi: "3.0.3",
    info: {
      title: "La Bóveda API & MCP Tools",
      description: "API de integración y automatización para Gemini Spark y asistentes de IA. Permite gestionar clases del Centro de Estudios Turing (CET), consultar cotizaciones financieras y administrar presupuestos.",
      version: "1.0.0",
    },
    servers: [
      {
        url: baseUrl,
        description: "Servidor de La Bóveda",
      },
    ],
    paths: {
      "/api/mcp/clases": {
        get: {
          operationId: "consultar_clases",
          summary: "Consultar clases agendadas",
          description: "Obtiene la lista de clases particulares y del instituto, con filtros por fecha y alumno.",
          parameters: [
            {
              name: "fecha_inicio",
              in: "query",
              required: false,
              schema: { type: "string", format: "date" },
              description: "Fecha inicial en formato YYYY-MM-DD",
            },
            {
              name: "fecha_fin",
              in: "query",
              required: false,
              schema: { type: "string", format: "date" },
              description: "Fecha final en formato YYYY-MM-DD",
            },
            {
              name: "alumno",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Filtrar por nombre de alumno",
            },
            {
              name: "userId",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "UID del usuario en Firebase (opcional)",
            },
          ],
          responses: {
            "200": {
              description: "Lista de clases obtenida con éxito",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      totalClasses: { type: "integer" },
                      totalHours: { type: "number" },
                      totalAmountArs: { type: "number" },
                      classes: {
                        type: "array",
                        items: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: "crear_clase",
          summary: "Crear una nueva clase",
          description: "Registra una nueva clase en La Bóveda y calcula automáticamente la tarifa presencial/virtual.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["alumno", "materia", "fecha", "hora_inicio"],
                  properties: {
                    alumno: { type: "string", description: "Nombre y apellido del alumno" },
                    materia: { type: "string", description: "Nombre de la materia (ej: Análisis Matemático, Física)" },
                    fecha: { type: "string", format: "date", description: "Fecha en formato YYYY-MM-DD" },
                    hora_inicio: { type: "string", description: "Hora de inicio en formato HH:MM (ej: 18:30)" },
                    duracion_minutos: { type: "integer", default: 60, description: "Duración en minutos" },
                    modalidad: { type: "string", enum: ["presencial", "virtual"], default: "virtual", description: "Modalidad" },
                    tipo: { type: "string", enum: ["CET", "privada"], default: "CET", description: "Tipo de clase" },
                    tarifa_ars: { type: "number", description: "Tarifa personalizada en ARS (opcional)" },
                    notas: { type: "string", description: "Notas adicionales" },
                    userId: { type: "string", description: "UID del usuario en Firebase (opcional)" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Clase creada exitosamente",
            },
          },
        },
        put: {
          operationId: "actualizar_clase",
          summary: "Actualizar o reprogramar una clase",
          description: "Modifica fecha, horario, duración o datos de una clase existente.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["id_clase"],
                  properties: {
                    id_clase: { type: "string", description: "ID único de la clase a modificar" },
                    nueva_fecha: { type: "string", format: "date", description: "Nueva fecha YYYY-MM-DD" },
                    nuevo_horario: { type: "string", description: "Nuevo horario HH:MM" },
                    duracion_minutos: { type: "integer", description: "Nueva duración en minutos" },
                    alumno: { type: "string", description: "Nombre del alumno" },
                    materia: { type: "string", description: "Materia" },
                    modalidad: { type: "string", enum: ["presencial", "virtual"] },
                    notas: { type: "string" },
                    userId: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Clase actualizada exitosamente",
            },
          },
        },
        delete: {
          operationId: "cancelar_clase",
          summary: "Cancelar / Eliminar una clase",
          description: "Elimina una clase registrada en La Bóveda.",
          parameters: [
            {
              name: "id_clase",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "ID de la clase a eliminar",
            },
            {
              name: "userId",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "UID del usuario",
            },
          ],
          responses: {
            "200": {
              description: "Clase eliminada exitosamente",
            },
          },
        },
      },
      "/api/mcp/parse-email": {
        post: {
          operationId: "parse_class_email",
          summary: "Parsear correo de clases de Turing",
          description: "Analiza el texto de un email y extrae alumno, materia, fecha, hora, duración y acción (alta, reprogramación, cancelación).",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["body"],
                  properties: {
                    body: { type: "string", description: "Cuerpo o texto completo del correo electrónico" },
                    subject: { type: "string", description: "Asunto del correo (opcional)" },
                    sender: { type: "string", description: "Remitente (opcional)" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Datos de la clase extraídos exitosamente",
            },
          },
        },
      },
      "/api/dolar/uala": {
        get: {
          operationId: "get_dollar_rates",
          summary: "Cotizaciones del Dólar",
          description: "Obtiene el valor del Dólar Ualá, MEP y oficial.",
          responses: {
            "200": { description: "Cotizaciones obtenidas" },
          },
        },
      },
      "/api/yahoo": {
        get: {
          operationId: "get_financial_quote",
          summary: "Cotización de activos financieros",
          description: "Obtiene cotización en tiempo real de acciones, CEDEARs, bonos o criptomonedas.",
          parameters: [
            {
              name: "ticker",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "Ticker del activo (ej: AAPL, MELI.BA, AL30, BTC-USD)",
            },
          ],
          responses: {
            "200": { description: "Cotización del activo" },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
