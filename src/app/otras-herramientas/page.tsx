import Link from "next/link";
import { ArrowUpRight, TrendingUp, Fuel } from "lucide-react";

const tools = [
  {
    code: "01",
    href: "/otras-herramientas/cripto",
    icon: TrendingUp,
    title: "Estrategias cripto",
    description: "Bitácora interactiva para MS BTC y Anti-Vitalik. Controlá tus balas y tomá decisiones con regla fija.",
    cta: "Gestionar balas",
  },
  {
    code: "02",
    href: "/otras-herramientas/combustible",
    icon: Fuel,
    title: "Consumo de combustible",
    description: "Registrá tus cargas, medí el consumo promedio por tramo y seguí el rendimiento por vehículo.",
    cta: "Analizar consumo",
  },
];

export default function OtrasHerramientas() {
  return (
    <div className="max-w-[1200px] mx-auto py-8 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-medium tracking-[-0.02em] text-[#ededed]">
          Otras herramientas
        </h1>
        <p className="text-sm text-[#a1a1a6]">
          Utilidades complementarias para registro operativo y seguimiento diario.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className="group bg-[#19191b] hover:bg-[#1e1e21] border border-[rgba(237,237,237,0.08)] hover:border-[rgba(237,237,237,0.14)] rounded-xl p-6 flex flex-col justify-between gap-6 transition-colors duration-150"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-[#232325] border border-[rgba(237,237,237,0.08)] flex items-center justify-center">
                    <Icon className="w-4 h-4 text-[#a1a1a6]" strokeWidth={1.5} />
                  </div>
                  <span className="text-xs font-mono text-[#85858b] tabular">
                    {tool.code}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-base font-medium text-[#ededed]">
                    {tool.title}
                  </h2>
                  <p className="text-sm text-[#a1a1a6] leading-relaxed">
                    {tool.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[rgba(237,237,237,0.06)]">
                <span className="text-sm font-medium text-[#ededed] group-hover:text-[#d99b43] transition-colors duration-150">
                  {tool.cta}
                </span>
                <ArrowUpRight
                  className="w-4 h-4 text-[#85858b] group-hover:text-[#d99b43] transition-colors duration-150"
                  strokeWidth={1.5}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
