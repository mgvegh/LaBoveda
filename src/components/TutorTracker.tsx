"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  GraduationCap, Plus, Trash2, Pencil, Printer, Settings,
  ChevronLeft, ChevronRight, X, Check, BookOpen, Clock,
  Monitor, Users, Building2, User, Save, AlertCircle,
  CalendarDays, LayoutGrid
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
  dateTime: string;   // ISO string  e.g. "2026-08-06T14:30"
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

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatARS(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTimeDisplay(dt: string) {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMonthName(month: number, year: number) {
  return new Date(year, month, 1).toLocaleString("es-AR", {
    month: "long",
    year: "numeric",
  });
}

/** Returns "YYYY-MM" key from a dateTime ISO string */
function monthKey(dt: string) {
  return dt.slice(0, 7); // "2026-08"
}

// ─── Print styles injected into <head> once ────────────────────────────────

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
      #tutor-print-root p { font-size: 13px; color: #555; margin-bottom: 16px; }
      #tutor-print-root table { width: 100%; border-collapse: collapse; font-size: 13px; }
      #tutor-print-root th { background: #1e293b; color: white; padding: 8px 10px; text-align: left; }
      #tutor-print-root td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
      #tutor-print-root tr:nth-child(even) td { background: #f8fafc; }
      #tutor-print-root .subtotal-row td { font-weight: bold; background: #eff6ff; }
      #tutor-print-root .total-row td { font-weight: bold; background: #1e3a5f; color: white; font-size: 14px; }
      #tutor-print-root .header-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; }
      #tutor-print-root .logo-title { font-size: 24px; font-weight: bold; color: #1e3a5f; }
      #tutor-print-root .subtitle { font-size: 13px; color: #666; margin-top: 4px; }
      #tutor-print-root .student-section { margin-top: 16px; }
      #tutor-print-root .student-title { font-size: 15px; font-weight: bold; color: #1e3a5f; margin-bottom: 6px; border-left: 3px solid #3b82f6; padding-left: 8px; }
      #tutor-print-root .grand-total { margin-top: 24px; padding: 12px 16px; background: #1e3a5f; color: white; text-align: right; font-size: 16px; font-weight: bold; border-radius: 4px; }
      #tutor-print-root .footer { margin-top: 24px; font-size: 11px; color: #999; text-align: center; }
    }
    @media screen {
      #tutor-print-root { display: none !important; }
    }
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

  // ── Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formStudentName, setFormStudentName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formModality, setFormModality] = useState<ClassModality>("presencial");
  const [formType, setFormType] = useState<ClassType>("CET");
  const [formDateTime, setFormDateTime] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  // ── Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const formRef = useRef<HTMLDivElement>(null);

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
        // Load settings
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

        // Load classes
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
    // If "privada", leave amount untouched so user can type freely
  }, [formType, formModality, settings]);

  // ─── Form helpers ───────────────────────────────────────────────────────

  function openNewForm() {
    setEditingId(null);
    setFormStudentName("");
    setFormSubject("");
    setFormModality("presencial");
    setFormType("CET");
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setFormDateTime(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
    );
    setFormAmount(String(settings.cetRatePresencial));
    setFormNotes("");
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  function openEditForm(cls: TutorClass) {
    setEditingId(cls.id);
    setFormStudentName(cls.studentName);
    setFormSubject(cls.subject);
    setFormModality(cls.modality);
    setFormType(cls.type);
    setFormDateTime(cls.dateTime);
    setFormAmount(String(cls.amount));
    setFormNotes(cls.notes ?? "");
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const col = classesColPath();
    if (!col || !user) return;
    setFormSaving(true);

    const payload: Omit<TutorClass, "id"> = {
      studentName: formStudentName.trim(),
      subject: formSubject.trim(),
      modality: formModality,
      type: formType,
      dateTime: formDateTime,
      amount: Number(formAmount) || 0,
      notes: formNotes.trim(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, "users", user.uid, "tutorClasses", editingId), payload);
        setClasses((prev) =>
          prev.map((c) => (c.id === editingId ? { ...payload, id: editingId } : c))
        );
      } else {
        const ref = await addDoc(col, payload);
        setClasses((prev) =>
          [{ ...payload, id: ref.id }, ...prev].sort(
            (a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()
          )
        );
      }
      closeForm();
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "tutorClasses", id));
      setClasses((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error("Delete error:", e);
    } finally {
      setDeletingId(null);
    }
  }

  // ─── Month navigation ───────────────────────────────────────────────────

  function prevMonth() {
    setSelectedMonth(({ year, month }) => {
      if (month === 0) return { year: year - 1, month: 11 };
      return { year, month: month - 1 };
    });
  }

  function nextMonth() {
    setSelectedMonth(({ year, month }) => {
      if (month === 11) return { year: year + 1, month: 0 };
      return { year, month: month + 1 };
    });
  }

  // ─── Filtered classes for selected month ────────────────────────────────

  const currentMonthKey = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, "0")}`;
  const monthClasses = classes.filter((c) => monthKey(c.dateTime) === currentMonthKey);
  const cetMonthClasses = monthClasses.filter((c) => c.type === "CET");

  // ─── Stats ──────────────────────────────────────────────────────────────

  const totalMonth = monthClasses.reduce((s, c) => s + c.amount, 0);
  const totalCET = cetMonthClasses.reduce((s, c) => s + c.amount, 0);
  const totalPrivate = monthClasses.filter((c) => c.type === "privada").reduce((s, c) => s + c.amount, 0);

  // ─── Calendar grid ──────────────────────────────────────────────────────

  const firstDay = new Date(selectedMonth.year, selectedMonth.month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(selectedMonth.year, selectedMonth.month + 1, 0).getDate();
  // Rotate so Monday = 0
  const startOffset = (firstDay + 6) % 7;

  // Group by day number
  const classesByDay: Record<number, TutorClass[]> = {};
  monthClasses.forEach((c) => {
    const day = new Date(c.dateTime).getDate();
    if (!classesByDay[day]) classesByDay[day] = [];
    classesByDay[day].push(c);
  });

  // ─── Print report ───────────────────────────────────────────────────────

  function handlePrint() {
    if (typeof window === "undefined") return;

    // Group CET classes by student
    const byStudent: Record<string, TutorClass[]> = {};
    cetMonthClasses.forEach((c) => {
      if (!byStudent[c.studentName]) byStudent[c.studentName] = [];
      byStudent[c.studentName].push(c);
    });

    const grandTotal = cetMonthClasses.reduce((s, c) => s + c.amount, 0);
    const monthLabel = getMonthName(selectedMonth.month, selectedMonth.year);
    const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

    // Build student rows HTML
    const studentsHTML = Object.entries(byStudent)
      .map(([studentName, clsList]) => {
        const studentTotal = clsList.reduce((s, c) => s + c.amount, 0);
        const rows = clsList
          .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
          .map(
            (c) => `
            <tr>
              <td>${formatDateTimeDisplay(c.dateTime)}</td>
              <td>${c.subject}</td>
              <td>${c.modality === "presencial" ? "Presencial" : "Virtual"}</td>
              <td style="text-align:right;">${formatARS(c.amount)}</td>
            </tr>`
          )
          .join("");
        return `
          <div class="student-section">
            <div class="student-title">${studentName}</div>
            <table>
              <thead>
                <tr>
                  <th>Fecha y Hora</th>
                  <th>Materia</th>
                  <th>Modalidad</th>
                  <th style="text-align:right;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr class="subtotal-row">
                  <td colspan="3">Subtotal (${clsList.length} clase${clsList.length !== 1 ? "s" : ""})</td>
                  <td style="text-align:right;">${formatARS(studentTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>`;
      })
      .join("");

    const printRoot = document.getElementById("tutor-print-root") ?? document.createElement("div");
    printRoot.id = "tutor-print-root";
    printRoot.innerHTML = `
      <div class="header-bar">
        <div>
          <div class="logo-title">Centro de Estudios Turing</div>
          <div class="subtitle">Informe de Clases — ${monthLabelCap}</div>
        </div>
        <div style="text-align:right;font-size:12px;color:#666;">
          Generado: ${new Date().toLocaleDateString("es-AR")}<br/>
          ${cetMonthClasses.length} clase${cetMonthClasses.length !== 1 ? "s" : ""} registrada${cetMonthClasses.length !== 1 ? "s" : ""}
        </div>
      </div>
      ${studentsHTML}
      <div class="grand-total">
        TOTAL A COBRAR: ${formatARS(grandTotal)}
      </div>
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
      {/* ── Top action bar ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            id="btn-new-class"
            onClick={openNewForm}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-900/30 hover:scale-105 active:scale-95"
          >
            <Plus className="w-4 h-4" /> Nueva Clase
          </button>

          <button
            id="btn-print-report"
            onClick={handlePrint}
            title="Imprimir informe CET del mes"
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-900/30 hover:scale-105 active:scale-95"
          >
            <Printer className="w-4 h-4" /> Informe CET
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-1 glass-panel rounded-xl p-1">
            <button
              id="btn-view-calendar"
              onClick={() => setActiveView("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeView === "calendar"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <CalendarDays className="w-4 h-4" /> Calendario
            </button>
            <button
              id="btn-view-list"
              onClick={() => setActiveView("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeView === "list"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-gray-400 hover:text-gray-200"
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

      {/* ── Settings modal ───────────────────────────────────────────── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel rounded-3xl p-8 w-full max-w-md space-y-6 shadow-2xl border-emerald-500/20">
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
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-sm"
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

      {/* ── New / Edit form ──────────────────────────────────────────── */}
      {showForm && (
        <div ref={formRef} className="glass-panel rounded-3xl p-6 border-emerald-500/20 shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 rounded-xl">
                <GraduationCap className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="font-bold text-gray-100 text-lg">
                {editingId ? "Editar Clase" : "Nueva Clase"}
              </h3>
            </div>
            <button onClick={closeForm} className="text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleFormSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Student Name */}
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
                Nombre del Alumno *
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="form-student-name"
                  required
                  type="text"
                  value={formStudentName}
                  onChange={(e) => setFormStudentName(e.target.value)}
                  placeholder="Ej: Juan García"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>

            {/* Subject */}
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
                Materia *
              </label>
              <div className="relative">
                <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="form-subject"
                  required
                  type="text"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="Ej: Matemáticas, Física..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>

            {/* Date & Time */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
                Fecha y Hora *
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  id="form-datetime"
                  required
                  type="datetime-local"
                  value={formDateTime}
                  onChange={(e) => setFormDateTime(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Modality */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
                Modalidad *
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  id="form-modality-presencial"
                  onClick={() => setFormModality("presencial")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
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
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    formModality === "virtual"
                      ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                      : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                  }`}
                >
                  <Monitor className="w-4 h-4" /> Virtual
                </button>
              </div>
            </div>

            {/* Type (CET / Privada) */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
                Tipo de Clase *
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  id="form-type-cet"
                  onClick={() => setFormType("CET")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
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
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all ${
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
                Valor de la Clase (ARS)
                {formType === "CET" && (
                  <span className="ml-2 text-emerald-500/70 normal-case text-[10px]">
                    ← autocompletado por tarifa CET
                  </span>
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
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
                Notas (opcional)
              </label>
              <textarea
                id="form-notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                placeholder="Observaciones, temas vistos, etc."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none"
              />
            </div>

            {/* Actions */}
            <div className="md:col-span-2 flex gap-3">
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-sm"
              >
                Cancelar
              </button>
              <button
                id="btn-save-class"
                type="submit"
                disabled={formSaving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold text-sm hover:from-emerald-400 hover:to-teal-400 transition-all disabled:opacity-60"
              >
                {formSaving ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {editingId ? "Actualizar" : "Guardar Clase"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Month navigator + stats ──────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            id="btn-prev-month"
            onClick={prevMonth}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-gray-100 font-semibold capitalize text-lg min-w-[180px] text-center">
            {getMonthName(selectedMonth.month, selectedMonth.year)}
          </span>
          <button
            id="btn-next-month"
            onClick={nextMonth}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <div className="text-center">
            <p className="text-gray-500 text-xs uppercase tracking-wide">Clases totales</p>
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
            <p className="text-gray-500 text-xs uppercase tracking-wide">Total mes</p>
            <p className="text-gray-100 font-bold text-lg">{formatARS(totalMonth)}</p>
          </div>
        </div>
      </div>

      {/* ── Calendar view ────────────────────────────────────────────── */}
      {activeView === "calendar" && (
        <div className="glass-panel rounded-3xl p-4 md:p-6">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="text-center text-xs text-gray-500 font-semibold py-2 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty offset cells */}
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square md:aspect-auto md:min-h-[80px]" />
            ))}

            {/* Day cells */}
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
                      : dayClasses.length > 0
                      ? "border-white/10 bg-white/3"
                      : "border-transparent"
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
                        title={`${cls.studentName} — ${cls.subject}`}
                        className={`text-[10px] leading-tight px-1.5 py-0.5 rounded-md cursor-pointer truncate font-medium transition-opacity hover:opacity-80 ${
                          cls.type === "CET"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-amber-500/20 text-amber-300"
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
              <p>No hay clases registradas en este mes.</p>
            </div>
          )}
        </div>
      )}

      {/* ── List view ────────────────────────────────────────────────── */}
      {activeView === "list" && (
        <div className="space-y-3">
          {monthClasses.length === 0 ? (
            <div className="glass-panel rounded-3xl p-12 text-center text-gray-500">
              <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No hay clases registradas en este mes.</p>
            </div>
          ) : (
            monthClasses.map((cls) => (
              <div
                key={cls.id}
                className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 group hover:border-white/10 transition-all"
              >
                {/* Left info */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                    cls.type === "CET" ? "bg-emerald-400" : "bg-amber-400"
                  }`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-100">{cls.studentName}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        cls.type === "CET"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-400"
                      }`}>
                        {cls.type}
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                        cls.modality === "presencial"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-purple-500/15 text-purple-400"
                      }`}>
                        {cls.modality === "presencial" ? "Presencial" : "Virtual"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5">{cls.subject}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatDateTimeDisplay(cls.dateTime)}</p>
                    {cls.notes && <p className="text-xs text-gray-600 mt-0.5 italic">{cls.notes}</p>}
                  </div>
                </div>

                {/* Right: amount + actions */}
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
                      <button
                        onClick={() => handleDelete(cls.id)}
                        className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                        title="Confirmar eliminación"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 transition-all"
                        title="Cancelar"
                      >
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

      {/* ── CET rates info bar ───────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl px-5 py-3 flex flex-wrap gap-4 items-center text-sm text-gray-400">
        <Building2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <span>Tarifas CET configuradas:</span>
        <span className="text-gray-200">
          Presencial: <span className="text-emerald-400 font-semibold">{formatARS(settings.cetRatePresencial)}</span>
        </span>
        <span className="text-gray-200">
          Virtual: <span className="text-purple-400 font-semibold">{formatARS(settings.cetRateVirtual)}</span>
        </span>
        {settings.cetRatePresencial === 0 && settings.cetRateVirtual === 0 && (
          <span className="text-amber-400 text-xs">
            ⚠ Configurá las tarifas con el botón ⚙
          </span>
        )}
      </div>
    </div>
  );
}
