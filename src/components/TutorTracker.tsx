"use client";
import html2canvas from "html2canvas";

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
      <div id="report-capture-area" class="tutor-report-content">
        <table class="header-bar" style="width: 100%; border: none; margin-bottom: 20px;">
          <tr>
            <td style="width: 70px; border: none; padding: 0; text-align: left; vertical-align: top;">
              <img src="data:image/jpeg;base64,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" alt="CET Logo" style="width: 54px; height: 54px; object-fit: contain; border-radius: 8px; display: block;" />
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

  async function handleDownloadOrShareImage(action: "download" | "share") {
    const node = document.getElementById("report-capture-area");
    if (!node) return;
    const { monthLabelCap } = handlePrint() || { monthLabelCap: "" };
    
    setIsSharing(true);
    try {
      const filename = `Informe_CET_${monthLabelCap.replace(/ /g, "_")}.png`;
      
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            .tutor-report-content th,
            .tutor-report-content td,
            .tutor-report-content .logo-title,
            .tutor-report-content .student-name,
            .tutor-report-content .grand-total,
            .tutor-report-content .header-bar td div {
              position: relative !important;
              top: 3px !important;
            }
          `;
          clonedDoc.head.appendChild(style);
        }
      });
      
      const dataUrl = canvas.toDataURL("image/png");
      
      if (action === "download") {
        const link = document.createElement("a");
        link.download = filename;
        link.href = dataUrl;
        link.click();
      } else {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("No se pudo generar la imagen.");
        
        const file = new File([blob], filename, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: "Informe CET",
              text: `Adjunto mi informe de clases del mes de ${monthLabelCap}.`,
            });
          } catch (shareError: any) {
            if (shareError.name !== 'AbortError') {
              console.error("Share failed:", shareError);
              const link = document.createElement("a");
              link.download = filename;
              link.href = dataUrl;
              link.click();
            }
          }
        } else {
          // Fallback download
          const link = document.createElement("a");
          link.download = filename;
          link.href = dataUrl;
          link.click();
        }
      }
    } catch (e: any) {
      console.error("Error generating Image:", e);
      let errMsg = e?.message || e?.toString() || "Error desconocido";
      alert("Hubo un error al generar la imagen. Detalles: " + errMsg);
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
                onClick={() => handleDownloadOrShareImage("download")}
                disabled={isSharing}
                className="flex-1 md:flex-none items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/20 text-gray-200 hover:bg-white/10 transition-all font-medium disabled:opacity-50 flex"
              >
                {isSharing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Printer className="w-4 h-4" />} Descargar Imagen
              </button>
              <button
                onClick={() => handleDownloadOrShareImage("share")}
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
