import Link from "next/link";
import {
  ArrowUpRight, Bitcoin, Wallet, PiggyBank,
  LayoutGrid, GraduationCap, ShieldCheck
} from "lucide-react";

const modules = [
  {
    code: "01",
    href: "/ingresos",
    icon: PiggyBank,
    title: "Distribución de ingresos",
    description: "Ingresá tu sueldo y asigná porcentajes entre inversión, ahorro y gastos.",
    cta: "Planificar ingresos",
    featured: true,
  },
  {
    code: "02",
    href: "/cedears",
    icon: Wallet,
    title: "Portfolio CEDEARs",
    description: "Importá tu historial desde Cocos en CSV o registrá compras manuales con cotización actual.",
    cta: "Ver portfolio",
    featured: false,
  },
  {
    code: "03",
    href: "/portfolio-cripto",
    icon: Bitcoin,
    title: "Portfolio cripto",
    description: "Seguimiento a largo plazo de tus tenencias Spot (HOLD) consolidado en USD.",
    cta: "Ver billetera",
    featured: false,
  },
  {
    code: "04",
    href: "/clases",
    icon: GraduationCap,
    title: "Clases particulares",
    description: "Agendá clases del CET y privadas, controlá alumnos e imprimí informes mensuales.",
    cta: "Gestionar clases",
    featured: false,
  },
  {
    code: "05",
    href: "/otras-herramientas",
    icon: LayoutGrid,
    title: "Otras herramientas",
    description: "Bitácora de estrategias cripto y control de consumo de combustible.",
    cta: "Explorar utilidades",
    featured: false,
  },
];

export default function Home() {
  return (
    <div className="max-w-[1200px] mx-auto py-8 sm:py-12 space-y-12">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="max-w-2xl space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono text-[#85858b] tabular">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#d99b43]" />
          <span>Libro financiero y operativo personal</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-[-0.02em] leading-[1.15] text-[#ededed]">
          Control patrimonial, inversiones y actividad en un solo registro
        </h1>
        <p className="text-sm sm:text-base text-[#a1a1a6] leading-relaxed">
          Distribuí ingresos, seguí tus CEDEARs y tenencias cripto en USD, y llevá el detalle de clases particulares y gastos diarios.
        </p>
      </header>

      {/* ── Modules Grid ───────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-6 gap-4">
        {modules.map((item, idx) => {
          const Icon = item.icon;
          const spanClass = idx < 2 ? "md:col-span-3" : "md:col-span-2";

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${spanClass} group bg-[#19191b] hover:bg-[#1e1e21] border border-[rgba(237,237,237,0.08)] hover:border-[rgba(237,237,237,0.14)] rounded-xl p-6 flex flex-col justify-between gap-6 transition-colors duration-150`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-[#232325] border border-[rgba(237,237,237,0.08)] flex items-center justify-center">
                    <Icon
                      className={item.featured ? "w-4 h-4 text-[#d99b43]" : "w-4 h-4 text-[#a1a1a6]"}
                      strokeWidth={1.5}
                    />
                  </div>
                  <span className="text-xs font-mono text-[#85858b] tabular">
                    {item.code}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-base font-medium text-[#ededed]">
                    {item.title}
                  </h2>
                  <p className="text-sm text-[#a1a1a6] leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[rgba(237,237,237,0.06)]">
                <span className="text-sm font-medium text-[#ededed] group-hover:text-[#d99b43] transition-colors duration-150">
                  {item.cta}
                </span>
                <ArrowUpRight
                  className="w-4 h-4 text-[#85858b] group-hover:text-[#d99b43] transition-colors duration-150"
                  strokeWidth={1.5}
                />
              </div>
            </Link>
          );
        })}
      </section>

      {/* ── Footer note ────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 text-xs text-[#85858b] pt-2">
        <ShieldCheck className="w-4 h-4 text-[#85858b] shrink-0" strokeWidth={1.5} />
        <span>Uso gratuito. Tus registros se guardan de forma privada en tu cuenta sin custodia de fondos.</span>
      </div>
    </div>
  );
}
