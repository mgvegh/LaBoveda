/**
 * Fuel Tracker and Vehicle Consumption Analytics Tools for MCP Server
 */

export interface FuelRecordInput {
  date: string;
  odometer: number;
  liters: number;
  totalCost: number;
  fuelType?: string;
  isFullTank?: boolean;
  station?: string;
}

export function analyzeFuelEfficiency(params: {
  vehicleName?: string;
  records: FuelRecordInput[];
}) {
  const { vehicleName = "Vehículo", records } = params;

  if (!records || records.length === 0) {
    return { error: "No se proporcionaron registros de combustible para analizar." };
  }

  // Sort by odometer ascending
  const sorted = [...records].sort((a, b) => a.odometer - b.odometer);

  let totalLiters = 0;
  let totalSpent = 0;
  const legs = [];

  for (let i = 0; i < sorted.length; i++) {
    totalLiters += sorted[i].liters;
    totalSpent += sorted[i].totalCost;

    if (i > 0) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const kmDriven = curr.odometer - prev.odometer;

      if (kmDriven > 0 && curr.liters > 0) {
        const kmPerLiter = kmDriven / curr.liters;
        const litersPer100Km = (curr.liters / kmDriven) * 100;
        const costPerKm = curr.totalCost / kmDriven;

        legs.push({
          date: curr.date,
          fromOdo: prev.odometer,
          toOdo: curr.odometer,
          kmDriven,
          liters: curr.liters,
          kmPerLiter: parseFloat(kmPerLiter.toFixed(2)),
          litersPer100Km: parseFloat(litersPer100Km.toFixed(2)),
          costPerKm: parseFloat(costPerKm.toFixed(2)),
          fuelType: curr.fuelType || "Nafta",
          station: curr.station || "N/A",
        });
      }
    }
  }

  const initialOdo = sorted[0].odometer;
  const finalOdo = sorted[sorted.length - 1].odometer;
  const totalKm = finalOdo - initialOdo;

  const avgKmPerLiter = totalKm > 0 && totalLiters > 0 ? totalKm / totalLiters : 0;
  const avgLitersPer100Km = totalKm > 0 && totalLiters > 0 ? (totalLiters / totalKm) * 100 : 0;
  const avgCostPerKm = totalKm > 0 ? totalSpent / totalKm : 0;

  return {
    vehicle: vehicleName,
    summary: {
      totalRecords: sorted.length,
      initialOdometer: initialOdo,
      latestOdometer: finalOdo,
      totalKmTracked: totalKm,
      totalLitersConsumed: parseFloat(totalLiters.toFixed(2)),
      totalSpentArs: Math.round(totalSpent),
      avgKmPerLiter: parseFloat(avgKmPerLiter.toFixed(2)),
      avgLitersPer100Km: parseFloat(avgLitersPer100Km.toFixed(2)),
      avgCostPerKmArs: parseFloat(avgCostPerKm.toFixed(2)),
    },
    legsHistory: legs,
  };
}
