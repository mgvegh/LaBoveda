"use client";
import Link from "next/link";
import { ShieldAlert, Home, PiggyBank, Wallet, Bitcoin, GraduationCap } from "lucide-react";

const quickLinks = [
  { href: "/ingresos", label: "Ingresos", icon: PiggyBank },
  { href: "/cedears", label: "CEDEARs", icon: Wallet },
  { href: "/portfolio-cripto", label: "Cripto", icon: Bitcoin },
  { href: "/clases", label: "Clases", icon: GraduationCap },
];

export default function NotFound() {
  return (
    <div className="min-h-[72vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full text-center space-y-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#19191b] border border-[rgba(237,237,237,0.08)]">
          <ShieldAlert className="w-6 h-6 text-[#d99b43]" strokeWidth={1.5} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-mono text-[#85858b] tabular">
            Error 404
          </p>
          <h1 className="text-2xl sm:text-3xl font-medium tracking-[-0.02em] text-[#ededed]">
            Página no encontrada
          </h1>
          <p className="text-sm text-[#a1a1a6] max-w-md mx-auto leading-relaxed">
            La ruta a la que intentás acceder no existe, fue movida o no es válida.
          </p>
        </div>

        <div>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg text-sm font-medium bg-[#d99b43] hover:bg-[#e3a852] text-[#141415] transition-colors duration-150"
          >
            <Home className="w-4 h-4" strokeWidth={1.5} />
            Volver al inicio
          </Link>
        </div>

        <div className="p-5 rounded-xl bg-[#19191b] border border-[rgba(237,237,237,0.08)] space-y-3">
          <div className="text-xs text-[#85858b]">
            Accesos directos
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg bg-[#232325]/60 hover:bg-[#232325] border border-[rgba(237,237,237,0.06)] transition-colors duration-150 text-center"
                >
                  <Icon className="w-4 h-4 text-[#a1a1a6]" strokeWidth={1.5} />
                  <span className="text-xs font-medium text-[#ededed]">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
