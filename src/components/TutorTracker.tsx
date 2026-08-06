"use client";

import { useState, useEffect, useCallback } from "react";
import {
  GraduationCap, Trash2, Pencil, Printer, Settings,
  ChevronLeft, ChevronRight, X, Check, BookOpen, Clock,
  Monitor, Users, Building2, User, Save, AlertCircle,
  CalendarDays, LayoutGrid, Timer
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  updateDoc, query, orderBy, setDoc, getDoc
} from "firebase/firestore";

// ─── Types ─────────────────────────────────────────────────────────────────

type ClassModality = "presencial" | "virtual";
type ClassType = "CET" | "privada";

type TutorClass = {
  id: string;
  studentName: string;
  subject: string;
  modality: ClassModality;
  type: ClassType;
  dateTime: string;   // ISO-like "YYYY-MM-DDTHH:MM" — start time
  duration: number;   // minutes (30, 60, 90 …)
  amount: number;     // ARS
  notes?: string;
};

type TutorSettings = {
  cetRatePresencial: number;
  cetRateVirtual: number;
};

const DEFAULT_SETTINGS: TutorSettings = {
  cetRatePresencial: 0,
  cetRateVirtual: 0,
};

// Duration options in minutes (30-min steps)
const DURATION_OPTIONS = [
  { label: "1 hora",     value: 60  },
  { label: "1 h 30 min", value: 90  },
  { label: "2 horas",    value: 120 },
  { label: "2 h 30 min", value: 150 },
  { label: "3 horas",    value: 180 },
  { label: "3 h 30 min", value: 210 },
  { label: "4 horas",    value: 240 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatARS(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateDisplay(dt: string) {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTimeDisplay(dt: string) {
  if (!dt) return "";
  const d = new Date(dt);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Add minutes to a "HH:MM" string, returns "HH:MM" */
function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatDuration(minutes: number) {
  const opt = DURATION_OPTIONS.find((o) => o.value === minutes);
  if (opt) return opt.label;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function getMonthName(month: number, year: number) {
  return new Date(year, month, 1).toLocaleString("es-AR", {
    month: "long",
    year: "numeric",
  });
}

function monthKey(dt: string) {
  return dt.slice(0, 7);
}

function todayDate() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowTime() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Print styles ───────────────────────────────────────────────────────────

const PRINT_STYLE_ID = "tutor-print-styles";

function ensurePrintStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @media print {
      body > *:not(#tutor-print-root) { display: none !important; }
      #tutor-print-root { display: block !important; position: fixed; inset: 0; background: white; z-index: 99999; padding: 32px; font-family: Arial, sans-serif; color: #111; }
      #tutor-print-root h2 { font-size: 20px; margin-bottom: 4px; }
      #tutor-print-root table { width: 100%; border-collapse: collapse; font-size: 13px; }
      #tutor-print-root th { background: #1e293b; color: white; padding: 8px 10px; text-align: left; }
      #tutor-print-root td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
      #tutor-print-root tr:nth-child(even) td { background: #f8fafc; }
      #tutor-print-root .subtotal-row td { font-weight: bold; background: #eff6ff; }
      #tutor-print-root .header-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; }
      #tutor-print-root .logo-title { font-size: 24px; font-weight: bold; color: #1e3a5f; }
      #tutor-print-root .student-section { margin-top: 16px; }
      #tutor-print-root .student-title { font-size: 15px; font-weight: bold; color: #1e3a5f; margin-bottom: 6px; border-left: 3px solid #3b82f6; padding-left: 8px; }
      #tutor-print-root .grand-total { margin-top: 24px; padding: 12px 16px; background: #1e3a5f; color: white; text-align: right; font-size: 16px; font-weight: bold; border-radius: 4px; }
      #tutor-print-root .footer { margin-top: 24px; font-size: 11px; color: #999; text-align: center; }
    }
    @media screen { #tutor-print-root { display: none !important; } }
  `;
  document.head.appendChild(style);
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function TutorTracker() {
  const { user } = useAuth();

  // ── Data state
  const [classes, setClasses] = useState<TutorClass[]>([]);
  const [settings, setSettings] = useState<TutorSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);

  // ── View state
  const [activeView, setActiveView] = useState<"calendar" | "list">("calendar");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // ── Settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPresencial, setSettingsPresencial] = useState("");
  const [settingsVirtual, setSettingsVirtual] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  // ── Form state (always visible, no toggle)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formStudentName, setFormStudentName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formModality, setFormModality] = useState<ClassModality>("presencial");
  const [formType, setFormType] = useState<ClassType>("CET");
  const [formDate, setFormDate] = useState(todayDate);
  const [formStartTime, setFormStartTime] = useState(nowTime);
  const [formDuration, setFormDuration] = useState<number>(60);
  const [formAmount, setFormAmount] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  // ── Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── Derived: unique sorted students & subjects ─────────────────────────

  const uniqueStudents = Array.from(new Set(classes.map((c) => c.studentName)))
    .sort((a, b) => a.localeCompare(b, "es"));

  const uniqueSubjects = Array.from(new Set(classes.map((c) => c.subject)))
    .sort((a, b) => a.localeCompare(b, "es"));

  // ─── Computed end time for display ──────────────────────────────────────

  const formEndTime = formStartTime
    ? addMinutesToTime(formStartTime, formDuration)
    : "";

  // ─── Firestore paths ────────────────────────────────────────────────────

  const classesColPath = useCallback(() => {
    if (!user) return null;
    return collection(db, "users", user.uid, "tutorClasses");
  }, [user]);

  const settingsDocPath = useCallback(() => {
    if (!user) return null;
    return doc(db, "users", user.uid, "settings", "tutor");
  }, [user]);

  // ─── Load data ──────────────────────────────────────────────────────────

  useEffect(() => {
    setIsClient(true);
    ensurePrintStyles();
  }, []);

  useEffect(() => {
    if (!user) return;
    const col = classesColPath();
    if (!col) return;

    const load = async () => {
      setLoading(true);
      try {
        const settingsRef = settingsDocPath();
        if (settingsRef) {
          const snap = await getDoc(settingsRef);
          if (snap.exists()) {
            const data = snap.data() as TutorSettings;
            setSettings(data);
            setSettingsPresencial(String(data.cetRatePresencial));
            setSettingsVirtual(String(data.cetRateVirtual));
          }
        }

        const q = query(col, orderBy("dateTime", "desc"));
        const snap = await getDocs(q);
        const loaded: TutorClass[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TutorClass, "id">),
        }));
        setClasses(loaded);
      } catch (e) {
        console.error("TutorTracker load error:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, classesColPath, settingsDocPath]);

  // ─── Settings save ──────────────────────────────────────────────────────

  const handleSaveSettings = async () => {
    const ref = settingsDocPath();
    if (!ref) return;
    setSavingSettings(true);
    try {
      const newSettings: TutorSettings = {
        cetRatePresencial: Number(settingsPresencial) || 0,
        cetRateVirtual: Number(settingsVirtual) || 0,
      };
      await setDoc(ref, newSettings);
      setSettings(newSettings);
      setShowSettings(false);
    } catch (e) {
      console.error("Settings save error:", e);
    } finally {
      setSavingSettings(false);
    }
  };

  // ─── Auto-fill amount when type or modality changes ─────────────────────

  useEffect(() => {
    if (formType === "CET") {
      const rate =
        formModality === "presencial"
          ? settings.cetRatePresencial
          : settings.cetRateVirtual;
      setFormAmount(String(rate));
    }
  }, [formType, formModality, settings]);

  // ─── Reset form to blank ────────────────────────────────────────────────

  function resetForm() {
    setEditingId(null);
    setFormStudentName("");
    setFormSubject("");
    setFormModality("presencial");
    setFormType("CET");
    setFormDate(todayDate());
    setFormStartTime(nowTime());
    setFormDuration(60);
    setFormAmount(String(settings.cetRatePresencial));
    setFormNotes("");
  }

  // ─── Load class into form for editing ───────────────────────────────────

  function openEditForm(cls: TutorClass) {
    setEditingId(cls.id);
    setFormStudentName(cls.studentName);
    setFormSubject(cls.subject);
    setFormModality(cls.modality);
    setFormType(cls.type);
    // Split dateTime back into date + time
    const [datePart, timePart] = cls.dateTime.split("T");
    setFormDate(datePart ?? todayDate());
    setFormStartTime(timePart?.slice(0, 5) ?? nowTime());
    setFormDuration(cls.duration ?? 60);
    setFormAmount(String(cls.amount));
    setFormNotes(cls.notes ?? "");
    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ─── Submit form ────────────────────────────────────────────────────────

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const col = classesColPath();
    if (!col || !user) return;
    setFormSaving(true);

    const dateTime = `${formDate}T${formStartTime}`;

    const payload: Omit<TutorClass, "id"> = {
      studentName: formStudentName.trim(),
      subject: formSubject.trim(),
      modality: formModality,
      type: formType,
      dateTime,
      duration: formDuration,
      amount: Number(formAmount) || 0,
      notes: formNotes.trim(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, "users", user.uid, "tutorClasses", editingId), payload);
        setClasses((prev) =>
          prev
            .map((c) => (c.id === editingId ? { ...payload, id: editingId } : c))
            .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
        );
      } else {
        const ref = await addDoc(col, payload);
        setClasses((prev) =>
          [{ ...payload, id: ref.id }, ...prev].sort(
            (a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()
          )
        );
      }
      resetForm();
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setFormSaving(false);
    }
  }

  // ─── Delete ─────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "tutorClasses", id));
      setClasses((prev) => prev.filter((c) => c.id !== id));
      if (editingId === id) resetForm();
    } catch (e) {
      console.error("Delete error:", e);
    } finally {
      setDeletingId(null);
    }
  }

  // ─── Month navigation ───────────────────────────────────────────────────

  function prevMonth() {
    setSelectedMonth(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
    );
  }

  function nextMonth() {
    setSelectedMonth(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
    );
  }

  // ─── Filtered classes ────────────────────────────────────────────────────

  const currentMonthKey = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, "0")}`;
  const monthClasses = classes.filter((c) => monthKey(c.dateTime) === currentMonthKey);
  const cetMonthClasses = monthClasses.filter((c) => c.type === "CET");

  const totalMonth = monthClasses.reduce((s, c) => s + c.amount, 0);
  const totalCET = cetMonthClasses.reduce((s, c) => s + c.amount, 0);
  const totalPrivate = monthClasses.filter((c) => c.type === "privada").reduce((s, c) => s + c.amount, 0);

  // ─── Calendar grid ───────────────────────────────────────────────────────

  const firstDay = new Date(selectedMonth.year, selectedMonth.month, 1).getDay();
  const daysInMonth = new Date(selectedMonth.year, selectedMonth.month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;

  const classesByDay: Record<number, TutorClass[]> = {};
  monthClasses.forEach((c) => {
    const day = new Date(c.dateTime).getDate();
    if (!classesByDay[day]) classesByDay[day] = [];
    classesByDay[day].push(c);
  });

  // ─── Print report ────────────────────────────────────────────────────────

  function handlePrint() {
    if (typeof window === "undefined") return;

    const byStudent: Record<string, TutorClass[]> = {};
    cetMonthClasses.forEach((c) => {
      if (!byStudent[c.studentName]) byStudent[c.studentName] = [];
      byStudent[c.studentName].push(c);
    });

    const grandTotal = cetMonthClasses.reduce((s, c) => s + c.amount, 0);
    const monthLabel = getMonthName(selectedMonth.month, selectedMonth.year);
    const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

    const studentsHTML = Object.entries(byStudent)
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([studentName, clsList]) => {
        const studentTotal = clsList.reduce((s, c) => s + c.amount, 0);
        const rows = clsList
          .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
          .map(
            (c) => `
            <tr>
              <td>${formatDateDisplay(c.dateTime)} ${formatTimeDisplay(c.dateTime)}</td>
              <td>${c.subject}</td>
              <td>${c.modality === "presencial" ? "Presencial" : "Virtual"}</td>
              <td>${formatDuration(c.duration ?? 60)}</td>
              <td style="text-align:right;">${formatARS(c.amount)}</td>
            </tr>`
          ).join("");
        return `
          <div class="student-section">
            <div class="student-title">${studentName}</div>
            <table>
              <thead>
                <tr>
                  <th>Fecha y Hora</th><th>Materia</th><th>Modalidad</th><th>Duración</th><th style="text-align:right;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr class="subtotal-row">
                  <td colspan="4">Subtotal (${clsList.length} clase${clsList.length !== 1 ? "s" : ""})</td>
                  <td style="text-align:right;">${formatARS(studentTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>`;
      }).join("");

    const printRoot = document.getElementById("tutor-print-root") ?? document.createElement("div");
    printRoot.id = "tutor-print-root";
    printRoot.innerHTML = `
      <div class="header-bar">
        <div>
          <div class="logo-title">Centro de Estudios Turing</div>
          <div style="font-size:13px;color:#666;margin-top:4px;">Informe de Clases — ${monthLabelCap}</div>
        </div>
        <div style="text-align:right;font-size:12px;color:#666;">
          Generado: ${new Date().toLocaleDateString("es-AR")}<br/>
          ${cetMonthClasses.length} clase${cetMonthClasses.length !== 1 ? "s" : ""} registrada${cetMonthClasses.length !== 1 ? "s" : ""}
        </div>
      </div>
      ${studentsHTML}
      <div class="grand-total">TOTAL A COBRAR: ${formatARS(grandTotal)}</div>
      <div class="footer">Documento generado automáticamente — Centro de Estudios Turing</div>
    `;

    if (!document.getElementById("tutor-print-root")) {
      document.body.appendChild(printRoot);
    }
    window.print();
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  if (!isClient || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Cargando clases...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-10 h-10 text-amber-400" />
        <p className="text-gray-400">Tenés que iniciar sesión para usar esta herramienta.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Hidden datalists for autocomplete ───────────────────── */}
      <datalist id="dl-students">
        {uniqueStudents.map((n) => <option key={n} value={n} />)}
      </datalist>
      <datalist id="dl-subjects">
        {uniqueSubjects.map((s) => <option key={s} value={s} />)}
      </datalist>

      {/* ═══════════════════════════════════════════════════════════
          FORM — always visible at top
      ═══════════════════════════════════════════════════════════ */}
      <div className="glass-panel rounded-2xl p-6 border-emerald-500/20 shadow-lg">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl">
              <GraduationCap className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="font-bold text-gray-100 text-lg">
              {editingId ? "Editando Clase" : "Nueva Clase"}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {editingId && (
              <button
                onClick={resetForm}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium text-gray-400 hover:text-white transition-colors"
                style={{ borderColor: "var(--border)" }}
              >
                <X className="w-3.5 h-3.5" /> Cancelar edición
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

          {/* Student Name — with autocomplete */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
              Alumno *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                id="form-student-name"
                required
                type="text"
                list="dl-students"
                value={formStudentName}
                onChange={(e) => setFormStudentName(e.target.value)}
                placeholder="Ej: Juan García"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
          </div>

          {/* Subject — with autocomplete */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
              Materia *
            </label>
            <div className="relative">
              <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                id="form-subject"
                required
                type="text"
                list="dl-subjects"
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                placeholder="Ej: Matemáticas, Física..."
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
              Fecha *
            </label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                id="form-date"
                required
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Start time */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
              Hora de inicio *
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                id="form-start-time"
                required
                type="time"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide flex items-center gap-2">
              <Timer className="w-3.5 h-3.5" /> Duración
              {formStartTime && (
                <span className="text-emerald-400 font-semibold normal-case text-[11px] ml-1">
                  → hasta {formEndTime}
                </span>
              )}
            </label>
            <select
              id="form-duration"
              value={formDuration}
              onChange={(e) => setFormDuration(Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all [color-scheme:dark]"
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Modality */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
              Modalidad *
            </label>
            <div className="flex gap-2 h-[42px]">
              <button
                type="button"
                id="form-modality-presencial"
                onClick={() => setFormModality("presencial")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-medium border transition-all ${
                  formModality === "presencial"
                    ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
                    : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                }`}
              >
                <Users className="w-4 h-4" /> Presencial
              </button>
              <button
                type="button"
                id="form-modality-virtual"
                onClick={() => setFormModality("virtual")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-medium border transition-all ${
                  formModality === "virtual"
                    ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                    : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                }`}
              >
                <Monitor className="w-4 h-4" /> Virtual
              </button>
            </div>
          </div>

          {/* Type CET / Privada */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
              Tipo *
            </label>
            <div className="flex gap-2 h-[42px]">
              <button
                type="button"
                id="form-type-cet"
                onClick={() => setFormType("CET")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-medium border transition-all ${
                  formType === "CET"
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                    : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                }`}
              >
                <Building2 className="w-4 h-4" /> CET
              </button>
              <button
                type="button"
                id="form-type-privada"
                onClick={() => setFormType("privada")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-medium border transition-all ${
                  formType === "privada"
                    ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                    : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                }`}
              >
                <User className="w-4 h-4" /> Privada
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
              Valor (ARS)
              {formType === "CET" && (
                <span className="ml-2 text-emerald-500/70 normal-case text-[10px]">autocompletado</span>
              )}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                id="form-amount"
                type="number"
                min="0"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="md:col-span-2 xl:col-span-1">
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
              Notas (opcional)
            </label>
            <input
              id="form-notes"
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Temas, observaciones..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>

          {/* Submit */}
          <div className="md:col-span-2 xl:col-span-3 flex justify-end">
            <button
              id="btn-save-class"
              type="submit"
              disabled={formSaving}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold text-sm hover:from-emerald-400 hover:to-teal-400 transition-all disabled:opacity-60 shadow-lg shadow-emerald-900/30"
            >
              {formSaving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {editingId ? "Actualizar Clase" : "Guardar Clase"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Settings modal ───────────────────────────────────────── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel rounded-2xl p-8 w-full max-w-md space-y-6 shadow-2xl border-emerald-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-xl">
                  <Building2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-100">Tarifas CET</h3>
                  <p className="text-xs text-gray-500">Centro de Estudios Turing</p>
                </div>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" /> Valor hora Presencial (ARS)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    id="settings-cet-presencial"
                    type="number"
                    min="0"
                    value={settingsPresencial}
                    onChange={(e) => setSettingsPresencial(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-4 py-3 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-purple-400" /> Valor hora Virtual (ARS)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    id="settings-cet-virtual"
                    type="number"
                    min="0"
                    value={settingsVirtual}
                    onChange={(e) => setSettingsVirtual(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-4 py-3 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border text-gray-400 hover:text-white hover:border-white/20 transition-all text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Cancelar
              </button>
              <button
                id="btn-save-settings"
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold text-sm hover:from-emerald-400 hover:to-teal-400 transition-all disabled:opacity-60"
              >
                {savingSettings ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Action bar ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            id="btn-print-report"
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-sm hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-900/30 hover:scale-105 active:scale-95"
          >
            <Printer className="w-4 h-4" /> Informe CET
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 glass-panel rounded-xl p-1">
            <button
              id="btn-view-calendar"
              onClick={() => setActiveView("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeView === "calendar" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <CalendarDays className="w-4 h-4" /> Calendario
            </button>
            <button
              id="btn-view-list"
              onClick={() => setActiveView("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeView === "list" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <LayoutGrid className="w-4 h-4" /> Lista
            </button>
          </div>

          <button
            id="btn-settings"
            onClick={() => {
              setSettingsPresencial(String(settings.cetRatePresencial));
              setSettingsVirtual(String(settings.cetRateVirtual));
              setShowSettings(true);
            }}
            className="p-2 glass-panel rounded-xl text-gray-400 hover:text-emerald-400 transition-colors"
            title="Configurar tarifas CET"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Month navigator + stats ──────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button id="btn-prev-month" onClick={prevMonth} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-gray-100 font-semibold capitalize text-lg min-w-[180px] text-center">
            {getMonthName(selectedMonth.month, selectedMonth.year)}
          </span>
          <button id="btn-next-month" onClick={nextMonth} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <div className="text-center">
            <p className="text-gray-500 text-xs uppercase tracking-wide">Clases</p>
            <p className="text-gray-100 font-bold text-lg">{monthClasses.length}</p>
          </div>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <p className="text-gray-500 text-xs uppercase tracking-wide">CET</p>
            <p className="text-emerald-400 font-bold text-lg">{formatARS(totalCET)}</p>
          </div>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <p className="text-gray-500 text-xs uppercase tracking-wide">Privadas</p>
            <p className="text-amber-400 font-bold text-lg">{formatARS(totalPrivate)}</p>
          </div>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <p className="text-gray-500 text-xs uppercase tracking-wide">Total</p>
            <p className="text-gray-100 font-bold text-lg">{formatARS(totalMonth)}</p>
          </div>
        </div>
      </div>

      {/* ── Calendar view ────────────────────────────────────────── */}
      {activeView === "calendar" && (
        <div className="glass-panel rounded-2xl p-4 md:p-6">
          <div className="grid grid-cols-7 mb-2">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="text-center text-xs text-gray-500 font-semibold py-2 uppercase tracking-wide">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[60px] md:min-h-[80px]" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayClasses = classesByDay[day] ?? [];
              const isToday =
                new Date().getDate() === day &&
                new Date().getMonth() === selectedMonth.month &&
                new Date().getFullYear() === selectedMonth.year;

              return (
                <div
                  key={day}
                  className={`rounded-xl p-1.5 md:p-2 min-h-[60px] md:min-h-[80px] border transition-colors ${
                    isToday
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : dayClasses.length > 0 ? "border-white/10 bg-white/3" : "border-transparent"
                  }`}
                >
                  <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday ? "bg-emerald-500 text-white" : "text-gray-400"
                  }`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayClasses.slice(0, 3).map((cls) => (
                      <div
                        key={cls.id}
                        onClick={() => openEditForm(cls)}
                        title={`${cls.studentName} — ${cls.subject} (${formatDuration(cls.duration ?? 60)})`}
                        className={`text-[10px] leading-tight px-1.5 py-0.5 rounded-md cursor-pointer truncate font-medium transition-opacity hover:opacity-80 ${
                          cls.type === "CET" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {cls.studentName.split(" ")[0]}
                      </div>
                    ))}
                    {dayClasses.length > 3 && (
                      <div className="text-[10px] text-gray-500 px-1">+{dayClasses.length - 3} más</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {monthClasses.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No hay clases en este mes.</p>
            </div>
          )}
        </div>
      )}

      {/* ── List view ────────────────────────────────────────────── */}
      {activeView === "list" && (
        <div className="space-y-3">
          {monthClasses.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center text-gray-500">
              <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No hay clases en este mes.</p>
            </div>
          ) : (
            monthClasses.map((cls) => (
              <div
                key={cls.id}
                className={`glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 group transition-all ${
                  editingId === cls.id ? "border-emerald-500/40 ring-1 ring-emerald-500/20" : "hover:border-white/15"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${cls.type === "CET" ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-100">{cls.studentName}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        cls.type === "CET" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                      }`}>{cls.type}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                        cls.modality === "presencial" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"
                      }`}>
                        {cls.modality === "presencial" ? "Presencial" : "Virtual"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5">{cls.subject}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDateDisplay(cls.dateTime)} · {formatTimeDisplay(cls.dateTime)} → {addMinutesToTime(cls.dateTime.slice(11, 16), cls.duration ?? 60)} · {formatDuration(cls.duration ?? 60)}
                    </p>
                    {cls.notes && <p className="text-xs text-gray-600 mt-0.5 italic">{cls.notes}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-gray-100 font-bold text-base">{formatARS(cls.amount)}</span>
                  <button
                    onClick={() => openEditForm(cls)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 transition-all opacity-0 group-hover:opacity-100"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {deletingId === cls.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(cls.id)} className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeletingId(null)} className="p-1.5 rounded-lg bg-white/5 text-gray-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(cls.id)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── CET rates info bar ───────────────────────────────────── */}
      <div className="glass-panel rounded-2xl px-5 py-3 flex flex-wrap gap-4 items-center text-sm text-gray-400">
        <Building2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <span>Tarifas CET:</span>
        <span className="text-gray-200">Presencial: <span className="text-emerald-400 font-semibold">{formatARS(settings.cetRatePresencial)}</span></span>
        <span className="text-gray-200">Virtual: <span className="text-purple-400 font-semibold">{formatARS(settings.cetRateVirtual)}</span></span>
        {settings.cetRatePresencial === 0 && settings.cetRateVirtual === 0 && (
          <span className="text-amber-400 text-xs">⚠ Configurá las tarifas con el botón ⚙</span>
        )}
      </div>
    </div>
  );
}
