/**
 * Market & Financial Quotes Tools for MCP Server
 */

interface QuoteResult {
  ticker: string;
  price: number;
  previousClose: number;
  changePct: number;
  currency: string;
  source: string;
  timestamp: string;
}

async function tryArgentineFallback(ticker: string): Promise<QuoteResult | null> {
  const baseSymbol = ticker.replace(/\.BA$/i, "").toUpperCase();

  // 1. Check Argentine Sovereign Bonds (data912)
  try {
    const bondsRes = await fetch("https://data912.com/live/arg_bonds");
    if (bondsRes.ok) {
      const bondsList = (await bondsRes.json()) as any[];
      const found = bondsList.find((b) => b.symbol?.toUpperCase() === baseSymbol);
      if (found && typeof found.c === "number") {
        const price = found.c / 100;
        const pct = found.pct_change || 0;
        const previousClose = found.c / (1 + pct / 100) / 100;
        const isUsd = baseSymbol.endsWith("D") || baseSymbol.endsWith("C");
        return {
          ticker,
          price,
          previousClose,
          changePct: pct,
          currency: isUsd ? "USD" : "ARS",
          source: "Data912 (Bonos Soberanos)",
          timestamp: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    // skip
  }

  // 2. Check Argentine Corporate Bonds / ONs (data912)
  try {
    const corpRes = await fetch("https://data912.com/live/arg_corp");
    if (corpRes.ok) {
      const corpList = (await corpRes.json()) as any[];
      const found = corpList.find((c) => c.symbol?.toUpperCase() === baseSymbol);
      if (found && typeof found.c === "number") {
        const price = found.c / 100;
        const pct = found.pct_change || 0;
        const previousClose = found.c / (1 + pct / 100) / 100;
        const isUsd = baseSymbol.endsWith("D") || baseSymbol.endsWith("C");
        return {
          ticker,
          price,
          previousClose,
          changePct: pct,
          currency: isUsd ? "USD" : "ARS",
          source: "Data912 (ONs Corporativas)",
          timestamp: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    // skip
  }

  return null;
}

export async function getFinancialQuote(rawTicker: string): Promise<QuoteResult> {
  const ticker = rawTicker.trim().toUpperCase().replace(/[^A-Z0-9\.\-\_\^]/g, "");
  if (!ticker) {
    throw new Error("Ticker inválido o vacío.");
  }

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      }
    );

    if (res.ok) {
      const data = (await res.json()) as any;
      const result = data.chart?.result?.[0];
      if (result && typeof result.meta?.regularMarketPrice === "number") {
        const price = result.meta.regularMarketPrice;
        const previousClose = result.meta.chartPreviousClose || result.meta.previousClose || price;
        const changePct = previousClose ? ((price - previousClose) / previousClose) * 100 : 0;
        return {
          ticker,
          price,
          previousClose,
          changePct: parseFloat(changePct.toFixed(2)),
          currency: result.meta.currency || "USD",
          source: "Yahoo Finance",
          timestamp: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    // fallback
  }

  const fallback = await tryArgentineFallback(ticker);
  if (fallback) {
    return fallback;
  }

  throw new Error(`No se pudo obtener la cotización para el ticker '${ticker}'. Verifique el símbolo.`);
}

export interface DollarRates {
  uala?: { compra: number; venta: number };
  mep?: { compra: number; venta: number };
  blue?: { compra: number; venta: number };
  oficial?: { compra: number; venta: number };
  cripto?: { compra: number; venta: number };
  tarjeta?: { compra: number; venta: number };
  fechaActualizacion: string;
}

export async function getDollarRates(): Promise<DollarRates> {
  const result: DollarRates = {
    fechaActualizacion: new Date().toISOString(),
  };

  // 1. Fetch Ualá rate from comparadolar.ar
  try {
    const ualaRes = await fetch("https://comparadolar.ar/usd/uala", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (ualaRes.ok) {
      const html = await ualaRes.text();
      const comprasMatch = html.match(/Compras a<\/h[23]>.*?<div class="text-3xl[^>]*>([\d\.,]+)<\/div>/);
      const vendesMatch = html.match(/Vendes a<\/h[23]>.*?<div class="text-3xl[^>]*>([\d\.,]+)<\/div>/);
      if (comprasMatch && comprasMatch[1]) {
        const compra = parseFloat(comprasMatch[1].replace(/\./g, "").replace(",", "."));
        const venta = vendesMatch && vendesMatch[1]
          ? parseFloat(vendesMatch[1].replace(/\./g, "").replace(",", "."))
          : compra;
        result.uala = { compra, venta };
      }
    }
  } catch (err) {
    // skip
  }

  // 2. Fetch DolarAPI for MEP, Blue, Oficial, Cripto, Tarjeta
  try {
    const apiRes = await fetch("https://dolarapi.com/v1/dolares");
    if (apiRes.ok) {
      const list = (await apiRes.json()) as any[];
      for (const item of list) {
        const casa = item.casa?.toLowerCase();
        if (casa === "bolsa" || casa === "mep") {
          result.mep = { compra: item.compra, venta: item.venta };
        } else if (casa === "blue") {
          result.blue = { compra: item.compra, venta: item.venta };
        } else if (casa === "oficial") {
          result.oficial = { compra: item.compra, venta: item.venta };
        } else if (casa === "cripto") {
          result.cripto = { compra: item.compra, venta: item.venta };
        } else if (casa === "tarjeta") {
          result.tarjeta = { compra: item.compra, venta: item.venta };
        }
      }
    }
  } catch (err) {
    // skip
  }

  return result;
}
