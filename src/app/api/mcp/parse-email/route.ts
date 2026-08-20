import { NextResponse } from "next/server";
import { parseClassEmail } from "@/mcp/tools/classes";

/**
 * POST /api/mcp/parse-email
 * Analyzes notification emails from Centro de Estudios Turing (CET) or private students
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { body: emailBody, subject, sender } = body;

    if (!emailBody) {
      return NextResponse.json(
        { error: "Se requiere el cuerpo del correo (campo 'body')" },
        { status: 400 }
      );
    }

    const result = parseClassEmail({ body: emailBody, subject, sender });
    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
