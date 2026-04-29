import Link from "next/link";
import { ArrowRight, Bitcoin, ShieldCheck, Wallet, Briefcase, PiggyBank } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col gap-8 items-center justify-center min-h-[85vh]">
      <div className="text-center space-y-6 max-w-3xl">
        <div className="inline-flex items-center justify-center p-2 bg-orange-500/10 rounded-full mb-4">
          <span className="px-3 py-1 text-sm font-medium text-orange-400 bg-orange-500/10 rounded-full">Versión 2.0</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-400 to-blue-400">
          Tu centro de control financiero
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Gestiona tu portfolio, tus criptos y distribuí tus ingresos de forma inteligente. Todo sincronizado en la nube.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-7xl mt-10">
        <Link href="/cedears" className="group glass-panel rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 border-blue-500/10 hover:border-blue-500/30">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-2xl text-blue-400 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300 shadow-inner">
              <Briefcase className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-100">Portfolio CEDEARs</h2>
          </div>
          <p className="text-gray-400 mb-8 leading-relaxed text-sm">
            Importá tu historial de Cocos en CSV o registrá compras manuales. Cotizaciones en tiempo real.
          </p>
          <div className="flex items-center text-blue-400 font-medium group-hover:text-blue-300 text-sm">
            Ver Portfolio <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
          </div>
        </Link>
        
        <Link href="/portfolio-cripto" className="group glass-panel rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 border-teal-500/10 hover:border-teal-500/30">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-teal-500/20 to-emerald-500/20 rounded-2xl text-teal-400 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-inner">
              <Wallet className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-100">Portfolio Cripto</h2>
          </div>
          <p className="text-gray-400 mb-8 leading-relaxed text-sm">
            Gestión a largo plazo de tus tenencias en Spot (HOLD). Rendimiento consolidado en USD.
          </p>
          <div className="flex items-center text-teal-400 text-sm font-semibold group-hover:text-teal-300 transition-colors">
            Ver Billetera <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        <Link href="/cripto" className="group glass-panel rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 border-orange-500/10 hover:border-orange-500/30">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-orange-500/20 to-purple-500/20 rounded-2xl text-orange-400 group-hover:scale-110 transition-transform duration-300 shadow-inner flex items-center -space-x-2">
              <Bitcoin className="w-8 h-8 relative z-10" />
              <svg viewBox="0 0 32 32" className="w-8 h-8 fill-current text-purple-400"><path d="M15.925 23.969l-9.819-5.794L16 32l9.894-13.825-9.969 5.794zM16.075 0L6.181 16.481l9.819 5.806 9.894-5.806L16.075 0z"/></svg>
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-100">Estrategias Cripto</h2>
          </div>
          <p className="text-gray-400 mb-8 leading-relaxed text-sm">
            Bitácora interactiva para MS BTC y Anti-Vitalik. Controlá tus balas y tomá decisiones sin emociones.
          </p>
          <div className="flex items-center text-orange-400 text-sm font-semibold group-hover:text-amber-300 transition-colors">
            Ver Estrategias <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        <Link href="/ingresos" className="group glass-panel rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 border-violet-500/10 hover:border-violet-500/30">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-violet-500/20 to-pink-500/20 rounded-2xl text-violet-400 group-hover:scale-110 transition-transform duration-300 shadow-inner">
              <PiggyBank className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-100">Distribución de Ingresos</h2>
          </div>
          <p className="text-gray-400 mb-8 leading-relaxed text-sm">
            Ingresá tu sueldo y distribuí automáticamente: inversiones mínimas en USD, ahorro, gastos y más.
          </p>
          <div className="flex items-center text-violet-400 text-sm font-semibold group-hover:text-violet-300 transition-colors">
            Planificar Ingresos <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      <div className="glass rounded-2xl px-6 py-4 mt-8 flex items-center gap-3 text-sm text-gray-400 shadow-lg border-white/5">
        <ShieldCheck className="w-5 h-5 text-gray-500" />
        <span>100% gratuito. Todo se procesa de manera segura y privada.</span>
      </div>
    </div>
  );
}
