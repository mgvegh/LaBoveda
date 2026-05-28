import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch("https://comparadolar.ar/usd/uala", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      next: { revalidate: 3600 } // Cache for 1 hour to avoid overloading the site
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch from ComparaDolar: ${res.status}`);
    }

    const html = await res.text();
    
    // Buscar la sección de "Compras a" y el valor que le sigue
    const comprasMatch = html.match(/Compras a<\/h3>.*?<div class="text-3xl[^>]*>([\d\.,]+)<\/div>/);
    const vendesMatch = html.match(/Vendes a<\/h3>.*?<div class="text-3xl[^>]*>([\d\.,]+)<\/div>/);

    if (comprasMatch && comprasMatch[1]) {
      const compraStr = comprasMatch[1].replace(/\./g, '').replace(/,/g, '.');
      const compraNum = parseFloat(compraStr);
      
      const ventaStr = vendesMatch && vendesMatch[1] ? vendesMatch[1].replace(/\./g, '').replace(/,/g, '.') : compraStr;
      const ventaNum = parseFloat(ventaStr);

      return NextResponse.json({
        casa: "uala",
        compra: compraNum,
        venta: ventaNum,
        fechaActualizacion: new Date().toISOString()
      });
    }

    return NextResponse.json({ error: "No se pudo extraer la cotización" }, { status: 500 });
  } catch (error) {
    console.error("Error fetching Ualá rate:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
