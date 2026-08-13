"use client";
import Link from "next/link";
import { ShieldAlert, ArrowLeft, Home, PiggyBank, Wallet, Bitcoin, GraduationCap } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-xl w-full text-center space-y-8 animate-in fade-in zoom-in duration-300">
        
        {/* Glow & Icon */}
        <div className="relative inline-flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-orange-500/20 blur-2xl transform scale-150 animate-pulse" />
          <div 
            className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl flex items-center justify-center border shadow-2xl"
            style={{
              background: "linear-gradient(135deg, rgba(251,146,60,0.15) 0%, rgba(139,92,246,0.15) 100%)",
              borderColor: "rgba(251,146,60,0.3)"
            }}
          >
            <ShieldAlert className="w-12 h-12 sm:w-14 sm:h-14 text-orange-400" />
          </div>
        </div>

        {/* Text Details */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono font-bold tracking-wider uppercase">
            Error 404 • Not Found
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Bóveda No Encontrada
          </h1>
          <p className="text-sm sm:text-base text-gray-400 max-w-md mx-auto leading-relaxed">
            La página o sección a la que intentas acceder no existe, ha sido reubicada o la URL no es válida.
          </p>
        </div>

        {/* Main CTA */}
        <div>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold bg-gradient-to-r from-orange-500 to-amber-500 text-black hover:from-orange-400 hover:to-amber-400 transition-all shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-95"
          >
            <Home className="w-4 h-4" />
            Volver al Inicio
          </Link>
        </div>

        {/* Quick Links Section */}
        <div 
          className="p-5 rounded-2xl border text-left space-y-3"
          style={{
            background: "var(--glass-bg, rgba(255,255,255,0.02))",
            borderColor: "var(--border, rgba(255,255,255,0.08))"
          }}
        >
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider text-center">
            Accesos directos recomendados
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Link
              href="/ingresos"
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.08] border border-white/5 hover:border-violet-500/30 transition-all group text-center"
            >
              <PiggyBank className="w-5 h-5 text-violet-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-gray-300 group-hover:text-white">Ingresos</span>
            </Link>

            <Link
              href="/cedears"
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.08] border border-white/5 hover:border-blue-500/30 transition-all group text-center"
            >
              <Wallet className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-gray-300 group-hover:text-white">CEDEARs</span>
            </Link>

            <Link
              href="/portfolio-cripto"
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.08] border border-white/5 hover:border-teal-500/30 transition-all group text-center"
            >
              <Bitcoin className="w-5 h-5 text-teal-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-gray-300 group-hover:text-white">Cripto</span>
            </Link>

            <Link
              href="/clases"
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.08] border border-white/5 hover:border-emerald-500/30 transition-all group text-center"
            >
              <GraduationCap className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-gray-300 group-hover:text-white">Clases</span>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
