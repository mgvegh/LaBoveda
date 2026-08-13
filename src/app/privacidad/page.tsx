"use client";
import Link from "next/link";
import { ShieldCheck, Lock, Database, KeyRound, FileCheck, ArrowLeft, CheckCircle2, ShieldAlert } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 space-y-8 animate-in fade-in duration-300">
      
      {/* Botón de regreso */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Volver al Inicio
        </Link>
      </div>

      {/* Header Principal */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border-emerald-500/20 shadow-xl shadow-emerald-500/5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Seguridad y Privacidad de los Datos
            </h1>
            <p className="text-sm sm:text-base text-gray-400 mt-1">
              Tu información financiera y personal, 100% protegida y bajo tu exclusivo control.
            </p>
          </div>
        </div>
      </div>

      {/* Contenido detallado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Card 1: Aislamiento Firebase */}
        <div className="glass-panel p-6 rounded-2xl border-white/5 space-y-3">
          <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-base">
            <Database className="w-5 h-5" />
            <span>Aislamiento por UID (Firebase Firestore)</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">
            Cada usuario cuenta con un identificador único autenticado (<code className="text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded text-xs">UID</code>). Las reglas de seguridad de Firestore impiden estrictamente que cualquier usuario acceda, consulte o modifique datos pertenecientes a otra cuenta.
          </p>
        </div>

        {/* Card 2: Cero custodia */}
        <div className="glass-panel p-6 rounded-2xl border-white/5 space-y-3">
          <div className="flex items-center gap-2.5 text-teal-400 font-bold text-base">
            <KeyRound className="w-5 h-5" />
            <span>Cero Custodia Financiera</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">
            La Bóveda es un asistente de organización patrimonial personal. <strong className="text-white">Nunca</strong> solicitamos ni almacenamos credenciales bancarias, tokens, números de tarjetas ni frases semilla (seed phrases) o claves privadas de billeteras cripto.
          </p>
        </div>

        {/* Card 3: Cifrado en tránsito y reposo */}
        <div className="glass-panel p-6 rounded-2xl border-white/5 space-y-3">
          <div className="flex items-center gap-2.5 text-blue-400 font-bold text-base">
            <Lock className="w-5 h-5" />
            <span>Cifrado TLS 1.3 & AES-256</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">
            Todas las conexiones viajan cifradas con certificados SSL/TLS de alta graduación. Los datos almacenados en los servidores de Google Firebase se encuentran cifrados en reposo con el estándar bancario AES-256.
          </p>
        </div>

        {/* Card 4: Respaldo y Portabilidad */}
        <div className="glass-panel p-6 rounded-2xl border-white/5 space-y-3">
          <div className="flex items-center gap-2.5 text-violet-400 font-bold text-base">
            <FileCheck className="w-5 h-5" />
            <span>Portabilidad Total y Respaldo Local</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">
            Tus datos se guardan con sincronización local inmediata para evitar pérdidas ante caídas de conexión. Además, tienes la libertad de exportar e importar tu base de datos completa en formato JSON desde tu perfil cuando quieras.
          </p>
        </div>

      </div>

      {/* Compromisos de Privacidad */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border-emerald-500/20 bg-emerald-500/[0.03] space-y-4">
        <h2 className="text-base font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" /> Compromiso de Transparencia
        </h2>
        <ul className="space-y-2.5 text-sm text-gray-300">
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <span><strong>Sin publicidad ni venta de datos:</strong> Tu historial y cálculos nunca se comparten, monetizan ni transfieren a terceros.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <span><strong>Control total:</strong> Puedes modificar, actualizar o eliminar registros y vehículos en cualquier momento con un solo clic.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <span><strong>Infraestructura confiable:</strong> Autenticación y almacenamiento respaldados por la nube de Google Firebase.</span>
          </li>
        </ul>
      </div>

    </div>
  );
}
