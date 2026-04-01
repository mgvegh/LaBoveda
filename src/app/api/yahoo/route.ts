import { NextResponse } from "next/server";

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
       throw new Error(`Yahoo Finance API HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart.result?.[0];
    
    if (!result || !result.meta.regularMarketPrice) {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
