import { NextResponse } from "next/server";
import {
  dbCreateClass,
  dbGetClasses,
  dbUpdateClass,
  dbDeleteClass,
  parseClassEmail,
  generateGoogleCalendarEvent,
} from "@/mcp/tools/classes";
import { getFinancialQuote, getDollarRates } from "@/mcp/tools/market";
import {
  distributeIncome,
  analyzeCedearsPortfolio,
  calculateCryptoDcaStrategy,
} from "@/mcp/tools/portfolio";
import { analyzeFuelEfficiency } from "@/mcp/tools/fuel";

/**
 * Remote MCP (Model Context Protocol) Server for Next.js / Vercel
 * Supports:
 * - GET: SSE Stream (Server-Sent Events) or MCP Server Manifest
 * - POST: JSON-RPC 2.0 MCP Protocol (initialize, tools/list, tools/call, ping)
 */

export const dynamic = "force-dynamic";

const MCP_TOOLS_DEFINITION = [
  {
    name: "crear_clase",
    description: "Registra una nueva clase en la base de datos de La Bóveda (Tutor Tracker), calculando automáticamente la tarifa según la modalidad y duración.",
    inputSchema: {
      type: "object",
      required: ["alumno", "materia", "fecha", "hora_inicio"],
      properties: {
        alumno: { type: "string", description: "Nombre y apellido del alumno" },
        materia: { type: "string", description: "Nombre de la materia (ej: Análisis Matemático, Física)" },
        fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
        hora_inicio: { type: "string", description: "Hora de inicio en formato HH:MM (ej: 18:30)" },
        hora_fin: { type: "string", description: "Hora de fin en formato HH:MM" },
        duracion_minutos: { type: "number", description: "Duración en minutos (ej: 60, 90, 120)" },
        modalidad: { type: "string", enum: ["presencial", "virtual"], description: "Modalidad" },
        tipo: { type: "string", enum: ["CET", "privada"], description: "Tipo de clase" },
        tarifa_ars: { type: "number", description: "Tarifa horaria personalizada en ARS" },
        notas: { type: "string", description: "Notas adicionales" },
      },
    },
  },
  {
    name: "consultar_clases",
    description: "Consulta las clases registradas en La Bóveda en un rango de fechas o para un alumno específico, con métricas de horas y honorarios.",
    inputSchema: {
      type: "object",
      properties: {
        fecha_inicio: { type: "string", description: "Fecha inicial en formato YYYY-MM-DD" },
        fecha_fin: { type: "string", description: "Fecha final en formato YYYY-MM-DD" },
        alumno: { type: "string", description: "Filtrar por nombre de alumno" },
      },
    },
  },
  {
    name: "actualizar_clase",
    description: "Actualiza la fecha, horario, duración o datos de una clase existente en La Bóveda.",
    inputSchema: {
      type: "object",
      required: ["id_clase"],
      properties: {
        id_clase: { type: "string", description: "ID único de la clase" },
        nueva_fecha: { type: "string", description: "Nueva fecha YYYY-MM-DD" },
        nuevo_horario: { type: "string", description: "Nuevo horario HH:MM" },
        duracion_minutos: { type: "number", description: "Nueva duración en minutos" },
        alumno: { type: "string", description: "Nombre del alumno" },
        materia: { type: "string", description: "Materia" },
        modalidad: { type: "string", enum: ["presencial", "virtual"] },
        notas: { type: "string" },
      },
    },
  },
  {
    name: "cancelar_clase",
    description: "Elimina o cancela una clase en la base de datos de La Bóveda.",
    inputSchema: {
      type: "object",
      required: ["id_clase"],
      properties: {
        id_clase: { type: "string", description: "ID de la clase a eliminar" },
      },
    },
  },
  {
    name: "parse_class_email",
    description: "Analiza el texto de un correo del instituto (Centro de Estudios Turing / CET) y extrae alumno, materia, fecha, horario, duración y modalidad.",
    inputSchema: {
      type: "object",
      required: ["body"],
      properties: {
        body: { type: "string", description: "Cuerpo o texto completo del correo electrónico recibido" },
        subject: { type: "string", description: "Asunto del correo" },
        sender: { type: "string", description: "Remitente" },
      },
    },
  },
  {
    name: "generate_calendar_event",
    description: "Genera el payload para agendar o actualizar un evento en Google Calendar y formato ICS a partir de una clase.",
    inputSchema: {
      type: "object",
      required: ["studentName", "subject", "date", "startTime", "durationMinutes"],
      properties: {
        studentName: { type: "string", description: "Nombre del alumno" },
        subject: { type: "string", description: "Materia" },
        date: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
        startTime: { type: "string", description: "Hora de inicio en formato HH:MM" },
        durationMinutes: { type: "number", description: "Duración en minutos" },
        modality: { type: "string", enum: ["presencial", "virtual"] },
        type: { type: "string", enum: ["CET", "privada"] },
        location: { type: "string" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "get_financial_quote",
    description: "Obtiene la cotización en tiempo real de una acción, CEDEAR (.BA), bono argentino (AL30, GD30), ON corporativa o criptomoneda.",
    inputSchema: {
      type: "object",
      required: ["ticker"],
      properties: {
        ticker: { type: "string", description: "Símbolo bursátil o ticker (ej: AAPL, MELI.BA, AL30, BTC-USD)" },
      },
    },
  },
  {
    name: "get_dollar_rates",
    description: "Obtiene las cotizaciones del dólar en Argentina: Dólar Ualá, MEP, Blue, Oficial, Cripto y Tarjeta.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "distribute_income",
    description: "Calcula la distribución mensual de ingresos según reglas fijas y porcentuales.",
    inputSchema: {
      type: "object",
      required: ["totalIncomeArs", "categories"],
      properties: {
        totalIncomeArs: { type: "number" },
        usdRate: { type: "number" },
        categories: { type: "array", items: { type: "object" } },
        expenses: { type: "array", items: { type: "object" } },
      },
    },
  },
  {
    name: "analyze_cedears_portfolio",
    description: "Calcula el rendimiento, valuación actual, PPP y PnL de una cartera de CEDEARs y Bonos.",
    inputSchema: {
      type: "object",
      required: ["purchases"],
      properties: {
        purchases: { type: "array", items: { type: "object" } },
        usdRate: { type: "number" },
      },
    },
  },
  {
    name: "calculate_crypto_dca_strategy",
    description: "Estrategia de compras escalonadas (balas) y Take Profit en cripto.",
    inputSchema: {
      type: "object",
      required: ["strategyName", "currentPrice", "firstEntryPrice", "totalBullets", "usedBullets"],
      properties: {
        strategyName: { type: "string" },
        currentPrice: { type: "number" },
        firstEntryPrice: { type: "number" },
        totalBullets: { type: "number" },
        usedBullets: { type: "number" },
      },
    },
  },
  {
    name: "analyze_fuel_efficiency",
    description: "Calcula el rendimiento medio de combustible (km/L, L/100km) y costo por kilómetro.",
    inputSchema: {
      type: "object",
      required: ["records"],
      properties: {
        vehicleName: { type: "string" },
        records: { type: "array", items: { type: "object" } },
      },
    },
  },
];

async function handleToolExecution(name: string, args: any) {
  switch (name) {
    case "crear_clase":
      return await dbCreateClass(args);
    case "consultar_clases":
      return await dbGetClasses(args);
    case "actualizar_clase":
      return await dbUpdateClass(args);
    case "cancelar_clase":
      return await dbDeleteClass(args);
    case "parse_class_email":
      return parseClassEmail(args);
    case "generate_calendar_event":
      return generateGoogleCalendarEvent(args);
    case "get_financial_quote":
      return await getFinancialQuote(args.ticker);
    case "get_dollar_rates":
      return await getDollarRates();
    case "distribute_income":
      return distributeIncome(args);
    case "analyze_cedears_portfolio":
      return await analyzeCedearsPortfolio(args);
    case "calculate_crypto_dca_strategy":
      return calculateCryptoDcaStrategy(args);
    case "analyze_fuel_efficiency":
      return analyzeFuelEfficiency(args);
    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}

// ─── GET: SSE Stream / MCP Handshake ─────────────────────────────────────────

export async function GET(request: Request) {
  const host = request.headers.get("host") || "laboveda.vercel.app";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const endpointUrl = `${protocol}://${host}/api/mcp`;

  const acceptHeader = request.headers.get("accept") || "";

  // If client requests text/event-stream (SSE Transport)
  if (acceptHeader.includes("text/event-stream")) {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        // Send initial endpoint event
        controller.enqueue(encoder.encode(`event: endpoint\ndata: ${endpointUrl}\n\n`));
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Otherwise return JSON discovery manifest
  return NextResponse.json(
    {
      name: "la-boveda-tracker-mcp",
      version: "1.0.0",
      description: "Servidor MCP de La Bóveda para Gemini Spark y LLMs",
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      tools: MCP_TOOLS_DEFINITION,
      endpoints: {
        sse: endpointUrl,
        rpc: endpointUrl,
      },
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}

// ─── POST: JSON-RPC 2.0 Handler (MCP Core Protocol) ─────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Support single request or batch requests
    if (Array.isArray(body)) {
      const responses = await Promise.all(body.map((req) => processRpcRequest(req)));
      return NextResponse.json(responses, { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    const response = await processRpcRequest(body);
    return NextResponse.json(response, { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (error: any) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: `Error de parseo JSON: ${error.message}`,
        },
      },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}

async function processRpcRequest(rpc: any) {
  const { jsonrpc = "2.0", id, method, params = {} } = rpc;

  if (method === "initialize") {
    return {
      jsonrpc,
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: "la-boveda-tracker-mcp",
          version: "1.0.0",
        },
      },
    };
  }

  if (method === "tools/list") {
    return {
      jsonrpc,
      id,
      result: {
        tools: MCP_TOOLS_DEFINITION,
      },
    };
  }

  if (method === "tools/call") {
    const { name, arguments: toolArgs = {} } = params;
    try {
      const output = await handleToolExecution(name, toolArgs);
      return {
        jsonrpc,
        id,
        result: {
          content: [
            {
              type: "text",
              text: typeof output === "string" ? output : JSON.stringify(output, null, 2),
            },
          ],
        },
      };
    } catch (err: any) {
      return {
        jsonrpc,
        id,
        result: {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error al ejecutar ${name}: ${err.message}`,
            },
          ],
        },
      };
    }
  }

  if (method === "ping") {
    return {
      jsonrpc,
      id,
      result: {},
    };
  }

  // Unhandled notification or method
  return {
    jsonrpc,
    id,
    error: {
      code: -32601,
      message: `Método desconocido: ${method}`,
    },
  };
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    },
  });
}
