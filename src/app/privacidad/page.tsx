"use client";
import Link from "next/link";
import { ShieldCheck, Lock, Database, KeyRound, FileCheck, ArrowLeft, CheckCircle2 } from "lucide-react";

const pillars = [
  {
    icon: Database,
    title: "Aislamiento por UID en Firebase Firestore",
    body: "Cada cuenta tiene un identificador único autenticado (UID). Las reglas de seguridad impiden que cualquier usuario consulte o modifique datos de otra cuenta.",
  },
  {
    icon: KeyRound,
    title: "Cero custodia financiera",
    body: "La Bóveda es una herramienta de registro personal. Nunca solicitamos ni guardamos credenciales bancarias, tokens, tarjetas, frases semilla ni claves privadas.",
  },
  {
    icon: Lock,
    title: "Cifrado en tránsito y en reposo",
    body: "Las conexiones viajan cifradas mediante TLS y los datos almacenados en Google Firebase se encuentran cifrados en reposo bajo el estándar AES-256.",
  },
  {
    icon: FileCheck,
    title: "Portabilidad y respaldo local",
    body: "Los cambios se sincronizan localmente para evitar pérdidas ante cortes de red y podés exportar o importar toda tu base en JSON desde tu perfil.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium text-[#a1a1a6] hover:text-[#ededed] bg-[#19191b] hover:bg-[#232325] border border-[rgba(237,237,237,0.08)] transition-colors duration-150"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Volver al inicio
        </Link>
      </div>

      <header className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-[#232325] border border-[rgba(237,237,237,0.08)] flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-[#d99b43]" strokeWidth={1.5} />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-medium tracking-[-0.02em] text-[#ededed]">
            Seguridad y privacidad de los datos
          </h1>
          <p className="text-sm text-[#a1a1a6]">
            Cómo se protege, aísla y resguarda tu información financiera y operativa.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pillars.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl space-y-3"
            >
              <div className="flex items-center gap-2.5 text-[#ededed] font-medium text-sm">
                <Icon className="w-4 h-4 text-[#a1a1a6] shrink-0" strokeWidth={1.5} />
                <span>{item.title}</span>
              </div>
              <p className="text-sm text-[#a1a1a6] leading-relaxed">
                {item.body}
              </p>
            </div>
          );
        })}
      </div>

      <section className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl space-y-4">
        <h2 className="text-sm font-medium text-[#ededed]">
          Compromiso de transparencia
        </h2>
        <ul className="space-y-2.5 text-sm text-[#a1a1a6]">
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#4cc38a] mt-0.5 shrink-0" strokeWidth={1.5} />
            <span>Sin publicidad ni venta de datos: tu historial y cálculos nunca se comparten ni transfieren a terceros.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#4cc38a] mt-0.5 shrink-0" strokeWidth={1.5} />
            <span>Control total: podés modificar o eliminar registros y vehículos en cualquier momento.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#4cc38a] mt-0.5 shrink-0" strokeWidth={1.5} />
            <span>Infraestructura respaldada por autenticación y base de datos de Google Firebase.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
