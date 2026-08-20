import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";

/**
 * REST API Endpoint for Gemini Spark / External Automations
 * /api/mcp/clases
 * 
 * Supports GET (consultar), POST (crear), PUT (actualizar), DELETE (cancelar)
 */

function getUserId(request: Request): string {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") || process.env.DEFAULT_USER_UID || "default_user";
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

    const snap = await getDocs(collection(db, "users", userId, "tutorClasses"));
    let classes = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    if (alumno) {
      classes = classes.filter((c) => c.studentName?.toLowerCase().includes(alumno));
    }
    if (fechaInicio) {
      classes = classes.filter((c) => c.dateTime?.slice(0, 10) >= fechaInicio);
    }
    if (fechaFin) {
      classes = classes.filter((c) => c.dateTime?.slice(0, 10) <= fechaFin);
    }

    classes.sort((a, b) => (a.dateTime || "").localeCompare(b.dateTime || ""));

    const totalHours = classes.reduce((acc, c) => acc + (c.duration || 60), 0) / 60;
    const totalAmount = classes.reduce((acc, c) => acc + (c.amount || 0), 0);

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

// POST: Crear clase
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = body.userId || getUserId(request);
    const {
      alumno,
      materia,
      fecha,
      hora_inicio,
      duracion_minutos = 60,
      modalidad = "virtual",
      tipo = "CET",
      tarifa_ars = 10000,
      notas = "",
    } = body;

    if (!alumno || !materia || !fecha || !hora_inicio) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios: alumno, materia, fecha, hora_inicio" },
        { status: 400 }
      );
    }

    const amount = Math.round((tarifa_ars * duracion_minutos) / 60);
    const dateTime = `${fecha}T${hora_inicio}`;

    const payload = {
      studentName: alumno,
      subject: materia,
      modality: modalidad,
      type: tipo,
      dateTime,
      duration: duracion_minutos,
      amount,
      notes: notas || `Clase de ${materia} (${modalidad})`,
      createdAt: new Date().toISOString(),
    };

    const docRef = await addDoc(collection(db, "users", userId, "tutorClasses"), payload);

    return NextResponse.json({
      success: true,
      classId: docRef.id,
      message: `Clase creada con éxito para ${alumno}`,
      class: { id: docRef.id, ...payload },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Actualizar clase
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const userId = body.userId || getUserId(request);
    const { id_clase, nueva_fecha, nuevo_horario, duracion_minutos, alumno, materia, modalidad, notas } = body;

    if (!id_clase) {
      return NextResponse.json({ error: "Se requiere id_clase" }, { status: 400 });
    }

    const classRef = doc(db, "users", userId, "tutorClasses", id_clase);
    const classSnap = await getDoc(classRef);
    if (!classSnap.exists()) {
      return NextResponse.json({ error: "Clase no encontrada" }, { status: 404 });
    }

    const existing = classSnap.data() as any;
    const updates: any = { updatedAt: new Date().toISOString() };

    if (alumno) updates.studentName = alumno;
    if (materia) updates.subject = materia;
    if (modalidad) updates.modality = modalidad;
    if (notas) updates.notes = notas;
    if (duracion_minutos) updates.duration = duracion_minutos;

    let datePart = existing.dateTime?.slice(0, 10) || "";
    let timePart = existing.dateTime?.slice(11, 16) || "";
    if (nueva_fecha) datePart = nueva_fecha;
    if (nuevo_horario) timePart = nuevo_horario;
    updates.dateTime = `${datePart}T${timePart}`;

    await updateDoc(classRef, updates);

    return NextResponse.json({
      success: true,
      message: `Clase ${id_clase} actualizada correctamente`,
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
    const id_clase = searchParams.get("id_clase");

    if (!id_clase) {
      return NextResponse.json({ error: "Se requiere id_clase" }, { status: 400 });
    }

    await deleteDoc(doc(db, "users", userId, "tutorClasses", id_clase));

    return NextResponse.json({
      success: true,
      message: `Clase ${id_clase} eliminada con éxito`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
