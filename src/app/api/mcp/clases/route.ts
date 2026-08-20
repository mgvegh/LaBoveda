import { NextResponse } from "next/server";
import {
  restGetClasses,
  restGetTutorSettings,
  restAddClass,
  restUpdateClass,
  restDeleteClass,
} from "@/lib/firestore-rest";

/**
 * REST API Endpoint for Gemini Spark / Google Apps Script / External Automations
 * /api/mcp/clases
 * 
 * Ultra-fast REST implementation with dynamic CET rates and intelligent deduplication
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

function formatStudentName(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizeStr(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function isSimilarStudent(a: string, b: string): boolean {
  const s1 = normalizeStr(a);
  const s2 = normalizeStr(b);
  if (!s1 || !s2) return false;
  if (s1 === s2) return true;
  // Prefix / nickname matches (e.g. "manu" vs "manuel", "gala" vs "gala", "fran" vs "francisco")
  if (s1.length >= 3 && s2.length >= 3) {
    if (s1.startsWith(s2) || s2.startsWith(s1)) return true;
    if (s1.includes(s2) || s2.includes(s1)) return true;
  }
  return false;
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

// POST: Crear clase (con deduplicación inteligente y tarifas oficiales)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = getUserId(request, body);

    const rawStudent = body.alumno || body.studentName;
    const studentName = formatStudentName(rawStudent);
    const subject = body.materia || body.subject;
    const modality = body.modalidad || body.modality || "virtual";
    const type = body.tipo || body.type || "CET";
    const duration = Number(body.duracion_minutos || body.duration || 60);
    const calendarEventId = body.calendarEventId || body.eventId || "";
    const rawNotes = (body.notes || body.notas || "").trim();

    // Clean notes: do not store redundant "Sincronizado desde..." or "Clase de..."
    let notes = "";
    if (rawNotes && !rawNotes.startsWith("Sincronizado desde") && !rawNotes.startsWith("Clase de")) {
      notes = rawNotes;
    }

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

    // Dynamic Rate Calculation from User Settings
    let rate = Number(body.tarifa_ars || body.rate || 0);
    if (!rate) {
      const userSettings = await restGetTutorSettings(userId);
      if (modality === "presencial") {
        rate = userSettings.cetRatePresencial || 12000;
      } else {
        rate = userSettings.cetRateVirtual || 10000;
      }
    }

    const amount = Math.round((rate * duration) / 60);

    const payload: Record<string, any> = {
      studentName,
      subject,
      modality,
      type,
      dateTime,
      duration,
      amount,
      calendarEventId,
      notes,
      updatedAt: new Date().toISOString(),
    };

    // Smart deduplication check
    const existingClasses = await restGetClasses(userId);
    const targetDate = dateTime.slice(0, 10);
    const targetTime = dateTime.slice(11, 16);

    const match = existingClasses.find((c: any) => {
      if (calendarEventId && c.calendarEventId === calendarEventId) return true;
      
      const existingDate = (c.dateTime || "").slice(0, 10);
      const existingTime = (c.dateTime || "").slice(11, 16);

      // Same date check
      if (existingDate === targetDate) {
        // 1. Same or similar student name
        if (isSimilarStudent(c.studentName, studentName)) {
          // If exact time matches or within 45 mins, it's the exact same class
          if (existingTime === targetTime) return true;
          const [eh, em] = existingTime.split(":").map(Number);
          const [th, tm] = targetTime.split(":").map(Number);
          if (!isNaN(eh) && !isNaN(th)) {
            const diffMins = Math.abs((eh * 60 + em) - (th * 60 + tm));
            if (diffMins <= 45) return true;
          }
          // If no time is specified or either is 00:00, match by date and student
          if (!existingTime || !targetTime || existingTime === "00:00" || targetTime === "00:00") {
            return true;
          }
        }
      }
      return false;
    });

    if (match) {
      // Keep existing clean studentName and notes if already populated
      if (match.studentName && match.studentName !== match.studentName.toUpperCase()) {
        payload.studentName = match.studentName;
      }
      if (!notes && match.notes) {
        payload.notes = match.notes;
      }
      await restUpdateClass(userId, match.id, payload);
      return NextResponse.json({
        success: true,
        isUpdate: true,
        classId: match.id,
        message: `Clase existente detectada y actualizada con tarifa oficial para ${payload.studentName}`,
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
      message: `Clase creada con éxito para ${studentName} con tarifa oficial`,
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
    if (body.notas !== undefined || body.notes !== undefined) updates.notes = body.notas ?? body.notes;
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
