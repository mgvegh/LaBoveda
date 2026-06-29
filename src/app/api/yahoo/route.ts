import { NextResponse } from "next/server";

async function tryArgentineFallback(ticker: string) {
  const baseSymbol = ticker.replace(/\.BA$/i, "").toUpperCase();

  // 1. Fetch from arg_bonds (sovereign bonds)
  try {
    const bondsRes = await fetch("https://data912.com/live/arg_bonds", {
      next: { revalidate: 300 } // Cache for 5 mins
    });
    if (bondsRes.ok) {
      const bondsList = await bondsRes.json() as any[];
      const found = bondsList.find(b => b.symbol.toUpperCase() === baseSymbol);
      if (found) {
        const price = found.c;
        const pct = found.pct_change || 0;
        const previousClose = price / (1 + pct / 100);
        const isUsd = baseSymbol.endsWith("D") || baseSymbol.endsWith("C");
        const currency = isUsd ? "USD" : "ARS";
        return { price, previousClose, currency };
      }
    }
  } catch (err) {
    console.error("Failed to fetch/parse data912 arg_bonds:", err);
  }

  // 2. Fetch from arg_corp (corporate bonds / ONs)
  try {
    const corpRes = await fetch("https://data912.com/live/arg_corp", {
      next: { revalidate: 300 } // Cache for 5 mins
    });
    if (corpRes.ok) {
      const corpList = await corpRes.json() as any[];
      const found = corpList.find(c => c.symbol.toUpperCase() === baseSymbol);
      if (found) {
        const price = found.c;
        const pct = found.pct_change || 0;
        const previousClose = price / (1 + pct / 100);
        const isUsd = baseSymbol.endsWith("D") || baseSymbol.endsWith("C");
        const currency = isUsd ? "USD" : "ARS";
        return { price, previousClose, currency };
      }
    }
  } catch (err) {
    console.error("Failed to fetch/parse data912 arg_corp:", err);
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  try {
    // Adding standard User-Agent to prevent 403 Forbidden from Yahoo
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      next: { revalidate: 60 } // Cache data for 60s
    });

    if (!response.ok) {
      const fallbackData = await tryArgentineFallback(ticker);
      if (fallbackData) {
        return NextResponse.json({
          ticker,
          ...fallbackData
        });
      }
      throw new Error(`Yahoo Finance API HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart.result?.[0];
    
    if (!result || !result.meta.regularMarketPrice) {
      const fallbackData = await tryArgentineFallback(ticker);
      if (fallbackData) {
        return NextResponse.json({
          ticker,
          ...fallbackData
        });
      }
      return NextResponse.json({ error: 'Data not found' }, { status: 404 });
    }

    const price = result.meta.regularMarketPrice;
    const previousClose = result.meta.chartPreviousClose;
    const currency = result.meta.currency;

    return NextResponse.json({
      ticker,
      price,
      previousClose,
      currency
    });
  } catch (error: any) {
    console.error('Yahoo Finance API Error:', error);
    
    try {
      const fallbackData = await tryArgentineFallback(ticker);
      if (fallbackData) {
        return NextResponse.json({
          ticker,
          ...fallbackData
        });
      }
    } catch (fallbackError) {
      console.error('Fallback error in catch:', fallbackError);
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
