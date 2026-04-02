import Link from "next/link";
import { ArrowRight, Bitcoin, LineChart, ShieldCheck, Wallet, Briefcase } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col gap-8 items-center justify-center min-h-[85vh]">
      <div className="text-center space-y-6 max-w-3xl">
        <div className="inline-flex items-center justify-center p-2 bg-orange-500/10 rounded-full mb-4">
          <span className="px-3 py-1 text-sm font-medium text-orange-400 bg-orange-500/10 rounded-full">Prototipo 1.1</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-400 to-blue-400">
          Tu centro de control financiero
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Gestiona tu portfolio de mercado tradicional y automatiza el seguimiento matemático de tu estrategia cripto en una sola plataforma.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl mt-10">
        <Link href="/cedears" className="group glass-panel rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 border-blue-500/10 hover:border-blue-500/30">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-2xl text-blue-400 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300 shadow-inner">
              <Briefcase className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-gray-100">Portfolio CEDEARs</h2>
          </div>
          <p className="text-gray-400 mb-8 line-clamp-3 leading-relaxed">
            Gestiona tus compras cronológicas de CEDEARs y acciones. Observa el valor total actualizado conectando a cotizaciones online de Byma.
          </p>
          <div className="flex items-center text-blue-400 font-medium group-hover:text-blue-300">
            Ver Portfolio <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
          </div>
        </Link>
        
        <Link href="/portfolio-cripto" className="group glass-panel rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 border-teal-500/10 hover:border-teal-500/30">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-teal-500/20 to-emerald-500/20 rounded-2xl text-teal-400 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-inner">
              <Wallet className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-gray-100">Portfolio Cripto</h2>
          </div>
          <p className="text-gray-400 mb-8 line-clamp-3 leading-relaxed">
            Gestión a largo plazo de tus tenencias en Spot (HOLD). Monitorea el rendimiento de tus dólares invertidos en Criptomonedas de manera consolidada.
          </p>
          <div className="w-full flex items-center justify-between text-teal-400 text-sm font-semibold group-hover:text-teal-300 transition-colors">
            <span>Ver Billetera Cripto</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 border border-teal-500/30 rounded-full p-1 transition-transform" />
          </div>
        </Link>

        <Link href="/cripto" className="group glass-panel rounded-3xl p-8 hover:-translate-y-1 transition-all duration-300 border-orange-500/10 hover:border-orange-500/30">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-orange-500/20 to-purple-500/20 rounded-2xl text-orange-400 group-hover:scale-110 transition-transform duration-300 shadow-inner flex items-center -space-x-2">
              <Bitcoin className="w-8 h-8 relative z-10" />
              <svg viewBox="0 0 32 32" className="w-8 h-8 fill-current text-purple-400"><path d="M15.925 23.969l-9.819-5.794L16 32l9.894-13.825-9.969 5.794zM16.075 0L6.181 16.481l9.819 5.806 9.894-5.806L16.075 0z"/></svg>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-gray-100">Estrategias Cripto</h2>
          </div>
          <p className="text-gray-400 mb-8 line-clamp-3 leading-relaxed">
            Bitácora interactiva para tu estrategia "Michael Saylor" o "Estrategia Anti-Vitalik". Controla con exactitud tus balas, registra caídas y toma decisiones precisas y sin emociones en cada trade.
          </p>
          <div className="w-full flex items-center justify-between text-orange-400 text-sm font-semibold group-hover:text-amber-300 transition-colors">
            <span>Ver Panel de Estrategias</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 border border-orange-500/30 rounded-full p-1 transition-transform" />
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
