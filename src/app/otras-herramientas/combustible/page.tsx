import FuelTracker from "@/components/FuelTracker";

export default function CombustiblePage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-500">
          Análisis de Consumo de Combustible
        </h1>
        <p className="text-gray-400">
          Registrá tus cargas y hacé un seguimiento detallado del rendimiento de combustible y costos de tu vehículo.
        </p>
      </div>

      <FuelTracker />
    </div>
  );
}
