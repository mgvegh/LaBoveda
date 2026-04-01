import CedearsTracker from "@/components/CedearsTracker";

export default function CedearsPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">
          Portfolio CEDEARs y Acciones
        </h1>
        <p className="text-gray-400">
          Registra tus compras y observa su valor real en el mercado.
        </p>
      </div>

      <CedearsTracker />
    </div>
  );
}
