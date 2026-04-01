import CriptoTracker from "@/components/CriptoTracker";

export default function CriptoPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-purple-400">
          Estrategias Cripto
        </h1>
        <p className="text-gray-400">
          Gestiona tus balas y automatiza matemáticamente tus estrategias tanto para BTC (Long) como ETH (Short).
        </p>
      </div>

      <CriptoTracker />
    </div>
  );
}
