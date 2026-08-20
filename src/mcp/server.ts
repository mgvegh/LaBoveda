#!/usr/bin/env node
/**
 * La Bóveda - Model Context Protocol (MCP) Server for Gemini & LLMs
 * 
 * Provides automated tools for:
 * - Realtime Financial & Currency Quotes (Yahoo Finance, Argentine Bonds, Dollar rates)
 * - Portfolio & Investment Analytics (CEDEARs, Crypto DCA / Bullets)
 * - Budgeting & Income Distribution
 * - Tutor Class Email Parsing (Centro de Estudios Turing / CET & Private)
 * - Tutor Class Firestore Database Management (crear_clase, actualizar_clase, cancelar_clase, consultar_clases)
 * - Google Calendar event generation & sync
 * - Fuel Efficiency & Cost Tracking
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Auto-load .env.local if present and not in Next.js runtime
function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadLocalEnv();

import { getFinancialQuote, getDollarRates } from "./tools/market";
import { distributeIncome, analyzeCedearsPortfolio, calculateCryptoDcaStrategy } from "./tools/portfolio";
import {
  parseClassEmail,
  formatTutorClassForTracker,
  generateGoogleCalendarEvent,
  dbCreateClass,
  dbGetClasses,
  dbUpdateClass,
  dbDeleteClass,
} from "./tools/classes";
import { analyzeFuelEfficiency } from "./tools/fuel";

// Initialize MCP Server
const server = new McpServer({
  name: "la-boveda-tracker-mcp",
  version: "1.0.0",
});

// ─── 1. Gestión de Clases en La Bóveda (Base de Datos Firestore) ─────────────

server.tool(
  "crear_clase",
  "Registra una nueva clase en la base de datos de La Bóveda (Tutor Tracker), calculando automáticamente la tarifa según la modalidad y duración.",
  {
    alumno: z.string().describe("Nombre y apellido del alumno"),
    materia: z.string().describe("Nombre de la materia (ej: Análisis Matemático, Física I, Álgebra, Programación)"),
    fecha: z.string().describe("Fecha de la clase en formato YYYY-MM-DD"),
    hora_inicio: z.string().describe("Hora de inicio en formato HH:MM (ej: 18:30)"),
    hora_fin: z.string().optional().describe("Hora de fin en formato HH:MM"),
    duracion_minutos: z.number().optional().describe("Duración en minutos (ej: 60, 90, 120)"),
    modalidad: z.enum(["presencial", "virtual"]).optional().describe("Modalidad presencial o virtual (por defecto: virtual)"),
    tipo: z.enum(["CET", "privada"]).optional().describe("Tipo de clase: CET (Centro de Estudios Turing) o privada (por defecto: CET)"),
    tarifa_ars: z.number().optional().describe("Tarifa personalizada en ARS (si no se indica, se obtiene de la configuración de La Bóveda)"),
    notas: z.string().optional().describe("Notas u observaciones de la clase"),
    userId: z.string().optional().describe("UID del usuario en Firebase (opcional, usa el predeterminado)"),
  },
  async (args) => {
    try {
      const result = await dbCreateClass(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error al crear clase en La Bóveda: ${err.message}` }],
      };
    }
  }
);

server.tool(
  "consultar_clases",
  "Consulta las clases registradas en La Bóveda en un rango de fechas o para un alumno específico, con métricas de horas y honorarios.",
  {
    fecha_inicio: z.string().optional().describe("Fecha inicial en formato YYYY-MM-DD"),
    fecha_fin: z.string().optional().describe("Fecha final en formato YYYY-MM-DD"),
    alumno: z.string().optional().describe("Filtrar por nombre de alumno"),
    userId: z.string().optional().describe("UID del usuario en Firebase"),
  },
  async (args) => {
    try {
      const result = await dbGetClasses(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error al consultar clases: ${err.message}` }],
      };
    }
  }
);

server.tool(
  "actualizar_clase",
  "Actualiza la fecha, horario, duración o datos de una clase existente en La Bóveda.",
  {
    id_clase: z.string().describe("ID de la clase en La Bóveda"),
    nueva_fecha: z.string().optional().describe("Nueva fecha en formato YYYY-MM-DD"),
    nuevo_horario: z.string().optional().describe("Nuevo horario en formato HH:MM"),
    duracion_minutos: z.number().optional().describe("Nueva duración en minutos"),
    alumno: z.string().optional().describe("Nombre del alumno"),
    materia: z.string().optional().describe("Materia"),
    modalidad: z.enum(["presencial", "virtual"]).optional().describe("Modalidad"),
    notas: z.string().optional().describe("Notas"),
    userId: z.string().optional().describe("UID del usuario en Firebase"),
  },
  async (args) => {
    try {
      const result = await dbUpdateClass(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error al actualizar clase: ${err.message}` }],
      };
    }
  }
);

server.tool(
  "cancelar_clase",
  "Elimina o cancela una clase en la base de datos de La Bóveda.",
  {
    id_clase: z.string().describe("ID de la clase a eliminar/cancelar"),
    userId: z.string().optional().describe("UID del usuario en Firebase"),
  },
  async (args) => {
    try {
      const result = await dbDeleteClass(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error al cancelar clase: ${err.message}` }],
      };
    }
  }
);

// ─── 2. Clases: Emails & Google Calendar ─────────────────────────────────────

server.tool(
  "parse_class_email",
  "Analiza el texto de un correo electrónico del instituto (Centro de Estudios Turing / CET) o alumno, identificando si es una nueva clase, reprogramación o cancelación, extrayendo alumno, materia, fecha, horario, duración y modalidad.",
  {
    body: z.string().describe("Cuerpo completo o texto del correo electrónico recibido"),
    subject: z.string().optional().describe("Asunto del correo electrónico"),
    sender: z.string().optional().describe("Remitente del correo (ej: info@centroturing.com)"),
  },
  async ({ body, subject, sender }) => {
    try {
      const parsed = parseClassEmail({ body, subject, sender });
      return {
        content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error al parsear correo de clase: ${err.message}` }],
      };
    }
  }
);

server.tool(
  "generate_calendar_event",
  "Genera el payload para agendar, actualizar o exportar un evento en Google Calendar y formato ICS a partir de una clase.",
  {
    studentName: z.string().describe("Nombre del alumno"),
    subject: z.string().describe("Materia dictada"),
    date: z.string().describe("Fecha en formato YYYY-MM-DD"),
    startTime: z.string().describe("Hora de inicio en formato HH:MM"),
    durationMinutes: z.number().describe("Duración en minutos"),
    modality: z.enum(["presencial", "virtual"]).describe("Modalidad presencial o virtual"),
    type: z.enum(["CET", "privada"]).describe("Tipo de clase"),
    location: z.string().optional().describe("Ubicación física o enlace de videollamada"),
    notes: z.string().optional().describe("Notas del evento"),
  },
  async (args) => {
    try {
      const event = generateGoogleCalendarEvent(args);
      return {
        content: [{ type: "text", text: JSON.stringify(event, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error al generar evento de calendario: ${err.message}` }],
      };
    }
  }
);

// ─── 3. Cotizaciones y Mercado ───────────────────────────────────────────────

server.tool(
  "get_financial_quote",
  "Obtiene la cotización en tiempo real de una acción, CEDEAR (.BA), bono argentino soberano (AL30, GD30), ON corporativa o criptomoneda (BTC-USD, ETH-USD).",
  {
    ticker: z.string().describe("Símbolo bursátil o ticker (ej: AAPL, MELI.BA, AL30, GD30, BTC-USD, SPY)"),
  },
  async ({ ticker }) => {
    try {
      const quote = await getFinancialQuote(ticker);
      return {
        content: [{ type: "text", text: JSON.stringify(quote, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error al obtener cotización: ${err.message}` }],
      };
    }
  }
);

server.tool(
  "get_dollar_rates",
  "Obtiene las cotizaciones del dólar en Argentina en tiempo real: Dólar Ualá, MEP/Bolsa, Blue, Oficial, Cripto y Tarjeta.",
  {},
  async () => {
    try {
      const rates = await getDollarRates();
      return {
        content: [{ type: "text", text: JSON.stringify(rates, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error al consultar cotizaciones del dólar: ${err.message}` }],
      };
    }
  }
);

// ─── 4. Finanzas, Presupuesto y Carteras ─────────────────────────────────────

server.tool(
  "distribute_income",
  "Calcula la distribución de ingresos mensual según reglas fijas (en ARS o USD) y porcentajes de ahorro/inversión/ocio, deduciendo gastos fijos y contemplando deudas.",
  {
    totalIncomeArs: z.number().describe("Monto total de ingresos en pesos argentinos (ARS)"),
    usdRate: z.number().optional().describe("Tipo de cambio USD/ARS (opcional, por defecto consulta el mercado)"),
    categories: z.array(
      z.object({
        name: z.string().describe("Nombre de la categoría (ej: Inversiones, Ahorro, Ocio)"),
        type: z.enum(["fixed_usd", "fixed_ars", "percentage"]).describe("Tipo de asignación"),
        value: z.number().describe("Valor (monto fijo o porcentaje del remanente)"),
      })
    ).describe("Lista de categorías de asignación presupuestaria"),
    expenses: z.array(
      z.object({
        name: z.string().describe("Nombre del gasto fijo"),
        amount: z.number().describe("Monto del gasto"),
        currency: z.enum(["ARS", "USD"]).describe("Moneda del gasto"),
      })
    ).optional().describe("Gastos fijos a descontar del ingreso total"),
  },
  async (args) => {
    try {
      const result = distributeIncome(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error al calcular distribución de ingresos: ${err.message}` }],
      };
    }
  }
);

server.tool(
  "analyze_cedears_portfolio",
  "Calcula el rendimiento, valuación actual, tenencias netas, precio promedio de compra (PPP) y PnL nominal y porcentual de una cartera de CEDEARs y Bonos.",
  {
    purchases: z.array(
      z.object({
        ticker: z.string().describe("Símbolo bursátil (ej: AAPL, MELI.BA, AL30)"),
        quantity: z.number().describe("Cantidad de títulos"),
        purchasePrice: z.number().describe("Precio de compra unitario"),
        currency: z.enum(["ARS", "USD"]).describe("Moneda de la compra"),
        date: z.string().optional().describe("Fecha de compra YYYY-MM-DD"),
      })
    ).describe("Historial de compras / operaciones"),
    usdRate: z.number().optional().describe("Tipo de cambio MEP/Ualá de referencia"),
  },
  async (args) => {
    try {
      const result = await analyzeCedearsPortfolio(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error al analizar cartera de CEDEARs: ${err.message}` }],
      };
    }
  }
);

server.tool(
  "calculate_crypto_dca_strategy",
  "Asistente para la estrategia de compras escalonadas (balas) y toma de ganancias en criptomonedas (BTC / ETH).",
  {
    strategyName: z.string().describe("Nombre de la estrategia (ej: AV_BTC, AV_ETH)"),
    currentPrice: z.number().describe("Precio actual de la criptomoneda en USD"),
    firstEntryPrice: z.number().describe("Precio de la primera entrada en USD"),
    totalBullets: z.number().describe("Total de balas planificadas (ej: 6)"),
    usedBullets: z.number().describe("Balas ya ejecutadas (ej: 2)"),
    stepDropPct: z.number().optional().describe("Porcentaje de caída entre cada bala (default: 5%)"),
    targetProfitPct: z.number().optional().describe("Objetivo de ganancia Take Profit (default: 8%)"),
  },
  async (args) => {
    try {
      const result = calculateCryptoDcaStrategy(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error en cálculo de estrategia cripto: ${err.message}` }],
      };
    }
  }
);

// ─── 5. Combustible ──────────────────────────────────────────────────────────

server.tool(
  "analyze_fuel_efficiency",
  "Calcula el rendimiento medio (km/L, L/100km), gasto total y costo por kilómetro a partir de un historial de cargas de combustible.",
  {
    vehicleName: z.string().optional().describe("Nombre o modelo del vehículo"),
    records: z.array(
      z.object({
        date: z.string().describe("Fecha de carga YYYY-MM-DD"),
        odometer: z.number().describe("Kilometraje actual del odómetro"),
        liters: z.number().describe("Litros cargados"),
        totalCost: z.number().describe("Costo total de la carga en ARS"),
        fuelType: z.string().optional().describe("Tipo de combustible (Súper, Premium, Diésel)"),
        station: z.string().optional().describe("Estación de servicio (YPF, Shell, Axion, etc.)"),
      })
    ).describe("Historial cronológico de cargas"),
  },
  async (args) => {
    try {
      const result = analyzeFuelEfficiency(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error al calcular eficiencia de combustible: ${err.message}` }],
      };
    }
  }
);

// ─── Start Transport ─────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 Servidor MCP de La Bóveda conectado y listo para Gemini.");
}

if (process.argv[1] && (process.argv[1].endsWith("server.ts") || process.argv[1]?.endsWith("server.js"))) {
  main().catch((err) => {
    console.error("Error fatal en el servidor MCP:", err);
    process.exit(1);
  });
}
