import CriptoPortfolioTracker from "@/components/CriptoPortfolioTracker";

export default function CriptoPortfolioPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-400">
          Portfolio Cripto
        </h1>
        <p className="text-gray-400">
          Registra tus compras en spot (HOLD) y monitorea el rendimiento real en dólares de tu billetera de inversión cripto.
        </p>
      </div>

      <CriptoPortfolioTracker />
    </div>
  );
}
