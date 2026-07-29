import Link from "next/link";
import { ArrowRight, TrendingUp, Fuel } from "lucide-react";

export default function OtrasHerramientas() {
  return (
    <div className="max-w-6xl mx-auto space-y-8 py-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
          Otras Herramientas
        </h1>
        <p className="text-gray-400">
          Accedé a herramientas secundarias y utilidades complementarias para tu día a día.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <Link 
          href="/otras-herramientas/cripto" 
          className="group glass-panel rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 border-orange-500/10 hover:border-orange-500/30"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-orange-500/20 to-purple-500/20 rounded-2xl text-orange-400 group-hover:scale-110 transition-transform duration-300 shadow-inner">
              <TrendingUp className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-100">Estrategias Cripto</h2>
          </div>
          <p className="text-gray-400 mb-8 leading-relaxed text-sm">
            Bitácora interactiva para MS BTC y Anti-Vitalik. Controlá tus balas y tomá decisiones matemáticas sin emociones.
          </p>
          <div className="flex items-center text-orange-400 text-sm font-semibold group-hover:text-amber-300 transition-colors">
            Gestionar Balas <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        <Link 
          href="/otras-herramientas/combustible" 
          className="group glass-panel rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 border-sky-500/10 hover:border-sky-500/30"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-sky-500/20 to-indigo-500/20 rounded-2xl text-sky-400 group-hover:scale-110 transition-transform duration-300 shadow-inner">
              <Fuel className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-100">Consumo de Combustible</h2>
          </div>
          <p className="text-gray-400 mb-8 leading-relaxed text-sm">
            Registrá tus cargas, medí el consumo promedio por tramo y analizá el rendimiento del combustible de tu auto.
          </p>
          <div className="flex items-center text-sky-400 text-sm font-semibold group-hover:text-sky-300 transition-colors">
            Analizar Consumo <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>
    </div>
  );
}
