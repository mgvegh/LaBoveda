"use client";

import { useState, useEffect, useRef } from "react";
import { StickyNote, X, Plus, Trash2, Calendar, Search, Pin, Save, Clock, Check } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export type QuickNote = {
  id: string;
  title?: string;
  content: string;
  date: string; // "YYYY-MM-DD"
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
};

const uid = () => Math.random().toString(36).slice(2, 10);

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDateReadable = (dateStr: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  }
  return dateStr;
};

interface FloatingNotesProps {
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
}

export default function FloatingNotes({
  isOpen: controlledOpen,
  onToggle: controlledToggle,
}: FloatingNotesProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setOpen = (val: boolean) => {
    if (isControlled && controlledToggle) {
      controlledToggle(val);
    } else {
      setInternalOpen(val);
    }
  };

  const { user } = useAuth();
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const panelRef = useRef<HTMLDivElement>(null);

  const getDocRef = () => (user ? doc(db, "users", user.uid, "notes_config", "quick_notes") : null);

  // Load notes
  useEffect(() => {
    if (!user) return;
    const storageKey = `boveda_notes_${user.uid}`;
    let localData: QuickNote[] = [];
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        localData = JSON.parse(stored);
        if (Array.isArray(localData)) {
          setNotes(localData);
          if (localData.length > 0) setSelectedNoteId(localData[0].id);
        }
      }
    } catch {}

    const docRef = getDocRef();
    if (!docRef) return;

    getDoc(docRef)
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.notes)) {
            setNotes(data.notes);
            if (data.notes.length > 0 && !selectedNoteId) {
              setSelectedNoteId(data.notes[0].id);
            }
            try {
              localStorage.setItem(storageKey, JSON.stringify(data.notes));
            } catch {}
          }
        }
        setIsDataLoaded(true);
      })
      .catch((err) => {
        console.error("Error loading notes from Firestore:", err);
        setIsDataLoaded(true);
      });
  }, [user]); // eslint-disable-line

  // Autosave notes
  useEffect(() => {
    if (!user || !isDataLoaded) return;
    const storageKey = `boveda_notes_${user.uid}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(notes));
    } catch {}

    const docRef = getDocRef();
    if (!docRef) return;

    setSaveStatus("saving");
    const timeout = setTimeout(() => {
      setDoc(docRef, { notes, updatedAt: new Date().toISOString() }, { merge: true })
        .then(() => {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        })
        .catch((e) => {
          console.error("Error saving notes to Firestore:", e);
          setSaveStatus("idle");
        });
    }, 800);

    return () => clearTimeout(timeout);
  }, [notes, user, isDataLoaded]); // eslint-disable-line

  const handleAddNote = () => {
    const newNote: QuickNote = {
      id: uid(),
      title: "",
      content: "",
      date: todayStr(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
    };
    setNotes((prev) => [newNote, ...prev]);
    setSelectedNoteId(newNote.id);
  };

  const handleUpdateNote = (id: string, updates: Partial<QuickNote>) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n
      )
    );
  };

  const handleDeleteNote = (id: string) => {
    setNotes((prev) => {
      const filtered = prev.filter((n) => n.id !== id);
      if (selectedNoteId === id) {
        setSelectedNoteId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  const handleTogglePin = (id: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n))
    );
  };

  const filteredNotes = notes
    .filter((n) => {
      const q = searchQuery.toLowerCase();
      return (
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.content && n.content.toLowerCase().includes(q)) ||
        (n.date && n.date.includes(q))
      );
    })
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.date || b.updatedAt).localeCompare(a.date || a.updatedAt);
    });

  const activeNote = notes.find((n) => n.id === selectedNoteId);

  return (
    <>
      {/* Floating Toggle Button (Sits nicely next to Calculator) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-24 sm:right-40 z-40 flex items-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white px-4 py-3 rounded-2xl shadow-xl shadow-amber-600/30 border border-amber-400/30 hover:scale-105 active:scale-95 transition-all group cursor-pointer"
          title="Abrir Notas Rápidas"
        >
          <StickyNote className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          <span className="text-xs font-bold hidden sm:inline">Notas</span>
          {notes.length > 0 && (
            <span className="bg-black/40 text-amber-200 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full">
              {notes.length}
            </span>
          )}
        </button>
      )}

      {/* Floating Notes Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed bottom-6 right-6 z-50 w-[95vw] sm:w-[440px] md:w-[500px] h-[520px] bg-zinc-950/95 backdrop-blur-xl border border-amber-500/30 rounded-3xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-200"
          style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.7), 0 0 30px rgba(245, 158, 11, 0.15)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5 shrink-0">
            <div className="flex items-center gap-2 text-amber-400">
              <StickyNote className="w-4 h-4" />
              <span className="text-xs font-bold tracking-wide uppercase text-white">Notas & Apuntes</span>
              {saveStatus === "saving" && <span className="text-[10px] text-gray-400">Guardando...</span>}
              {saveStatus === "saved" && <span className="text-[10px] text-emerald-400 flex items-center gap-0.5"><Check className="w-3 h-3"/> Guardado</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAddNote}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold border border-amber-500/30 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva</span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="Cerrar notas"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Body Container (Split view or Note Editor) */}
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar List (Visible on larger floating panel or when no active note selected) */}
            <div className="w-1/3 sm:w-2/5 border-r border-white/10 flex flex-col bg-black/40">
              {/* Search */}
              <div className="p-2 border-b border-white/5">
                <div className="relative">
                  <Search className="w-3 h-3 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              {/* Notes list */}
              <div className="flex-1 overflow-y-auto divide-y divide-white/5 scrollbar-thin">
                {filteredNotes.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-500">
                    No hay notas todavía.
                  </div>
                ) : (
                  filteredNotes.map((n) => {
                    const isSelected = n.id === selectedNoteId;
                    return (
                      <div
                        key={n.id}
                        onClick={() => setSelectedNoteId(n.id)}
                        className={clsx(
                          "p-2.5 text-left cursor-pointer transition-colors relative group",
                          isSelected ? "bg-amber-500/15 border-l-2 border-amber-400" : "hover:bg-white/5"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-xs font-semibold text-gray-200 truncate flex-1">
                            {n.title || "Nota sin título"}
                          </span>
                          {n.pinned && <Pin className="w-2.5 h-2.5 text-amber-400 fill-amber-400 shrink-0" />}
                        </div>
                        <p className="text-[10px] text-gray-400 truncate mb-1">
                          {n.content || "Sin contenido..."}
                        </p>
                        <div className="flex items-center justify-between text-[9px] text-gray-500">
                          <span>{formatDateReadable(n.date)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Note Editor Area */}
            <div className="flex-1 flex flex-col bg-zinc-950/80 p-3 overflow-hidden">
              {activeNote ? (
                <div className="flex-1 flex flex-col h-full space-y-2">
                  {/* Note Controls (Date, Pin, Delete) */}
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <input
                        type="date"
                        value={activeNote.date || todayStr()}
                        onChange={(e) => handleUpdateNote(activeNote.id, { date: e.target.value })}
                        className="bg-transparent text-xs text-amber-200 border-b border-white/10 focus:border-amber-400 focus:outline-none [color-scheme:dark] py-0.5"
                        title="Fecha de la nota"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateNote(activeNote.id, { date: todayStr() })}
                        className="text-[10px] text-gray-400 hover:text-amber-300 bg-white/5 px-1.5 py-0.5 rounded transition-colors"
                        title="Poner fecha de hoy"
                      >
                        Hoy
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleTogglePin(activeNote.id)}
                        className={clsx(
                          "p-1.5 rounded-lg transition-colors cursor-pointer",
                          activeNote.pinned
                            ? "text-amber-400 bg-amber-500/20"
                            : "text-gray-400 hover:text-white hover:bg-white/10"
                        )}
                        title={activeNote.pinned ? "Desanclar nota" : "Anclar nota"}
                      >
                        <Pin className={clsx("w-3.5 h-3.5", activeNote.pinned && "fill-amber-400")} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(activeNote.id)}
                        className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Eliminar nota"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title Input */}
                  <input
                    type="text"
                    value={activeNote.title || ""}
                    onChange={(e) => handleUpdateNote(activeNote.id, { title: e.target.value })}
                    placeholder="Título de la nota..."
                    className="w-full bg-transparent text-sm font-bold text-white placeholder-gray-500 focus:outline-none border-b border-white/5 pb-1"
                  />

                  {/* Content Area */}
                  <textarea
                    value={activeNote.content || ""}
                    onChange={(e) => handleUpdateNote(activeNote.id, { content: e.target.value })}
                    placeholder="Escribí tus apuntes, cuentas, recordatorios o pendientes..."
                    className="flex-1 w-full bg-transparent text-xs text-gray-200 placeholder-gray-600 focus:outline-none resize-none leading-relaxed scrollbar-thin"
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-500 space-y-3">
                  <StickyNote className="w-8 h-8 opacity-40 text-amber-400" />
                  <p className="text-xs">No hay ninguna nota seleccionada</p>
                  <button
                    type="button"
                    onClick={handleAddNote}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30 hover:bg-amber-500/30 transition-all cursor-pointer"
                  >
                    Crear primera nota
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
