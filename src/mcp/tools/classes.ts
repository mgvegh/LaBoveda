/**
 * Tutor Classes, Email Parser, Database Operations & Google Calendar Sync Tools for MCP Server
 */

import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
  getDoc,
} from "firebase/firestore";

export interface ParsedClassEmailResult {
  action: "new" | "reschedule" | "cancel" | "unknown";
  confidence: number;
  studentName: string;
  subject: string;
  modality: "presencial" | "virtual";
  type: "CET" | "privada";
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  durationMinutes: number;
  originalDate?: string;
  originalTime?: string;
  notes: string;
  rawSummary: string;
}

export function formatStudentName(name: string): string {
  if (!name) return "";
  let clean = name.trim();

  // 1. Remove parenthesized or bracketed modality tags: (Presencial), (Virtual), (pres), (virt), [Presencial], etc.
  clean = clean.replace(/[\(\[\{]\s*(presencial|virtual|pres|virt|cet|particular|zoom|meet|online)\s*[\)\]\}]/gi, "");

  // 2. Remove trailing separators with modality: - Presencial, / Virtual, | Presencial
  clean = clean.replace(/[-–—/|]\s*(presencial|virtual|pres|virt|cet|particular|zoom|meet|online)\s*$/gi, "");

  // 3. Remove standalone trailing words: " presencial", " virtual", " cet"
  clean = clean.replace(/\s+(presencial|virtual|pres|virt|cet|particular|zoom|meet|online)$/gi, "");

  // 4. Remove leading/trailing non-alphanumeric junk or multiple spaces
  clean = clean.replace(/^[\s\-–—/|]+|[\s\-–—/|]+$/g, "").replace(/\s{2,}/g, " ").trim();

  if (!clean) return "";

  return clean
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
  if (s1.length >= 3 && s2.length >= 3) {
    if (s1.startsWith(s2) || s2.startsWith(s1)) return true;
    if (s1.includes(s2) || s2.includes(s1)) return true;
  }
  return false;
}

/**
 * Intelligent parser for Institute (Centro de Estudios Turing / CET) and private tutor notification emails
 */
export function parseClassEmail(emailContent: {
  subject?: string;
  body: string;
  sender?: string;
  receivedDate?: string;
}): ParsedClassEmailResult {
  const fullText = `${emailContent.subject || ""} \n ${emailContent.body || ""}`;
  const lower = fullText.toLowerCase();

  // 1. Detect Action
  let action: "new" | "reschedule" | "cancel" | "unknown" = "unknown";
  if (
    /\b(cancelad[ao]s?|suspendid[ao]s?|eliminad[ao]s?|anulad[ao]s?|se suspende|no se dictar[aá]|baja de clase)\b/i.test(lower)
  ) {
    action = "cancel";
  } else if (
    /\b(reprogramad[ao]s?|cambio de horario|cambio de d[ií]a|pasa para el|se traslada|modificaci[oó]n de clase)\b/i.test(lower)
  ) {
    action = "reschedule";
  } else if (
    /\b(nueva clase|asignaci[oó]n|asignad[ao]|agendad[ao]|confirmad[ao]|clase de|recordatorio|turno|instituto|cet|turing|centro de estudios turing)\b/i.test(lower)
  ) {
    action = "new";
  }

  // 2. Modality
  let modality: "presencial" | "virtual" = "virtual";
  if (/\b(presencial|sede|aula|sucursal|instituto)\b/i.test(lower)) {
    modality = "presencial";
  } else if (/\b(virtual|zoom|meet|online|teams|llamada)\b/i.test(lower)) {
    modality = "virtual";
  }

  // 3. Class Type (CET vs privada)
  let classType: "CET" | "privada" = "CET";
  if (/\b(particular|privada|particular\/a)\b/i.test(lower)) {
    classType = "privada";
  }

  // 4. Extract Student Name
  let studentName = "Alumno";
  const studentMatch =
    fullText.match(/\b(?:alumno|alumna|estudiante)\s*:?\s*(?:el|la)?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i) ||
    fullText.match(/\b(?:con|para)\s+(?:el\s+alumno|la\s+alumna)?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i);

  if (studentMatch && studentMatch[1]) {
    let candidate = formatStudentName(studentMatch[1]);
    if (
      candidate &&
      !["Nueva", "Clase", "Cet", "Instituto", "Turing", "Estimado", "Profesor", "Presencial", "Virtual"].includes(
        candidate
      )
    ) {
      studentName = candidate;
    }
  }

  // 5. Extract Subject
  let subject = "Clase Particular";
  const subjectsList = [
    "Análisis Matemático", "Analisis Matematico", "Álgebra y Geometría", "Algebra",
    "Matemática", "Matematica", "Física I", "Física II", "Fisica",
    "Química Orgánica", "Química General", "Quimica",
    "Programación", "Programacion", "Algoritmos y Estructuras de Datos",
    "Inglés", "Ingles", "Economía", "Economia", "Contabilidad", "Bioquímica", "Bioquimica"
  ];
  for (const s of subjectsList) {
    if (new RegExp(`\\b${s}\\b`, "i").test(fullText)) {
      subject = s.charAt(0).toUpperCase() + s.slice(1);
      break;
    }
  }

  // 6. Extract Date
  let date = "";
  const dateMatch =
    fullText.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/) ||
    fullText.match(/\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);

  const now = new Date();
  const currentYear = now.getFullYear();

  if (dateMatch) {
    if (dateMatch[1].length === 4) {
      const y = dateMatch[1];
      const m = dateMatch[2].padStart(2, "0");
      const d = dateMatch[3].padStart(2, "0");
      date = `${y}-${m}-${d}`;
    } else {
      const d = dateMatch[1].padStart(2, "0");
      const m = dateMatch[2].padStart(2, "0");
      let y = dateMatch[3];
      if (y.length === 2) y = `20${y}`;
      date = `${y}-${m}-${d}`;
    }
  } else {
    const namedDateMatch = fullText.match(/\b(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)?\s*(\d{1,2})\s+de\s+([a-záéíóúñ]+)/i);
    if (namedDateMatch) {
      const dayNum = parseInt(namedDateMatch[1], 10);
      const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
      const monthIndex = monthNames.findIndex((m) => namedDateMatch[2].toLowerCase().startsWith(m.slice(0, 3)));
      if (monthIndex !== -1) {
        date = `${currentYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      }
    }
  }

  if (!date) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // 7. Extract Start Time (HH:MM)
  let startTime = "18:00";
  const timeMatch =
    fullText.match(/\b(?:a las|las|horario:?|hora:?)\s*(\d{1,2})[:\.](\d{2})\s*(?:hs|hrs|h|am|pm)?/i) ||
    fullText.match(/\b(\d{1,2})[:\.](\d{2})\s*(?:hs|hrs|h)\b/i);

  if (timeMatch) {
    const hh = String(parseInt(timeMatch[1], 10)).padStart(2, "0");
    const mm = timeMatch[2] ? String(parseInt(timeMatch[2], 10)).padStart(2, "0") : "00";
    startTime = `${hh}:${mm}`;
  }

  // 8. Extract Duration
  let durationMinutes = 60;
  const explicitDurationMatch =
    fullText.match(/\b(?:duraci[oó]n:?|por)\s*(\d+(?:[\.,]\d+)?)\s*(?:hora|horas|hs|h|min|minutos)\b/i) ||
    fullText.match(/\b(\d+(?:[\.,]\d+)?)\s*(?:hora|horas)\s+de\s+clase\b/i);

  if (explicitDurationMatch) {
    const val = parseFloat(explicitDurationMatch[1].replace(",", "."));
    const matchUnit = explicitDurationMatch[0].toLowerCase();
    if (matchUnit.includes("min")) {
      durationMinutes = Math.round(val);
    } else {
      durationMinutes = Math.round(val * 60);
    }
  }

  const [h, m] = startTime.split(":").map(Number);
  const totalMins = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMins / 60) % 24;
  const endM = totalMins % 60;
  const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

  return {
    action,
    confidence: action !== "unknown" ? 0.95 : 0.5,
    studentName,
    subject,
    modality,
    type: classType,
    date,
    startTime,
    endTime,
    durationMinutes,
    notes: `Detectado automáticamente por Gemini Spark: ${subject} con ${studentName} (${modality})`,
    rawSummary: `${action.toUpperCase()}: ${subject} (${modality}) con ${studentName} el ${date} a las ${startTime}hs (${durationMinutes} min)`,
  };
}

/**
 * Format Class Object for La Bóveda (TutorTracker Firestore)
 */
export function formatTutorClassForTracker(params: {
  studentName: string;
  subject: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  durationMinutes: number;
  modality: "presencial" | "virtual";
  type: "CET" | "privada";
  rates?: { cetRatePresencial?: number; cetRateVirtual?: number; privateHourlyRate?: number };
  notes?: string;
}) {
  const {
    studentName,
    subject,
    date,
    startTime,
    durationMinutes,
    modality,
    type,
    rates = {},
    notes,
  } = params;

  let hourlyRate = 0;
  if (type === "CET") {
    hourlyRate =
      modality === "presencial"
        ? rates.cetRatePresencial || 12000
        : rates.cetRateVirtual || 10000;
  } else {
    hourlyRate = rates.privateHourlyRate || 15000;
  }

  const amount = Math.round((hourlyRate * durationMinutes) / 60);
  const dateTime = `${date}T${startTime}`;

  return {
    studentName,
    subject,
    modality,
    type,
    dateTime,
    duration: durationMinutes,
    amount,
    notes: notes || `Clase de ${subject} (${modality})`,
  };
}

/**
 * Resolve User UID from environment or fallback
 */
export function getTargetUserId(customUserId?: string): string {
  const target = customUserId || process.env.DEFAULT_USER_UID || process.env.NEXT_PUBLIC_DEFAULT_USER_UID;
  if (!target) {
    // Si no está especificado, devolvemos un ID de fallback configurable
    return "default_user";
  }
  return target;
}

/**
 * 1. Crear Clase directamente en la base de datos de La Bóveda (Firestore)
 */
export async function dbCreateClass(params: {
  alumno: string;
  materia: string;
  fecha: string; // YYYY-MM-DD
  hora_inicio: string; // HH:MM
  duracion_minutos?: number;
  hora_fin?: string;
  modalidad?: "presencial" | "virtual";
  tipo?: "CET" | "privada";
  tarifa_ars?: number;
  notas?: string;
  userId?: string;
}) {
  const userId = getTargetUserId(params.userId);
  const studentName = formatStudentName(params.alumno);
  let modality = params.modalidad;
  if (!modality) {
    modality = /presencial|pres/i.test(params.alumno) ? "presencial" : "virtual";
  }
  const type = params.tipo || "CET";

  let duration = params.duracion_minutos || 60;
  if (!params.duracion_minutos && params.hora_fin) {
    const [sh, sm] = params.hora_inicio.split(":").map(Number);
    const [eh, em] = params.hora_fin.split(":").map(Number);
    duration = (eh * 60 + em) - (sh * 60 + sm);
    if (duration <= 0) duration = 60;
  }

  // Fetch rates if not provided
  let rate = params.tarifa_ars;
  if (!rate) {
    try {
      const settingsSnap = await getDoc(doc(db, "users", userId, "settings", "tutor"));
      if (settingsSnap.exists()) {
        const s = settingsSnap.data() as any;
        rate = modality === "presencial" ? s.cetRatePresencial : s.cetRateVirtual;
      }
    } catch {
      // fallback rate
    }
    if (!rate) {
      rate = modality === "presencial" ? 12000 : 10000;
    }
  }

  const amount = Math.round((rate * duration) / 60);
  const dateTime = `${params.fecha}T${params.hora_inicio}`;

  const payload = {
    studentName,
    subject: params.materia,
    modality,
    type,
    dateTime,
    duration,
    amount,
    notes: params.notas || `Clase de ${params.materia} (${modality})`,
    updatedAt: new Date().toISOString(),
  };

  // Smart deduplication check against existing classes
  try {
    const snap = await getDocs(collection(db, "users", userId, "tutorClasses"));
    const existingClasses = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    
    const match = existingClasses.find((c: any) => {
      const existingDate = (c.dateTime || "").slice(0, 10);
      const existingTime = (c.dateTime || "").slice(11, 16);

      if (existingDate === params.fecha) {
        if (isSimilarStudent(c.studentName, studentName)) {
          if (existingTime === params.hora_inicio) return true;
          const [eh, em] = existingTime.split(":").map(Number);
          const [th, tm] = params.hora_inicio.split(":").map(Number);
          if (!isNaN(eh) && !isNaN(th) && Math.abs((eh * 60 + em) - (th * 60 + tm)) <= 45) {
            return true;
          }
          if (!existingTime || !params.hora_inicio || existingTime === "00:00" || params.hora_inicio === "00:00") {
            return true;
          }
        }
      }
      return false;
    });

    if (match) {
      payload.studentName = formatStudentName(match.studentName || studentName);
      if (!params.notas && match.notes) {
        payload.notes = match.notes;
      }
      await updateDoc(doc(db, "users", userId, "tutorClasses", match.id), payload);
      return {
        success: true,
        isUpdate: true,
        classId: match.id,
        message: `Clase existente detectada y actualizada para ${payload.studentName} el ${params.fecha} a las ${params.hora_inicio}hs ($${amount} ARS).`,
        class: { id: match.id, ...payload },
      };
    }
  } catch (dedupErr) {
    console.error("Error checking deduplication in dbCreateClass:", dedupErr);
  }

  const docRef = await addDoc(collection(db, "users", userId, "tutorClasses"), {
    ...payload,
    createdAt: new Date().toISOString(),
  });

  return {
    success: true,
    isUpdate: false,
    classId: docRef.id,
    message: `Clase creada con éxito para ${studentName} el ${params.fecha} a las ${params.hora_inicio}hs ($${amount} ARS).`,
    class: { id: docRef.id, ...payload },
  };
}

/**
 * 2. Consultar Clases en La Bóveda
 */
export async function dbGetClasses(params: {
  fecha_inicio?: string; // YYYY-MM-DD
  fecha_fin?: string; // YYYY-MM-DD
  alumno?: string;
  userId?: string;
}) {
  const userId = getTargetUserId(params.userId);
  const snap = await getDocs(collection(db, "users", userId, "tutorClasses"));
  
  let classes = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  if (params.alumno) {
    const q = params.alumno.toLowerCase();
    classes = classes.filter((c) => c.studentName?.toLowerCase().includes(q));
  }

  if (params.fecha_inicio) {
    classes = classes.filter((c) => c.dateTime?.slice(0, 10) >= params.fecha_inicio!);
  }

  if (params.fecha_fin) {
    classes = classes.filter((c) => c.dateTime?.slice(0, 10) <= params.fecha_fin!);
  }

  // Sort chronologically
  classes.sort((a, b) => (a.dateTime || "").localeCompare(b.dateTime || ""));

  const totalHours = classes.reduce((acc, c) => acc + (c.duration || 60), 0) / 60;
  const totalAmount = classes.reduce((acc, c) => acc + (c.amount || 0), 0);

  return {
    totalClasses: classes.length,
    totalHours: parseFloat(totalHours.toFixed(1)),
    totalAmountArs: totalAmount,
    classes,
  };
}

/**
 * 3. Actualizar Clase
 */
export async function dbUpdateClass(params: {
  id_clase: string;
  nueva_fecha?: string; // YYYY-MM-DD
  nuevo_horario?: string; // HH:MM
  duracion_minutos?: number;
  alumno?: string;
  materia?: string;
  modalidad?: "presencial" | "virtual";
  notas?: string;
  userId?: string;
}) {
  const userId = getTargetUserId(params.userId);
  const classRef = doc(db, "users", userId, "tutorClasses", params.id_clase);
  const classSnap = await getDoc(classRef);

  if (!classSnap.exists()) {
    throw new Error(`No se encontró la clase con ID ${params.id_clase}`);
  }

  const existing = classSnap.data() as any;
  const updates: any = { updatedAt: new Date().toISOString() };

  if (params.alumno) updates.studentName = formatStudentName(params.alumno);
  if (params.materia) updates.subject = params.materia;
  if (params.modalidad) updates.modality = params.modalidad;
  if (params.notas) updates.notes = params.notas;
  if (params.duracion_minutos) updates.duration = params.duracion_minutos;

  let datePart = existing.dateTime?.slice(0, 10) || "";
  let timePart = existing.dateTime?.slice(11, 16) || "";

  if (params.nueva_fecha) datePart = params.nueva_fecha;
  if (params.nuevo_horario) timePart = params.nuevo_horario;

  updates.dateTime = `${datePart}T${timePart}`;

  await updateDoc(classRef, updates);

  return {
    success: true,
    message: `Clase ${params.id_clase} actualizada correctamente a ${updates.dateTime}.`,
    updatedFields: updates,
  };
}

/**
 * 4. Cancelar / Eliminar Clase
 */
export async function dbDeleteClass(params: {
  id_clase: string;
  userId?: string;
}) {
  const userId = getTargetUserId(params.userId);
  const classRef = doc(db, "users", userId, "tutorClasses", params.id_clase);
  await deleteDoc(classRef);

  return {
    success: true,
    message: `Clase con ID ${params.id_clase} eliminada / cancelada con éxito en La Bóveda.`,
  };
}

/**
 * Generate Google Calendar Event Payload & ICS VEVENT
 */
export function generateGoogleCalendarEvent(params: {
  studentName: string;
  subject: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  durationMinutes: number;
  modality: "presencial" | "virtual";
  type: "CET" | "privada";
  location?: string;
  notes?: string;
  timeZone?: string;
}) {
  const {
    studentName,
    subject,
    date,
    startTime,
    durationMinutes,
    modality,
    type,
    location,
    notes,
    timeZone = "America/Argentina/Buenos_Aires",
  } = params;

  const [h, m] = startTime.split(":").map(Number);
  const totalMins = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMins / 60) % 24;
  const endM = totalMins % 60;
  const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

  const startIso = `${date}T${startTime}:00`;
  const endIso = `${date}T${endTime}:00`;

  const summary = `[${type}] ${subject} - ${studentName} (${modality === "presencial" ? "Presencial" : "Virtual"})`;
  const description = `Clase de ${subject} con el alumno/a ${studentName}.\nModalidad: ${modality}\nTipo: ${type}\nDuración: ${durationMinutes} minutos\nNotas: ${notes || "Ninguna"}`;
  const eventLocation = location || (modality === "presencial" ? "Centro de Estudios Turing (CET)" : "Google Meet / Virtual");

  const icsDate = date.replace(/-/g, "");
  const icsStart = `${icsDate}T${startTime.replace(/:/g, "")}00`;
  const icsEnd = `${icsDate}T${endTime.replace(/:/g, "")}00`;
  const icsUid = `class-${date}-${startTime.replace(/:/g, "")}-${Math.random().toString(36).slice(2, 8)}@laboveda.app`;

  const icsString = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//La Boveda//Tutor Tracker//ES",
    "BEGIN:VEVENT",
    `UID:${icsUid}`,
    `DTSTAMP:${icsDate}T000000Z`,
    `DTSTART;TZID=${timeZone}:${icsStart}`,
    `DTEND;TZID=${timeZone}:${icsEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description.replace(/\n/g, "\\n")}`,
    `LOCATION:${eventLocation}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return {
    googleCalendarPayload: {
      summary,
      description,
      location: eventLocation,
      start: {
        dateTime: `${startIso}-03:00`,
        timeZone,
      },
      end: {
        dateTime: `${endIso}-03:00`,
        timeZone,
      },
      colorId: modality === "presencial" ? "5" : "7",
    },
    icsContent: icsString,
    classDetails: {
      studentName,
      subject,
      modality,
      type,
      startDateTime: startIso,
      endDateTime: endIso,
      durationMinutes,
    },
  };
}
