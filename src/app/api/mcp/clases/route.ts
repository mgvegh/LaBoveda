import { NextResponse } from "next/server";
import {
  restGetClasses,
  restAddClass,
  restUpdateClass,
  restDeleteClass,
} from "@/lib/firestore-rest";

/**
 * REST API Endpoint for Gemini Spark / Google Apps Script / External Automations
 * /api/mcp/clases
 * 
 * Ultra-fast REST implementation for Vercel Serverless
 */

export const dynamic = "force-dynamic";

function getUserId(request: Request, body?: any): string {
  const { searchParams } = new URL(request.url);
  const userId =
    body?.userId ||
    searchParams.get("userId") ||
    process.env.DEFAULT_USER_UID ||
    "default_user";
  return userId;
}

// GET: Consultar clases
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = getUserId(request);
    const alumno = searchParams.get("alumno")?.toLowerCase();
    const fechaInicio = searchParams.get("fecha_inicio");
    const fechaFin = searchParams.get("fecha_fin");

    let classes = await restGetClasses(userId);

    if (alumno) {
      classes = classes.filter((c: any) => c.studentName?.toLowerCase().includes(alumno));
    }
    if (fechaInicio) {
      classes = classes.filter((c: any) => c.dateTime?.slice(0, 10) >= fechaInicio);
    }
    if (fechaFin) {
      classes = classes.filter((c: any) => c.dateTime?.slice(0, 10) <= fechaFin);
    }

    classes.sort((a: any, b: any) => (a.dateTime || "").localeCompare(b.dateTime || ""));

    const totalHours = classes.reduce((acc: number, c: any) => acc + (c.duration || 60), 0) / 60;
    const totalAmount = classes.reduce((acc: number, c: any) => acc + (c.amount || 0), 0);

    return NextResponse.json({
      success: true,
      totalClasses: classes.length,
      totalHours: parseFloat(totalHours.toFixed(1)),
      totalAmountArs: totalAmount,
      classes,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Crear clase (con deduplicación por calendarEventId o fecha+alumno)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = getUserId(request, body);

    const studentName = body.alumno || body.studentName;
    const subject = body.materia || body.subject;
    const modality = body.modalidad || body.modality || "virtual";
    const type = body.tipo || body.type || "CET";
    const duration = Number(body.duracion_minutos || body.duration || 60);
    const calendarEventId = body.calendarEventId || body.eventId || "";
    const notes = body.notes || body.notas || "";

    let dateTime = body.dateTime;
    if (!dateTime && body.fecha && body.hora_inicio) {
      dateTime = `${body.fecha}T${body.hora_inicio}`;
    }

    if (!studentName || !subject || !dateTime) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios: alumno/studentName, materia/subject, fecha/dateTime" },
        { status: 400 }
      );
    }

    let rate = Number(body.tarifa_ars || body.rate || 0);
    if (!rate) {
      rate = modality === "presencial" ? 12000 : 10000;
    }

    const amount = Math.round((rate * duration) / 60);

    const payload = {
      studentName,
      subject,
      modality,
      type,
      dateTime,
      duration,
      amount,
      calendarEventId,
      notes: notes || `Clase de ${subject} (${modality})`,
      updatedAt: new Date().toISOString(),
    };

    // Deduplication check
    const existingClasses = await restGetClasses(userId);
    const match = existingClasses.find((c: any) => {
      if (calendarEventId && c.calendarEventId === calendarEventId) return true;
      if (c.dateTime === dateTime && c.studentName?.toLowerCase() === studentName.toLowerCase()) return true;
      return false;
    });

    if (match) {
      await restUpdateClass(userId, match.id, payload);
      return NextResponse.json({
        success: true,
        isUpdate: true,
        classId: match.id,
        message: `Clase actualizada correctamente para ${studentName}`,
        class: { id: match.id, ...payload },
      });
    }

    const newId = await restAddClass(userId, {
      ...payload,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      isUpdate: false,
      classId: newId,
      message: `Clase creada con éxito para ${studentName}`,
      class: { id: newId, ...payload },
    });
  } catch (error: any) {
    console.error("POST /api/mcp/clases error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Actualizar clase
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const userId = getUserId(request, body);
    const { id_clase, id } = body;
    const targetId = id_clase || id;

    if (!targetId) {
      return NextResponse.json({ error: "Se requiere id_clase o id" }, { status: 400 });
    }

    const updates: any = { updatedAt: new Date().toISOString() };

    if (body.alumno || body.studentName) updates.studentName = body.alumno || body.studentName;
    if (body.materia || body.subject) updates.subject = body.materia || body.subject;
    if (body.modalidad || body.modality) updates.modality = body.modalidad || body.modality;
    if (body.notas || body.notes) updates.notes = body.notas || body.notes;
    if (body.duracion_minutos || body.duration) updates.duration = Number(body.duracion_minutos || body.duration);

    if (body.dateTime) {
      updates.dateTime = body.dateTime;
    } else if (body.fecha && body.hora_inicio) {
      updates.dateTime = `${body.fecha}T${body.hora_inicio}`;
    }

    await restUpdateClass(userId, targetId, updates);

    return NextResponse.json({
      success: true,
      message: `Clase ${targetId} actualizada correctamente`,
      updatedFields: updates,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Cancelar / Eliminar clase
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = getUserId(request);
    const id_clase = searchParams.get("id_clase") || searchParams.get("id");

    if (!id_clase) {
      return NextResponse.json({ error: "Se requiere id_clase o id" }, { status: 400 });
    }

    await restDeleteClass(userId, id_clase);

    return NextResponse.json({
      success: true,
      message: `Clase ${id_clase} eliminada con éxito`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
