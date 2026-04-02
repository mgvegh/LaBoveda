"use client";
import { useState } from "react";
import { X, Send, AlertTriangle, Lightbulb, MessageSquare, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import clsx from "clsx";

type RequestType = "bug" | "solicitud" | "otros";

export default function ContactModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [type, setType] = useState<RequestType>("bug");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
        setError("Debes iniciar sesión para enviar una solicitud.");
        return;
    }
    
    setIsSending(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from("user_requests").insert([
        {
          user_id: user.id,
          email: user.email,
          type,
          message,
        },
      ]);

      if (insertError) throw insertError;
      
      setSuccess(true);
      setMessage("");
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 3000);

    } catch (err: any) {
      console.error(err);
      setError("No se pudo enviar tu solicitud. ¿Ya creaste la tabla 'user_requests' en Supabase?");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-lg glass-panel p-8 rounded-3xl border-orange-500/20 shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden">
        {/* Background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-orange-500/10 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="flex items-center justify-between mb-6 relative z-10">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <MessageSquare className="w-6 h-6 text-orange-400" /> Centro de Solicitudes
          </h2>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {success ? (
          <div className="py-12 text-center animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
               <Send className="w-10 h-10 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">¡Solicitud Enviada!</h3>
            <p className="text-gray-400">Tu mensaje ha sido entregado a la administración. Gracias por ayudarnos a mejorar.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 ml-1">¿Qué deseas reportar?</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setType("bug")}
                  className={clsx(
                    "flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all",
                    type === "bug" 
                      ? "bg-red-500/10 border-red-500/40 text-red-400 shadow-lg shadow-red-500/5 rotate-1" 
                      : "bg-white/5 border-white/5 text-gray-400 hover:border-white/10"
                  )}
                >
                  <AlertTriangle className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase">Bug</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType("solicitud")}
                  className={clsx(
                    "flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all",
                    type === "solicitud" 
                      ? "bg-blue-500/10 border-blue-500/40 text-blue-400 shadow-lg shadow-blue-500/5 -rotate-1" 
                      : "bg-white/5 border-white/5 text-gray-400 hover:border-white/10"
                  )}
                >
                  <Lightbulb className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase">Mejora</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType("otros")}
                  className={clsx(
                    "flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all",
                    type === "otros" 
                      ? "bg-orange-500/10 border-orange-500/40 text-orange-400 shadow-lg shadow-orange-500/5" 
                      : "bg-white/5 border-white/5 text-gray-400 hover:border-white/10"
                  )}
                >
                  <MessageSquare className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase">Otros</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 ml-1">Tu Mensaje</label>
              <textarea
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Escribe aquí los detalles del error o la función que te gustaría añadir..."
                className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-orange-500/50 transition-all resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="w-full flex items-center justify-center gap-3 bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed group active:scale-[0.98]"
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Enviar Solicitud
                  <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
