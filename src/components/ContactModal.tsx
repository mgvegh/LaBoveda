"use client";
import { useState } from "react";
import { X, Send, AlertTriangle, Lightbulb, MessageSquare, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import clsx from "clsx";

type RequestType = "bug" | "solicitud" | "otros";

export default function ContactModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [type, setType] = useState<RequestType>("bug");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("Iniciá sesión para enviar una solicitud.");
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      await addDoc(collection(db, "user_requests"), {
        user_id: user.uid,
        email: user.email,
        type,
        message,
        created_at: new Date().toISOString(),
      });
      setSuccess(true);
      setMessage("");
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2500);
    } catch (err) {
      console.error(err);
      setError("No se pudo enviar la solicitud. Intentá nuevamente.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#19191b] border border-[rgba(237,237,237,0.12)] p-6 rounded-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-[#ededed] flex items-center gap-2.5">
            <MessageSquare className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
            Centro de solicitudes
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg text-[#85858b] hover:text-[#ededed] hover:bg-[#232325] transition-colors duration-150 cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {success ? (
          <div className="py-10 text-center space-y-3">
            <div className="w-12 h-12 bg-[#4cc38a]/15 rounded-xl flex items-center justify-center mx-auto border border-[#4cc38a]/25">
              <Send className="w-5 h-5 text-[#4cc38a]" strokeWidth={1.5} />
            </div>
            <h3 className="text-base font-medium text-[#ededed]">Solicitud enviada</h3>
            <p className="text-sm text-[#a1a1a6]">
              Tu mensaje quedó registrado para revisión.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-[#e5484d]/10 border border-[#e5484d]/25 rounded-lg text-[#e5484d] text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#a1a1a6]">
                Tipo de mensaje
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["bug", "solicitud", "otros"] as RequestType[]).map((t) => {
                  const active = type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={clsx(
                        "flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs font-medium transition-colors duration-150 cursor-pointer",
                        active
                          ? "bg-[#232325] border-[#d99b43]/50 text-[#ededed]"
                          : "bg-[#141415] border-[rgba(237,237,237,0.08)] text-[#85858b] hover:text-[#ededed]"
                      )}
                    >
                      {t === "bug" ? (
                        <AlertTriangle className={clsx("w-4 h-4", active ? "text-[#e5484d]" : "text-[#85858b]")} strokeWidth={1.5} />
                      ) : t === "solicitud" ? (
                        <Lightbulb className={clsx("w-4 h-4", active ? "text-[#d99b43]" : "text-[#85858b]")} strokeWidth={1.5} />
                      ) : (
                        <MessageSquare className={clsx("w-4 h-4", active ? "text-[#ededed]" : "text-[#85858b]")} strokeWidth={1.5} />
                      )}
                      <span>{t === "bug" ? "Error" : t === "solicitud" ? "Mejora" : "Otros"}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#a1a1a6]">
                Detalle
              </label>
              <textarea
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Describí el error o la mejora que necesitás"
                className="w-full bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg p-3 text-sm text-[#ededed] placeholder:text-[#85858b] focus:outline-none focus:border-[#d99b43] transition-colors duration-150 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="w-full h-10 flex items-center justify-center gap-2 bg-[#d99b43] hover:bg-[#e3a852] text-[#141415] text-sm font-medium rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Enviar solicitud</span>
                  <Send className="w-4 h-4" strokeWidth={1.5} />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
