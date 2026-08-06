import TutorTracker from "@/components/TutorTracker";

export default function ClasesPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
          Clases Particulares
        </h1>
        <p className="text-gray-400">
          Agendá y controlá tus clases privadas y del Centro de Estudios Turing. Generá informes mensuales listos para imprimir.
        </p>
      </div>

      <TutorTracker />
    </div>
  );
}
