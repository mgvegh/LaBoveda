"use client";
import { ShieldCheck, Lock, Database, KeyRound, FileCheck, X, CheckCircle2 } from "lucide-react";

interface PrivacySecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrivacySecurityModal({ isOpen, onClose }: PrivacySecurityModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-8 shadow-2xl border flex flex-col text-left scrollbar-hide"
        style={{
          background: "var(--dropdown-bg, #0c0d12)",
          borderColor: "var(--border, rgba(255,255,255,0.1))",
          color: "var(--fg, #f3f4f6)"
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Seguridad y Privacidad
              </h2>
              <p className="text-xs sm:text-sm text-gray-400">
                Tu información financiera, protegida y 100% bajo tu control.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-6 space-y-6 text-sm text-gray-300">
          
          {/* Card 1: Firebase Auth & Firestore Isolation */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
              <Database className="w-4 h-4" />
              <span>Aislamiento de Datos por Usuario (Firebase Firestore)</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
              Tus registros de ingresos, deudas, inversiones en CEDEARs, carteras cripto, combustible y clases particulares están vinculados estrictamente a tu identificador único de cuenta (<code className="text-emerald-300 bg-emerald-950/50 px-1 py-0.5 rounded">UID</code>). Ningún otro usuario puede acceder, modificar ni visualizar tus datos.
            </p>
          </div>

          {/* Card 2: Cero custodia de claves y dinero */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-teal-400 font-bold text-base">
              <KeyRound className="w-4 h-4" />
              <span>Cero Custodia Financiera</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
              La Bóveda funciona como una herramienta de seguimiento y organización personal. <strong className="text-white">Nunca</strong> solicitamos ni almacenamos claves bancarias, tokens de home banking, números de tarjetas de crédito ni llaves privadas de billeteras cripto (seeds/private keys).
            </p>
          </div>

          {/* Card 3: Cifrado y Conexión Segura */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-blue-400 font-bold text-base">
              <Lock className="w-4 h-4" />
              <span>Cifrado en Tránsito y en Reposo</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
              Todas las comunicaciones entre tu navegador y los servidores están cifradas mediante protocolos seguros <strong className="text-white">HTTPS con TLS 1.3</strong>. En los servidores de Google Firebase, la información está cifrada en reposo con estándares de grado bancario (AES-256).
            </p>
          </div>

          {/* Card 4: Respaldo, Caché Local y Portabilidad */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-violet-400 font-bold text-base">
              <FileCheck className="w-4 h-4" />
              <span>Portabilidad Total y Respaldo Local</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
              Tus datos cuentan con sincronización local inmediata para evitar pérdidas ante microcortes o desconexiones. Además, tienes la libertad de exportar e importar toda tu base de datos en formato JSON en cualquier momento desde tu menú de perfil.
            </p>
          </div>

          {/* Bullets resumen */}
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Garantías de Privacidad</h4>
            <ul className="space-y-1.5 text-xs text-gray-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>No vendemos ni compartimos información con anunciantes ni terceros.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Autenticación segura respaldada por la infraestructura global de Google Firebase.</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Control total para crear, editar, eliminar o descargar tus registros cuando desees.</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-sm font-bold bg-white text-black hover:bg-gray-200 transition-colors shadow-lg active:scale-95 cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
