import Link from "next/link";
import {
  ArrowRight, Bitcoin, Wallet, PiggyBank,
  LayoutGrid, GraduationCap, ShieldCheck
} from "lucide-react";

const cards = [
  {
    href: "/ingresos",
    icon: PiggyBank,
    title: "Distribución de Ingresos",
    description: "Ingresá tu sueldo y distribuí automáticamente entre inversiones, ahorro y gastos. Estrategia inteligente de asignación.",
    cta: "Planificar Ingresos",
    gradient: "from-violet-600/25 to-pink-600/20",
    iconColor: "text-violet-400",
    borderHover: "hover:border-violet-500/40",
    ctaColor: "text-violet-400 group-hover:text-violet-300",
    accentLine: "from-violet-500 to-pink-500",
  },
  {
    href: "/cedears",
    icon: Wallet,
    title: "Portfolio CEDEARs",
    description: "Importá tu historial desde Cocos en CSV o registrá compras manuales. Cotizaciones en tiempo real.",
    cta: "Ver Portfolio",
    gradient: "from-blue-600/25 to-cyan-600/20",
    iconColor: "text-blue-400",
    borderHover: "hover:border-blue-500/40",
    ctaColor: "text-blue-400 group-hover:text-blue-300",
    accentLine: "from-blue-500 to-cyan-500",
  },
  {
    href: "/portfolio-cripto",
    icon: null, // custom
    title: "Portfolio Cripto",
    description: "Gestión a largo plazo de tus tenencias Spot (HOLD). Rendimiento consolidado en USD.",
    cta: "Ver Billetera",
    gradient: "from-teal-600/25 to-emerald-600/20",
    iconColor: "text-teal-400",
    borderHover: "hover:border-teal-500/40",
    ctaColor: "text-teal-400 group-hover:text-teal-300",
    accentLine: "from-teal-500 to-emerald-500",
  },
  {
    href: "/clases",
    icon: GraduationCap,
    title: "Clases Particulares",
    description: "Agendá clases del CET y privadas. Controlá alumnos, materias y generá informes mensuales para cobrar.",
    cta: "Gestionar Clases",
    gradient: "from-emerald-600/25 to-teal-600/20",
    iconColor: "text-emerald-400",
    borderHover: "hover:border-emerald-500/40",
    ctaColor: "text-emerald-400 group-hover:text-emerald-300",
    accentLine: "from-emerald-500 to-teal-500",
  },
  {
    href: "/otras-herramientas",
    icon: LayoutGrid,
    title: "Otras Herramientas",
    description: "Estrategias de trading cripto y análisis de consumo de combustible. Utilidades para el día a día.",
    cta: "Explorar",
    gradient: "from-amber-600/25 to-orange-600/20",
    iconColor: "text-amber-400",
    borderHover: "hover:border-amber-500/40",
    ctaColor: "text-amber-400 group-hover:text-amber-300",
    accentLine: "from-amber-500 to-orange-500",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-6 items-center justify-center min-h-[80vh] pt-4">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="text-center space-y-4 max-w-3xl">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-blue-400 to-emerald-400">
            Tu centro de control
          </span>
          <br />
          <span style={{ color: "var(--fg)" }}>financiero personal</span>
        </h1>
      </div>

      {/* ── Cards grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full max-w-6xl">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={`group glass-panel rounded-2xl p-7 flex flex-col gap-5 transition-all duration-300 hover:-translate-y-1 ${card.borderHover}`}
          >
            {/* Top accent line */}
            <div className={`h-0.5 w-10 rounded-full bg-gradient-to-r ${card.accentLine} opacity-70 group-hover:w-16 group-hover:opacity-100 transition-all duration-300`} />

            {/* Icon + title */}
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl bg-gradient-to-br ${card.gradient} ${card.iconColor} shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                {card.icon === null ? (
                  <div className="flex -space-x-1 w-6 h-6 items-center">
                    <Bitcoin className="w-5 h-5 relative z-10" />
                    <svg viewBox="0 0 32 32" className="w-5 h-5 fill-current text-purple-400">
                      <path d="M15.925 23.969l-9.819-5.794L16 32l9.894-13.825-9.969 5.794zM16.075 0L6.181 16.481l9.819 5.806 9.894-5.806L16.075 0z" />
                    </svg>
                  </div>
                ) : (
                  <card.icon className="w-6 h-6" />
                )}
              </div>
              <h2 className="text-lg font-semibold tracking-tight pt-1" style={{ color: "var(--fg)" }}>
                {card.title}
              </h2>
            </div>

            {/* Description */}
            <p className="text-sm leading-relaxed flex-1" style={{ color: "var(--fg-muted)" }}>
              {card.description}
            </p>

            {/* CTA */}
            <div className={`flex items-center text-sm font-semibold transition-colors ${card.ctaColor}`}>
              {card.cta}
              <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1.5 transition-transform duration-200" />
            </div>
          </Link>
        ))}
      </div>

      {/* ── Security badge ────────────────────────────────────────── */}
      <div
        className="glass rounded-xl px-5 py-3 flex items-center gap-2.5 text-sm shadow-sm"
        style={{ color: "var(--fg-muted)", borderColor: "var(--border)" }}
      >
        <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: "var(--fg-subtle)" }} />
        <span>100% gratuito. Todo se procesa de manera segura y privada.</span>
      </div>
    </div>
  );
}
