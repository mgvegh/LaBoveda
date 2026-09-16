import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/cripto", {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      next: { revalidate: 300 } // Cache por 5 minutos
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch from DolarAPI: ${res.status}`);
    }

    const data = await res.json();

    return NextResponse.json({
      casa: "cripto",
      nombre: data.nombre || "Cripto",
      compra: data.compra,
      venta: data.venta,
      fechaActualizacion: data.fechaActualizacion || new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching Dólar Cripto rate:", error);
    return NextResponse.json({ error: "No se pudo obtener la cotización del dólar cripto" }, { status: 500 });
  }
}
