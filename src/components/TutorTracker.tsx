"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  GraduationCap, Trash2, Pencil, Printer, Settings,
  ChevronLeft, ChevronRight, X, Check, BookOpen, Clock,
  Monitor, Users, Building2, User, Save, AlertCircle,
  CalendarDays, LayoutGrid, Timer, ChevronDown, Repeat2, Share2
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
type RepeatFrequency = "weekly" | "biweekly";

type TutorClass = {
  id: string;
  studentName: string;
  subject: string;
  modality: ClassModality;
  type: ClassType;
  dateTime: string;   // "YYYY-MM-DDTHH:MM" — start time
  duration: number;   // minutes
  amount: number;     // ARS
  notes?: string;
};

type TutorSettings = {
  cetRatePresencial: number;
  cetRateVirtual: number;
};

const DEFAULT_SETTINGS: TutorSettings = { cetRatePresencial: 0, cetRateVirtual: 0 };

const DURATION_OPTIONS = [
  { label: "1 hora",     value: 60  },
  { label: "1 h 30 min", value: 90  },
  { label: "2 horas",    value: 120 },
  { label: "2 h 30 min", value: 150 },
  { label: "3 horas",    value: 180 },
  { label: "3 h 30 min", value: 210 },
  { label: "4 horas",    value: 240 },
];

const REPEAT_OPTIONS = [1,2,3,4,5,6,7,8,9,10,12,16,20];

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatARS(v: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function formatDateDisplay(dt: string) {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTimeDisplay(dt: string) {
  if (!dt) return "";
  // Parse manually to avoid timezone issues
  const timePart = dt.length >= 16 ? dt.slice(11, 16) : "";
  return timePart;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatDuration(minutes: number) {
  const opt = DURATION_OPTIONS.find(o => o.value === minutes);
  if (opt) return opt.label;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function getMonthName(month: number, year: number) {
  return new Date(year, month, 1).toLocaleString("es-AR", { month: "long", year: "numeric" });
}

function monthKey(dt: string) { return dt.slice(0, 7); }

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

/** Add days to a "YYYY-MM-DD" string */
function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ─── Print styles ───────────────────────────────────────────────────────────

const PRINT_STYLE_ID = "tutor-print-styles";
function ensurePrintStyles() {
  if (typeof document === "undefined" || document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    .tutor-report-content { background: white; padding: 15px 25px; font-family: Arial, sans-serif; color: #111; }
    .tutor-report-content table.data-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
    .tutor-report-content table.data-table th { background: #1e293b; color: white; padding: 10px; text-align: center; line-height: 1.2; }
    .tutor-report-content table.data-table td { padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center; line-height: 1.2; }
    .tutor-report-content table.data-table tr:nth-child(even) td { background: #f8fafc; }
    .tutor-report-content table.data-table .subtotal-row td { font-weight: bold; background: #eff6ff; }
    .tutor-report-content .header-bar { margin-bottom: 20px; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; }
    .tutor-report-content .logo-title { font-size: 24px; font-weight: bold; color: #1e3a5f; }
    .tutor-report-content .student-section { margin-top: 16px; }
    .tutor-report-content .student-title-table { width: 100%; margin-bottom: 8px; border-collapse: collapse; }
    .tutor-report-content .student-title-table td.blue-bar { width: 4px; background-color: #3b82f6; padding: 0; }
    .tutor-report-content .student-title-table td.student-name { padding: 4px 0 4px 8px; font-size: 16px; font-weight: bold; color: #1e3a5f; line-height: 1.2; }
    .tutor-report-content .grand-total { margin-top: 24px; padding: 12px 16px; background: #1e3a5f; color: white; text-align: right; font-size: 16px; font-weight: bold; border-radius: 4px; }
    .tutor-report-content .footer { margin-top: 24px; font-size: 11px; color: #999; text-align: center; }
  `;
  document.head.appendChild(style);
}

// ─── Custom Combobox ────────────────────────────────────────────────────────

function AutocompleteCombobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  icon: Icon,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  icon: React.ElementType;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(value.toLowerCase())
  );

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none z-10" />
      <input
        ref={inputRef}
        id={id}
        required
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => { setOpen(o => !o); inputRef.current?.focus(); }}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl overflow-hidden shadow-2xl shadow-black/60"
          style={{ background: "var(--dropdown-bg)", border: "1px solid var(--dropdown-border)" }}
        >
          {/* New name option if typed something not in list */}
          {value.trim() && !options.some(o => o.toLowerCase() === value.toLowerCase()) && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(value.trim()); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-emerald-400 hover:bg-emerald-500/10 border-b border-white/5 font-medium transition-colors"
            >
              + Agregar &ldquo;{value.trim()}&rdquo;
            </button>
          )}
          {filtered.length > 0 ? (
            <div className="max-h-48 overflow-y-auto">
              {filtered.map(name => (
                <button
                  key={name}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onChange(name); setOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-white/8 ${
                    name === value ? "text-emerald-400 bg-emerald-500/10" : "text-gray-200"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : options.length > 0 && !value ? (
            <div className="max-h-48 overflow-y-auto">
              {options.map(name => (
                <button
                  key={name}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onChange(name); setOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-white/8 ${
                    name === value ? "text-emerald-400 bg-emerald-500/10" : "text-gray-200"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : value && filtered.length === 0 && options.some(o => o.toLowerCase() === value.toLowerCase()) ? null : (
            options.length === 0 && (
              <div className="px-4 py-3 text-xs text-gray-500 text-center">
                Escribí el nombre para agregar el primero
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function TutorTracker() {
  const { user } = useAuth();

  // ── Data state
  const [classes, setClasses] = useState<TutorClass[]>([]);
  const [settings, setSettings] = useState<TutorSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

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

  // ── Report Preview
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [reportHTML, setReportHTML] = useState("");

  // ── Form state
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
  const [formRepeat, setFormRepeat] = useState(1);
  const [formFrequency, setFormFrequency] = useState<RepeatFrequency>("weekly");
  const [formSaving, setFormSaving] = useState(false);

  // ── Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── Derived: unique sorted students & subjects ─────────────────────────

  const uniqueStudents = Array.from(new Set(classes.map(c => c.studentName)))
    .sort((a, b) => a.localeCompare(b, "es"));

  const uniqueSubjects = Array.from(new Set(classes.map(c => c.subject)))
    .sort((a, b) => a.localeCompare(b, "es"));

  const formEndTime = formStartTime ? addMinutesToTime(formStartTime, formDuration) : "";

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

  useEffect(() => { setIsClient(true); ensurePrintStyles(); }, []);

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
        setClasses(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<TutorClass, "id">) })));
      } catch (e) { console.error("TutorTracker load error:", e); }
      finally { setLoading(false); }
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
    } catch (e) { console.error("Settings save error:", e); }
    finally { setSavingSettings(false); }
  };

  // ─── Auto-fill amount for CET ────────────────────────────────────────────

  useEffect(() => {
    if (formType === "CET") {
      const rate = formModality === "presencial" ? settings.cetRatePresencial : settings.cetRateVirtual;
      setFormAmount(String(rate));
    }
  }, [formType, formModality, settings]);

  // ─── Reset form ──────────────────────────────────────────────────────────

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
    setFormRepeat(1);
    setFormFrequency("weekly");
  }

  function openEditForm(cls: TutorClass) {
    setEditingId(cls.id);
    setFormStudentName(cls.studentName);
    setFormSubject(cls.subject);
    setFormModality(cls.modality);
    setFormType(cls.type);
    const [datePart, timePart] = cls.dateTime.split("T");
    setFormDate(datePart ?? todayDate());
    setFormStartTime(timePart?.slice(0, 5) ?? nowTime());
    const duration = cls.duration ?? 60;
    setFormDuration(duration);
    const hourlyRate = cls.amount / (duration / 60);
    setFormAmount(String(hourlyRate));
    setFormNotes(cls.notes ?? "");
    setFormRepeat(1);
    setFormFrequency("weekly");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ─── Submit form ─────────────────────────────────────────────────────────

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const col = classesColPath();
    if (!col || !user) return;
    setFormSaving(true);

    const daysPerRepeat = formFrequency === "weekly" ? 7 : 14;

    const basePayload: Omit<TutorClass, "id" | "dateTime"> = {
      studentName: formStudentName.trim(),
      subject: formSubject.trim(),
      modality: formModality,
      type: formType,
      duration: formDuration,
      amount: (Number(formAmount) || 0) * (formDuration / 60),
      notes: formNotes.trim(),
    };

    try {
      if (editingId) {
        // Edit: always single entry
        const payload = { ...basePayload, dateTime: `${formDate}T${formStartTime}` };
        await updateDoc(doc(db, "users", user.uid, "tutorClasses", editingId), payload);
        setClasses(prev =>
          prev.map(c => c.id === editingId ? { ...payload, id: editingId } : c)
            .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
        );
      } else {
        // Create N entries (repeat)
        const newEntries: TutorClass[] = [];
        for (let i = 0; i < formRepeat; i++) {
          const entryDate = i === 0 ? formDate : addDaysToDate(formDate, daysPerRepeat * i);
          const payload = { ...basePayload, dateTime: `${entryDate}T${formStartTime}` };
          const ref = await addDoc(col, payload);
          newEntries.push({ ...payload, id: ref.id });
        }
        setClasses(prev =>
          [...newEntries, ...prev]
            .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())
        );
      }
      resetForm();
    } catch (e) { console.error("Save error:", e); }
    finally { setFormSaving(false); }
  }

  // ─── Delete ──────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "tutorClasses", id));
      setClasses(prev => prev.filter(c => c.id !== id));
      if (editingId === id) resetForm();
    } catch (e) { console.error("Delete error:", e); }
    finally { setDeletingId(null); }
  }

  // ─── Month navigation ─────────────────────────────────────────────────────

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

  // ─── Filtered classes ─────────────────────────────────────────────────────

  const currentMonthKey = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, "0")}`;
  const monthClasses = classes.filter(c => monthKey(c.dateTime) === currentMonthKey);
  const cetMonthClasses = monthClasses.filter(c => c.type === "CET");
  const totalMonth = monthClasses.reduce((s, c) => s + c.amount, 0);
  const totalCET = cetMonthClasses.reduce((s, c) => s + c.amount, 0);
  const totalPrivate = monthClasses.filter(c => c.type === "privada").reduce((s, c) => s + c.amount, 0);

  // ─── Calendar grid ────────────────────────────────────────────────────────

  const firstDay = new Date(selectedMonth.year, selectedMonth.month, 1).getDay();
  const daysInMonth = new Date(selectedMonth.year, selectedMonth.month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;

  const classesByDay: Record<number, TutorClass[]> = {};
  monthClasses.forEach(c => {
    const day = new Date(c.dateTime).getDate();
    if (!classesByDay[day]) classesByDay[day] = [];
    classesByDay[day].push(c);
  });

  // ─── Print ────────────────────────────────────────────────────────────────

  function handlePrint() {
    if (typeof window === "undefined") return;
    const byStudent: Record<string, TutorClass[]> = {};
    cetMonthClasses.forEach(c => {
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
          .map(c => `
            <tr>
              <td>${formatDateDisplay(c.dateTime)} ${formatTimeDisplay(c.dateTime)}</td>
              <td>${c.subject}</td>
              <td>${c.modality === "presencial" ? "Presencial" : "Virtual"}</td>
              <td>${formatDuration(c.duration ?? 60)}</td>
              <td>${formatARS(c.amount)}</td>
            </tr>`).join("");
        return `
          <div class="student-section">
            <table class="student-title-table">
              <tr>
                <td class="blue-bar"></td>
                <td class="student-name">${studentName}</td>
              </tr>
            </table>
            <table class="data-table">
              <thead><tr><th>Fecha y Hora</th><th>Materia</th><th>Modalidad</th><th>Duración</th><th>Valor</th></tr></thead>
              <tbody>${rows}
                <tr class="subtotal-row">
                  <td colspan="4" style="text-align:right; padding-right: 16px;">Subtotal (${clsList.length} clase${clsList.length !== 1 ? "s" : ""})</td>
                  <td style="text-align:center;">${formatARS(studentTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>`;
      }).join("");

    const tutorName = user?.displayName || user?.email || "Tutor";

    const htmlContent = `
      <div class="tutor-report-content">
        <table class="header-bar" style="width: 100%; border: none; margin-bottom: 20px;">
          <tr>
            <td style="width: 70px; border: none; padding: 0; text-align: left; vertical-align: top;">
              <img src="/logo.jpg" alt="CET Logo" style="width: 54px; height: 54px; object-fit: contain; border-radius: 8px; display: block;" />
            </td>
            <td style="border: none; padding: 8px 0 0 0; text-align: left; vertical-align: top;">
              <div class="logo-title" style="margin: 0; line-height: 1;">Centro de Estudios Turing</div>
              <div style="font-size:14px;color:#555;margin-top:6px;font-weight:500; line-height: 1;">Informe de Clases — ${monthLabelCap}</div>
              <div style="font-size:12px;color:#777;margin-top:4px;font-weight:600; line-height: 1;">Profesor: ${tutorName}</div>
            </td>
            <td style="border: none; padding: 8px 0 0 0; text-align: right; vertical-align: top; font-size: 12px; color: #666;">
              <div style="margin: 0; line-height: 1;">Generado: ${new Date().toLocaleDateString("es-AR")}</div>
              <div style="margin-top:6px; line-height: 1;">${cetMonthClasses.length} clase${cetMonthClasses.length !== 1 ? "s" : ""} registrada${cetMonthClasses.length !== 1 ? "s" : ""}</div>
            </td>
          </tr>
        </table>
        ${studentsHTML}
        <div class="grand-total">TOTAL A COBRAR: ${formatARS(grandTotal)}</div>
        <div class="footer">
          <div>Documento generado automáticamente — Centro de Estudios Turing</div>
        </div>
      </div>
    `;
    return { htmlContent, monthLabelCap };
  }

  function openReportPreview() {
    const res = handlePrint();
    if (!res) return;
    setReportHTML(res.htmlContent);
    setShowReportPreview(true);
  }

  async function handleDownloadOrSharePDF(action: "download" | "share") {
    if (typeof window === "undefined" || !reportHTML) return;
    const { monthLabelCap } = handlePrint() || { monthLabelCap: "" };
    
    setIsSharing(true);
    try {
      // @ts-ignore
      const html2pdf = (await import("html2pdf.js")).default;
      const filename = `Informe_CET_${monthLabelCap.replace(/ /g, "_")}.pdf`;
      
      const opt = {
        margin: 10,
        filename: filename,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const }
      };
      
      const pdfHTML = `
        <style>
          .tutor-report-content th,
          .tutor-report-content td,
          .tutor-report-content .logo-title,
          .tutor-report-content .student-name,
          .tutor-report-content .grand-total,
          .tutor-report-content .header-bar td div {
            position: relative;
            top: -4px;
          }
        </style>
        ${reportHTML}
      `;
      
      if (action === "download") {
        await html2pdf().set(opt).from(pdfHTML).save();
      } else {
        const pdfBlob = await html2pdf().set(opt).from(pdfHTML).output('blob');
        const file = new File([pdfBlob], filename, { type: "application/pdf" });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "Informe CET",
            text: `Adjunto mi informe de clases del mes de ${monthLabelCap}.`,
          });
        } else {
          // Fallback to download if sharing is not supported
          await html2pdf().set(opt).from(pdfHTML).save();
        }
      }
    } catch (e) {
      console.error("Error generating PDF:", e);
      alert("Hubo un error al generar o compartir el PDF.");
    } finally {
      setIsSharing(false);
    }
  }



  // ─── Render ───────────────────────────────────────────────────────────────

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
    <div className="space-y-5">

      {/* ═══════════════════════════════════════════════════════
          1. FORM — always visible at top
      ═══════════════════════════════════════════════════════ */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl">
              <GraduationCap className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="font-bold text-gray-100 text-lg">
              {editingId ? "Editando Clase" : "Nueva Clase"}
            </h3>
          </div>
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

        <form onSubmit={handleFormSubmit} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

          {/* Student — custom combobox */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">Alumno *</label>
            <AutocompleteCombobox
              id="form-student-name"
              value={formStudentName}
              onChange={setFormStudentName}
              options={uniqueStudents}
              placeholder="Nombre del alumno"
              icon={User}
            />
          </div>

          {/* Subject — custom combobox */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">Materia *</label>
            <AutocompleteCombobox
              id="form-subject"
              value={formSubject}
              onChange={setFormSubject}
              options={uniqueSubjects}
              placeholder="Ej: Matemáticas, Física..."
              icon={BookOpen}
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">Fecha *</label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                id="form-date"
                required
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Start time */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">Hora de inicio *</label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                id="form-start-time"
                required
                type="time"
                value={formStartTime}
                onChange={e => setFormStartTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
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
              onChange={e => setFormDuration(Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all [color-scheme:dark]"
            >
              {DURATION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Modality */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">Modalidad *</label>
            <div className="flex gap-2 h-[42px]">
              <button type="button" id="form-modality-presencial" onClick={() => setFormModality("presencial")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-medium border transition-all ${formModality === "presencial" ? "bg-blue-500/20 border-blue-500/50 text-blue-300" : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"}`}>
                <Users className="w-4 h-4" /> Presencial
              </button>
              <button type="button" id="form-modality-virtual" onClick={() => setFormModality("virtual")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-medium border transition-all ${formModality === "virtual" ? "bg-purple-500/20 border-purple-500/50 text-purple-300" : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"}`}>
                <Monitor className="w-4 h-4" /> Virtual
              </button>
            </div>
          </div>

          {/* Type CET / Privada */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">Tipo *</label>
            <div className="flex gap-2 h-[42px]">
              <button type="button" id="form-type-cet" onClick={() => setFormType("CET")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-medium border transition-all ${formType === "CET" ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300" : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"}`}>
                <Building2 className="w-4 h-4" /> CET
              </button>
              <button type="button" id="form-type-privada" onClick={() => setFormType("privada")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-medium border transition-all ${formType === "privada" ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"}`}>
                <User className="w-4 h-4" /> Privada
              </button>
            </div>
          </div>

          {/* Hourly Rate */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">
              Valor por hora (ARS)
              {formType === "CET" && <span className="ml-2 text-emerald-500/70 normal-case text-[10px]">fijo según tarifas</span>}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                id="form-amount"
                type="number"
                min="0"
                value={formAmount}
                onChange={e => setFormAmount(e.target.value)}
                disabled={formType === "CET"}
                placeholder="0"
                className={`w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all ${formType === "CET" ? "opacity-60 cursor-not-allowed" : ""}`}
              />
            </div>
            {Number(formAmount) > 0 && formDuration !== 60 && (
              <div className="text-emerald-400/80 text-xs mt-1.5 font-medium flex justify-end">
                Total: $ {((Number(formAmount) || 0) * (formDuration / 60)).toLocaleString("es-AR")}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide">Notas (opcional)</label>
            <input
              id="form-notes"
              type="text"
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              placeholder="Temas, observaciones..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>

          {/* Repeat + Submit — same row */}
          <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-end justify-between gap-4">

            {/* Repeat selector */}
            <div className={editingId ? "opacity-40 pointer-events-none" : ""}>
              <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
                <Repeat2 className="w-3.5 h-3.5" /> Repetir
                {editingId && <span className="normal-case text-[10px] text-gray-600">— no disponible al editar</span>}
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  id="form-repeat"
                  value={formRepeat}
                  onChange={e => setFormRepeat(Number(e.target.value))}
                  disabled={!!editingId}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 transition-all [color-scheme:dark]"
                >
                  <option value={1}>1 vez (sin repetir)</option>
                  {REPEAT_OPTIONS.filter(n => n > 1).map(n => (
                    <option key={n} value={n}>{n} veces</option>
                  ))}
                </select>

                {formRepeat > 1 && !editingId && (
                  <>
                    <span className="text-gray-500 text-sm">con frecuencia</span>
                    <select
                      id="form-frequency"
                      value={formFrequency}
                      onChange={e => setFormFrequency(e.target.value as RepeatFrequency)}
                      className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 transition-all [color-scheme:dark]"
                    >
                      <option value="weekly">Semanal (cada 7 días)</option>
                      <option value="biweekly">Quincenal (cada 14 días)</option>
                    </select>
                    <span className="text-emerald-400 text-xs font-medium">
                      → se crearán {formRepeat} clases
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Action buttons — aligned to bottom-right */}
            <div className="flex items-center gap-3 self-end">
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("¿Seguro que querés eliminar esta clase?")) {
                      handleDelete(editingId);
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-400 rounded-xl font-semibold text-sm hover:bg-red-500/20 hover:text-red-300 transition-all border border-red-500/20"
                >
                  <Trash2 className="w-4 h-4" />
                  Eliminar
                </button>
              )}
              <button
                id="btn-save-class"
                type="submit"
                disabled={formSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold text-sm hover:from-emerald-400 hover:to-teal-400 transition-all disabled:opacity-60 shadow-lg shadow-emerald-900/30"
              >
                {formSaving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Check className="w-4 h-4" />}
                {editingId
                  ? "Actualizar Clase"
                  : formRepeat > 1 ? `Guardar ${formRepeat} Clases` : "Guardar Clase"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ═══════════════════════════════════════════════════════
          2. CET RATES BAR — with embedded ⚙ settings
      ═══════════════════════════════════════════════════════ */}
      <div className="glass-panel rounded-2xl px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4 text-sm w-full md:w-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-gray-400 font-medium text-base md:text-sm">Tarifas CET:</span>
            </div>
            {/* Botón de configuración móvil */}
            <button
              onClick={() => {
                setSettingsPresencial(String(settings.cetRatePresencial));
                setSettingsVirtual(String(settings.cetRateVirtual));
                setShowSettings(true);
              }}
              className="md:hidden flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium text-gray-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
              style={{ borderColor: "var(--border)" }}
            >
              <Settings className="w-3.5 h-3.5" /> Configurar
            </button>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-gray-400 text-xs">Presencial:</span>
              <span className="text-emerald-400 font-semibold">{formatARS(settings.cetRatePresencial)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-gray-400 text-xs">Virtual:</span>
              <span className="text-purple-400 font-semibold">{formatARS(settings.cetRateVirtual)}</span>
            </div>
          </div>
          {settings.cetRatePresencial === 0 && settings.cetRateVirtual === 0 && (
            <span className="text-amber-400 text-xs">⚠ Configurá las tarifas</span>
          )}
        </div>
        
        {/* Botón de configuración escritorio */}
        <button
          onClick={() => {
            setSettingsPresencial(String(settings.cetRatePresencial));
            setSettingsVirtual(String(settings.cetRateVirtual));
            setShowSettings(true);
          }}
          className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium text-gray-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
          style={{ borderColor: "var(--border)" }}
          title="Configurar tarifas CET"
        >
          <Settings className="w-4 h-4" /> Configurar
        </button>
      </div>

      {/* ── Settings modal ──────────────────────────────────── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel rounded-2xl p-8 w-full max-w-md space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-xl">
                  <Building2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-100">Tarifas CET</h3>
                  <p className="text-xs text-gray-500">Centro de Estudios Turing — valor por hora</p>
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
                  <input id="settings-cet-presencial" type="number" min="0" value={settingsPresencial}
                    onChange={e => setSettingsPresencial(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-4 py-3 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-purple-400" /> Valor hora Virtual (ARS)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input id="settings-cet-virtual" type="number" min="0" value={settingsVirtual}
                    onChange={e => setSettingsVirtual(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-4 py-3 text-gray-100 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all" placeholder="0" />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSettings(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border text-gray-400 hover:text-white hover:border-white/20 transition-all text-sm"
                style={{ borderColor: "var(--border)" }}>
                Cancelar
              </button>
              <button id="btn-save-settings" onClick={handleSaveSettings} disabled={savingSettings}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold text-sm hover:from-emerald-400 hover:to-teal-400 transition-all disabled:opacity-60">
                {savingSettings ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          3. ACTION BAR
      ═══════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          id="btn-print-report"
          onClick={openReportPreview}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-sm hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-900/30 hover:scale-105 active:scale-95"
        >
          <Printer className="w-4 h-4" /> Informe CET
        </button>

        <div className="flex items-center gap-1 glass-panel rounded-xl p-1">
          <button
            id="btn-view-calendar"
            onClick={() => setActiveView("calendar")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeView === "calendar" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:text-gray-200"}`}
          >
            <CalendarDays className="w-4 h-4" /> Calendario
          </button>
          <button
            id="btn-view-list"
            onClick={() => setActiveView("list")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeView === "list" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-400 hover:text-gray-200"}`}
          >
            <LayoutGrid className="w-4 h-4" /> Lista
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          4. MONTH NAVIGATOR + STATS
      ═══════════════════════════════════════════════════════ */}
      <div className="glass-panel rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-4">
        <div className="flex items-center justify-center md:justify-start gap-4 w-full md:w-auto">
          <button id="btn-prev-month" onClick={prevMonth} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
            <ChevronLeft className="w-5 h-5 md:w-4 md:h-4" />
          </button>
          <span className="text-gray-100 font-bold capitalize text-lg md:text-lg min-w-[160px] text-center tracking-wide">
            {getMonthName(selectedMonth.month, selectedMonth.year)}
          </span>
          <button id="btn-next-month" onClick={nextMonth} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
            <ChevronRight className="w-5 h-5 md:w-4 md:h-4" />
          </button>
        </div>
        
        <div className="w-full md:w-auto grid grid-cols-2 md:flex items-center text-sm md:gap-4 md:divide-x md:divide-white/10">
          <div className="text-center py-2 md:py-0 px-2 border-b border-r border-white/10 md:border-none">
            <p className="text-gray-500 text-[10px] md:text-xs uppercase tracking-wide truncate">Clases</p>
            <p className="text-gray-100 font-bold text-base md:text-lg">{monthClasses.length}</p>
          </div>
          <div className="text-center py-2 md:py-0 px-2 border-b border-white/10 md:border-none md:border-l">
            <p className="text-gray-500 text-[10px] md:text-xs uppercase tracking-wide truncate">Total</p>
            <p className="text-gray-100 font-bold text-base md:text-lg truncate">{formatARS(totalMonth)}</p>
          </div>
          <div className="text-center py-2 md:py-0 px-2 border-r border-white/10 md:border-none">
            <p className="text-gray-500 text-[10px] md:text-xs uppercase tracking-wide truncate">CET</p>
            <p className="text-emerald-400 font-bold text-base md:text-lg truncate">{formatARS(totalCET)}</p>
          </div>
          <div className="text-center py-2 md:py-0 px-2 md:border-none md:border-l md:border-white/10">
            <p className="text-gray-500 text-[10px] md:text-xs uppercase tracking-wide truncate">Privadas</p>
            <p className="text-amber-400 font-bold text-base md:text-lg truncate">{formatARS(totalPrivate)}</p>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          5. CALENDAR / LIST VIEW
      ═══════════════════════════════════════════════════════ */}
      {activeView === "calendar" && (
        <div className="glass-panel rounded-2xl p-4 md:p-6">
          <div className="grid grid-cols-7 mb-2">
            {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
              <div key={d} className="text-center text-xs text-gray-500 font-semibold py-2 uppercase tracking-wide">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, i) => <div key={`e${i}`} className="min-h-[60px] md:min-h-[80px]" />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayClasses = classesByDay[day] ?? [];
              const isToday = new Date().getDate() === day && new Date().getMonth() === selectedMonth.month && new Date().getFullYear() === selectedMonth.year;
              return (
                <div key={day} className={`rounded-xl p-1.5 md:p-2 min-h-[60px] md:min-h-[80px] border transition-colors ${isToday ? "border-emerald-500/40 bg-emerald-500/5" : dayClasses.length > 0 ? "border-white/10 bg-white/3" : "border-transparent"}`}>
                  <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-emerald-500 text-white" : "text-gray-400"}`}>{day}</div>
                  <div className="space-y-1">
                    {dayClasses.slice(0, 3).map(cls => (
                      <div key={cls.id} onClick={() => openEditForm(cls)}
                        title={`${cls.studentName} — ${cls.subject} (${formatDuration(cls.duration ?? 60)})`}
                        className={`text-[12px] md:text-xs text-center md:text-left leading-tight px-1.5 py-1 rounded-md cursor-pointer line-clamp-2 font-medium transition-opacity hover:opacity-80 ${cls.type === "CET" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                        <span className="md:hidden font-bold">{cls.studentName.charAt(0).toUpperCase()}</span>
                        <span className="hidden md:inline">{cls.studentName}</span>
                      </div>
                    ))}
                    {dayClasses.length > 3 && <div className="text-[10px] md:text-xs text-gray-500 px-1 font-medium">+{dayClasses.length - 3} más</div>}
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

      {activeView === "list" && (
        <div className="space-y-6">
          {monthClasses.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center text-gray-500">
              <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No hay clases en este mes.</p>
            </div>
          ) : (
            (() => {
              const nowMs = new Date().getTime();
              const upcomingClasses = monthClasses.filter(c => new Date(c.dateTime).getTime() >= nowMs).sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
              const pastClasses = monthClasses.filter(c => new Date(c.dateTime).getTime() < nowMs).sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

              const renderClassCard = (cls: TutorClass) => (
                <div key={cls.id}
                  className={`glass-panel rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group transition-all ${editingId === cls.id ? "border-emerald-500/40 ring-1 ring-emerald-500/20" : "hover:border-white/15"}`}>
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${cls.type === "CET" ? "bg-emerald-400" : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]"}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-100">{cls.studentName}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${cls.type === "CET" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>{cls.type}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${cls.modality === "presencial" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"}`}>
                          {cls.modality === "presencial" ? "Presencial" : "Virtual"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 mt-1 font-medium">{cls.subject}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {formatDateDisplay(cls.dateTime)}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatTimeDisplay(cls.dateTime)} → {addMinutesToTime(cls.dateTime.slice(11, 16), cls.duration ?? 60)}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Timer className="w-3.5 h-3.5" /> {formatDuration(cls.duration ?? 60)}</span>
                      </div>
                      {cls.notes && <p className="text-xs text-gray-500 mt-2 italic bg-white/5 p-2 rounded-lg border border-white/5">{cls.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 pt-3 sm:pt-0 border-t border-white/5 sm:border-t-0 mt-2 sm:mt-0">
                    <span className="text-gray-100 font-bold text-lg bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">{formatARS(cls.amount)}</span>
                    <button onClick={() => openEditForm(cls)}
                      className="p-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-blue-500/20 hover:border-blue-500/40 transition-all flex items-center gap-2" title="Editar clase">
                      <Pencil className="w-4 h-4" /> <span className="text-sm font-medium sm:hidden">Editar</span>
                    </button>
                  </div>
                </div>
              );

              return (
                <>
                  {upcomingClasses.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest pl-2 mb-4 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-emerald-400" /> Próximas Clases
                      </h3>
                      {upcomingClasses.map(renderClassCard)}
                    </div>
                  )}
                  {pastClasses.length > 0 && (
                    <div className="space-y-3 pt-6 mt-6 border-t border-white/5">
                      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest pl-2 mb-4 flex items-center gap-2">
                        <Check className="w-4 h-4" /> Clases Pasadas
                      </h3>
                      <div className="opacity-75 hover:opacity-100 transition-opacity">
                        {pastClasses.map(renderClassCard)}
                      </div>
                    </div>
                  )}
                </>
              );
            })()
          )}
        </div>
      )}

      {/* ── Report Preview Modal ──────────────────────────────────── */}
      {showReportPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel rounded-2xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/40">
              <h3 className="font-bold text-gray-100 flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-400" /> Vista Previa del Informe
              </h3>
              <button onClick={() => setShowReportPreview(false)} className="text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-1.5 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white print-preview-container" style={{ color: "black" }}>
              <div dangerouslySetInnerHTML={{ __html: reportHTML }} />
            </div>
            
            <div className="p-4 border-t border-white/10 bg-black/40 flex flex-wrap gap-3 justify-end">
              <button
                onClick={() => handleDownloadOrSharePDF("download")}
                disabled={isSharing}
                className="flex-1 md:flex-none items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/20 text-gray-200 hover:bg-white/10 transition-all font-medium disabled:opacity-50 flex"
              >
                {isSharing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Printer className="w-4 h-4" />} Descargar PDF
              </button>
              <button
                onClick={() => handleDownloadOrSharePDF("share")}
                disabled={isSharing}
                className="flex-1 md:flex-none items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold hover:from-emerald-400 hover:to-teal-400 transition-all disabled:opacity-50 shadow-lg shadow-emerald-900/30 flex"
              >
                {isSharing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Share2 className="w-4 h-4" />} Compartir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
