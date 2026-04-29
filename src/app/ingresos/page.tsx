import IncomeDistributor from "@/components/IncomeDistributor";

export const metadata = {
  title: "Distribución de Ingresos — La Bóveda",
  description: "Distribuí tus ingresos mensuales en categorías con valores mínimos y porcentajes configurables.",
};

export default function IngresosPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-pink-400 mb-2">
          Distribución de Ingresos
        </h1>
        <p className="text-gray-400">
          Configurá tus categorías con mínimos fijos (USD o ARS) y porcentajes. La cotización del dólar se actualiza automáticamente.
        </p>
      </div>
      <IncomeDistributor />
    </div>
  );
}
