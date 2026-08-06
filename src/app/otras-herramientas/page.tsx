import Link from "next/link";
import { ArrowRight, TrendingUp, Fuel } from "lucide-react";

export default function OtrasHerramientas() {
  return (
    <div className="max-w-6xl mx-auto space-y-8 py-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
          Otras Herramientas
        </h1>
        <p style={{ color: "var(--fg-muted)" }}>
          Herramientas complementarias para el día a día.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Link
          href="/otras-herramientas/cripto"
          className="group glass-panel rounded-2xl p-7 flex flex-col gap-5 hover:-translate-y-1 transition-all duration-300 hover:border-orange-500/40"
        >
          <div className="h-0.5 w-10 rounded-full bg-gradient-to-r from-orange-500 to-purple-500 opacity-70 group-hover:w-16 group-hover:opacity-100 transition-all duration-300" />
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/20 to-purple-500/20 text-orange-400 shrink-0 group-hover:scale-110 transition-transform duration-300">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight pt-1" style={{ color: "var(--fg)" }}>
              Estrategias Cripto
            </h2>
          </div>
          <p className="text-sm leading-relaxed flex-1" style={{ color: "var(--fg-muted)" }}>
            Bitácora interactiva para MS BTC y Anti-Vitalik. Controlá tus balas y tomá decisiones matemáticas sin emociones.
          </p>
          <div className="flex items-center text-sm font-semibold text-orange-400 group-hover:text-amber-300 transition-colors">
            Gestionar Balas <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        <Link
          href="/otras-herramientas/combustible"
          className="group glass-panel rounded-2xl p-7 flex flex-col gap-5 hover:-translate-y-1 transition-all duration-300 hover:border-sky-500/40"
        >
          <div className="h-0.5 w-10 rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 opacity-70 group-hover:w-16 group-hover:opacity-100 transition-all duration-300" />
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 text-sky-400 shrink-0 group-hover:scale-110 transition-transform duration-300">
              <Fuel className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight pt-1" style={{ color: "var(--fg)" }}>
              Consumo de Combustible
            </h2>
          </div>
          <p className="text-sm leading-relaxed flex-1" style={{ color: "var(--fg-muted)" }}>
            Registrá tus cargas, medí el consumo promedio por tramo y analizá el rendimiento del combustible de tu auto.
          </p>
          <div className="flex items-center text-sm font-semibold text-sky-400 group-hover:text-sky-300 transition-colors">
            Analizar Consumo <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>
    </div>
  );
}
