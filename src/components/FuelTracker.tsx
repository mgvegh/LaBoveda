"use client";

import { useState, useEffect } from "react";
import { 
  Fuel, Calendar, Gauge, Trash2, Plus, 
  TrendingUp, Coins, Info, Filter, ArrowRight, RotateCcw,
  Sparkles, CheckCircle2, AlertCircle
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { 
  collection, addDoc, getDocs, deleteDoc, doc, query, orderBy 
} from "firebase/firestore";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend
} from "recharts";

type FuelRecord = {
  id: string;
  date: string;       // YYYY-MM-DD
  odometer: number;   // km
  liters: number;     // liters
  cost: number;       // total cost in ARS
  fuelType: string;   // Nafta Súper, Premium, Gasoil, GNC
  isFull: boolean;    // Is this a full tank?
};

type ComputedRecord = FuelRecord & {
  distance?: number;      // km since previous full tank (inclusive of intermediate partials)
  consumption?: number;   // calculated fuel consumption for this segment
  costPerKm?: number;     // ARS per km for this segment
  pricePerLiter: number;  // ARS per liter
};

export default function FuelTracker() {
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [computedRecords, setComputedRecords] = useState<ComputedRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<ComputedRecord[]>([]);
  
  // Form State
  const [date, setDate] = useState<string>("");
  const [odometer, setOdometer] = useState<string>("");
  const [liters, setLiters] = useState<string>("");
  const [cost, setCost] = useState<string>("");
  const [fuelType, setFuelType] = useState<string>("Nafta Súper");
  const [isFull, setIsFull] = useState<boolean>(true);
  
  // Filter and Toggle State
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [unit, setUnit] = useState<"L/100km" | "km/L">("L/100km");
  
  const [isClient, setIsClient] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Load records from Firestore
  const fetchRecords = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "users", user.uid, "fuel_records"),
        orderBy("odometer", "asc")
      );
      const snap = await getDocs(q);
      const data: FuelRecord[] = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FuelRecord[];
      setRecords(data);
    } catch (e) {
      console.error("Error fetching fuel records:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setIsClient(true);
    // Set default date to today
    const today = new Date().toISOString().split("T")[0];
    setDate(today);
    fetchRecords();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate segment consumptions based on standard algorithm
  useEffect(() => {
    if (records.length === 0) {
      setComputedRecords([]);
      return;
    }

    // Sort records by odometer ascending just to be absolutely sure
    const sorted = [...records].sort((a, b) => a.odometer - b.odometer);
    const computed: ComputedRecord[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const pricePerLiter = current.cost / current.liters;
      
      const recordComp: ComputedRecord = {
        ...current,
        pricePerLiter
      };

      // We can only compute consumption if the current refill is "Full Tank" 
      // and there exists a previous "Full Tank" refill in the history.
      if (current.isFull) {
        // Find previous full tank
        let prevFullIndex = -1;
        for (let j = i - 1; j >= 0; j--) {
          if (sorted[j].isFull) {
            prevFullIndex = j;
            break;
          }
        }

        if (prevFullIndex !== -1) {
          const prevFull = sorted[prevFullIndex];
          const distance = current.odometer - prevFull.odometer;
          
          // Sum up liters loaded in between (from prevFullIndex + 1 to i)
          let totalLiters = 0;
          let totalCost = 0;
          for (let k = prevFullIndex + 1; k <= i; k++) {
            totalLiters += sorted[k].liters;
            totalCost += sorted[k].cost;
          }

          if (distance > 0 && totalLiters > 0) {
            const consumptionL100 = (totalLiters / distance) * 100;
            const consumptionKmL = distance / totalLiters;
            
            recordComp.distance = distance;
            recordComp.consumption = unit === "L/100km" ? consumptionL100 : consumptionKmL;
            recordComp.costPerKm = totalCost / distance;
          }
        }
      }

      computed.push(recordComp);
    }

    setComputedRecords(computed);
  }, [records, unit]);

  // Handle Filtering by Date Range
  useEffect(() => {
    if (computedRecords.length === 0) {
      setFilteredRecords([]);
      return;
    }

    let filtered = [...computedRecords];

    if (startDate) {
      filtered = filtered.filter(r => r.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(r => r.date <= endDate);
    }

    // Sort by odometer descending for table viewing, but keep ascending for some metrics/charts
    setFilteredRecords(filtered.sort((a, b) => b.odometer - a.odometer));
  }, [computedRecords, startDate, endDate]);

  // Handle Add Record
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const odomVal = parseInt(odometer);
    const litVal = parseFloat(liters);
    const costVal = parseFloat(cost);

    if (isNaN(odomVal) || isNaN(litVal) || isNaN(costVal)) {
      alert("Por favor completa los campos numéricos correctamente.");
      return;
    }

    if (records.some(r => r.odometer === odomVal)) {
      alert("Ya existe una carga registrada con ese kilometraje exacto.");
      return;
    }

    try {
      setLoading(true);
      const newRec = {
        date,
        odometer: odomVal,
        liters: litVal,
        cost: costVal,
        fuelType,
        isFull,
        created_at: new Date().toISOString()
      };

      await addDoc(collection(db, "users", user.uid, "fuel_records"), newRec);
      
      // Reset form fields
      setOdometer("");
      setLiters("");
      setCost("");
      
      await fetchRecords();
    } catch (e) {
      console.error("Error adding fuel record:", e);
      alert("Error al guardar el registro.");
      setLoading(false);
    }
  };

  // Handle Delete Record
  const handleDelete = async (id: string) => {
    if (!user) return;
    if (!confirm("¿Estás seguro de que deseas eliminar este registro de carga?")) return;

    try {
      setLoading(true);
      await deleteDoc(doc(db, "users", user.uid, "fuel_records", id));
      await fetchRecords();
    } catch (e) {
      console.error("Error deleting fuel record:", e);
      alert("Error al eliminar el registro.");
      setLoading(false);
    }
  };

  // Clean filters
  const resetFilters = () => {
    setStartDate("");
    setEndDate("");
  };

  // Calculate summary metrics on the CURRENT filtered subset of data
  const getMetrics = () => {
    // For calculation, we need them in chronological order
    const chronRecords = [...filteredRecords].sort((a, b) => a.odometer - b.odometer);
    
    if (chronRecords.length < 2) {
      return {
        avgConsumption: 0,
        totalCost: chronRecords.reduce((acc, r) => acc + r.cost, 0),
        totalLiters: chronRecords.reduce((acc, r) => acc + r.liters, 0),
        totalDistance: 0,
        avgPricePerLiter: chronRecords.length > 0 
          ? chronRecords.reduce((acc, r) => acc + r.cost, 0) / chronRecords.reduce((acc, r) => acc + r.liters, 0)
          : 0,
        avgCostPerKm: 0,
        avgDistanceBetween: 0
      };
    }

    // Find first full tank and last full tank in the selected subset
    const fullTanks = chronRecords.filter(r => r.isFull);
    
    let avgConsumption = 0;
    let calcDistance = 0;
    let calcLiters = 0;

    if (fullTanks.length >= 2) {
      const firstFull = fullTanks[0];
      const lastFull = fullTanks[fullTanks.length - 1];
      
      // Find indices in chronRecords
      const firstIndex = chronRecords.findIndex(r => r.id === firstFull.id);
      const lastIndex = chronRecords.findIndex(r => r.id === lastFull.id);
      
      calcDistance = lastFull.odometer - firstFull.odometer;
      
      // Sum up liters loaded in between (excluding first index itself, but including last index)
      for (let k = firstIndex + 1; k <= lastIndex; k++) {
        calcLiters += chronRecords[k].liters;
      }

      if (calcDistance > 0 && calcLiters > 0) {
        avgConsumption = unit === "L/100km" 
          ? (calcLiters / calcDistance) * 100 
          : calcDistance / calcLiters;
      }
    }

    const totalCost = chronRecords.reduce((acc, r) => acc + r.cost, 0);
    const totalLiters = chronRecords.reduce((acc, r) => acc + r.liters, 0);
    
    // Overall absolute distance covers the entire span of filtered records
    const absoluteDistance = chronRecords[chronRecords.length - 1].odometer - chronRecords[0].odometer;
    
    const avgPricePerLiter = totalLiters > 0 ? totalCost / totalLiters : 0;
    const avgCostPerKm = absoluteDistance > 0 ? totalCost / absoluteDistance : 0;

    // Average distance between refills
    const distances: number[] = [];
    for (let i = 1; i < chronRecords.length; i++) {
      distances.push(chronRecords[i].odometer - chronRecords[i - 1].odometer);
    }
    const avgDistanceBetween = distances.length > 0 
      ? distances.reduce((acc, d) => acc + d, 0) / distances.length
      : 0;

    return {
      avgConsumption,
      totalCost,
      totalLiters,
      totalDistance: absoluteDistance,
      avgPricePerLiter,
      avgCostPerKm,
      avgDistanceBetween
    };
  };

  const metrics = getMetrics();

  // Format chart data (chronological)
  const chartData = [...filteredRecords]
    .sort((a, b) => a.odometer - b.odometer)
    .map(r => ({
      date: new Date(r.date + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" }),
      Consumo: r.consumption ? parseFloat(r.consumption.toFixed(2)) : null,
      PrecioLitro: parseFloat(r.pricePerLiter.toFixed(2)),
      Lleno: r.isFull ? "Lleno" : "Parcial",
      Odo: r.odometer
    }));

  if (!isClient) return null;

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Consumption KPI */}
        <div className="glass rounded-2xl p-4 flex flex-col justify-between border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-sky-500/10 group-hover:scale-110 transition-transform">
            <Fuel className="w-12 h-12" />
          </div>
          <span className="text-xs font-medium text-gray-400">Consumo Medio</span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-sky-400">
              {metrics.avgConsumption > 0 ? metrics.avgConsumption.toFixed(2) : "---"}
            </span>
            <span className="text-xs text-gray-500 font-semibold">{unit}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Calculado sobre tanques llenos</p>
        </div>

        {/* Total Spent */}
        <div className="glass rounded-2xl p-4 flex flex-col justify-between border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-emerald-500/10 group-hover:scale-110 transition-transform">
            <Coins className="w-12 h-12" />
          </div>
          <span className="text-xs font-medium text-gray-400">Gasto Acumulado</span>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-400">
              ${metrics.totalCost.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            {metrics.totalLiters.toFixed(1)} L cargados en total
          </p>
        </div>

        {/* Total Distance */}
        <div className="glass rounded-2xl p-4 flex flex-col justify-between border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-purple-500/10 group-hover:scale-110 transition-transform">
            <Gauge className="w-12 h-12" />
          </div>
          <span className="text-xs font-medium text-gray-400">Distancia Recorrida</span>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight text-purple-400">
              {metrics.totalDistance > 0 ? `${metrics.totalDistance.toLocaleString("es-AR")} km` : "---"}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            Distancia total en el rango
          </p>
        </div>

        {/* Cost per Kilometer */}
        <div className="glass rounded-2xl p-4 flex flex-col justify-between border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-indigo-500/10 group-hover:scale-110 transition-transform">
            <TrendingUp className="w-12 h-12" />
          </div>
          <span className="text-xs font-medium text-gray-400">Costo por Kilómetro</span>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight text-indigo-400">
              {metrics.avgCostPerKm > 0 ? `$${metrics.avgCostPerKm.toFixed(1)}` : "---"}
            </span>
            <span className="text-xs text-gray-500 font-semibold"> / km</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Gasto total / distancia total</p>
        </div>

        {/* Average Price per Liter */}
        <div className="glass rounded-2xl p-4 flex flex-col justify-between border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-amber-500/10 group-hover:scale-110 transition-transform">
            <Coins className="w-12 h-12" />
          </div>
          <span className="text-xs font-medium text-gray-400">Precio Medio Litro</span>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight text-amber-400">
              {metrics.avgPricePerLiter > 0 ? `$${metrics.avgPricePerLiter.toFixed(1)}` : "---"}
            </span>
            <span className="text-xs text-gray-500 font-semibold"> / L</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Promedio ponderado</p>
        </div>

        {/* Avg Distance between refills */}
        <div className="glass rounded-2xl p-4 flex flex-col justify-between border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 text-pink-500/10 group-hover:scale-110 transition-transform">
            <Calendar className="w-12 h-12" />
          </div>
          <span className="text-xs font-medium text-gray-400">Frecuencia Carga</span>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight text-pink-400">
              {metrics.avgDistanceBetween > 0 ? `${Math.round(metrics.avgDistanceBetween)} km` : "---"}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Distancia media entre cargas</p>
        </div>
      </div>

      {/* Filters and Unit Toggles bar */}
      <div className="glass rounded-3xl p-5 border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-sm text-gray-400 font-medium">
            <Filter className="w-4 h-4 text-sky-400" />
            <span>Filtrar Tramo:</span>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-black/20 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-sky-500/50 transition-colors"
            />
            <span className="text-gray-500 text-xs">a</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-black/20 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-sky-500/50 transition-colors"
            />
          </div>
          {(startDate || endDate) && (
            <button 
              onClick={resetFilters}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 bg-white/5 hover:bg-white/10 rounded-lg px-2 py-1 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpiar</span>
            </button>
          )}
        </div>

        {/* Unit Selector Toggle */}
        <div className="flex items-center gap-2 bg-black/40 border border-white/5 p-1 rounded-xl w-full md:w-auto justify-center">
          <button 
            onClick={() => setUnit("L/100km")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              unit === "L/100km" 
                ? "bg-sky-500/20 text-sky-400 border border-sky-500/30 shadow-sm"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            L/100km
          </button>
          <button 
            onClick={() => setUnit("km/L")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              unit === "km/L" 
                ? "bg-sky-500/20 text-sky-400 border border-sky-500/30 shadow-sm"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            km/L
          </button>
        </div>
      </div>

      {/* Main Grid: Form + Graph / Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Form & Graph */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Refill Form */}
          <div className="glass rounded-3xl p-6 border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-sky-400" />
              <h2 className="text-lg font-bold text-gray-200">Registrar Carga</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-500" /> Fecha
                  </label>
                  <input 
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-black/35 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-sky-500/50 transition-colors"
                  />
                </div>

                {/* Fuel Type */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
                    <Fuel className="w-3.5 h-3.5 text-gray-500" /> Combustible
                  </label>
                  <select
                    value={fuelType}
                    onChange={(e) => setFuelType(e.target.value)}
                    className="w-full bg-[#18181b] border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-sky-500/50 transition-colors"
                  >
                    <option value="Nafta Súper">Nafta Súper</option>
                    <option value="Nafta Premium">Nafta Premium</option>
                    <option value="Gasoil Súper">Gasoil Súper</option>
                    <option value="Gasoil Premium">Gasoil Premium</option>
                    <option value="GNC">GNC</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* Odometer (km) */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-gray-500" /> Kilometraje
                  </label>
                  <input 
                    type="number"
                    required
                    placeholder="ej: 104500"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    className="w-full bg-black/35 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-sky-500/50 transition-colors"
                  />
                </div>

                {/* Liters */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 font-medium flex items-center gap-1.5 flex-nowrap">
                    Litros (L)
                  </label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    placeholder="ej: 42.5"
                    value={liters}
                    onChange={(e) => setLiters(e.target.value)}
                    className="w-full bg-black/35 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-sky-500/50 transition-colors"
                  />
                </div>

                {/* Cost */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
                    Costo Total ($)
                  </label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    placeholder="ej: 45000"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    className="w-full bg-black/35 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-sky-500/50 transition-colors"
                  />
                </div>
              </div>

              {/* Tank Full Toggle */}
              <div className="flex items-center justify-between bg-black/25 border border-white/5 rounded-2xl px-4 py-3">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-200 flex items-center gap-1">
                    ¿Tanque Lleno? 
                    <span className="text-[10px] text-gray-500 font-normal">(Recomendado)</span>
                  </span>
                  <span className="text-[10px] text-gray-500">Permite calcular consumos precisos</span>
                </div>
                <input 
                  type="checkbox"
                  checked={isFull}
                  onChange={(e) => setIsFull(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                />
              </div>

              {/* Submit Button */}
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 text-white rounded-2xl py-3 px-4 text-sm font-semibold hover:shadow-lg hover:shadow-sky-500/10 hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Carga</span>
              </button>
            </form>
          </div>

          {/* Explanation Banner */}
          <div className="glass rounded-3xl p-5 border-white/5 bg-sky-950/10 flex gap-3 text-xs text-gray-400">
            <Info className="w-5 h-5 text-sky-400 shrink-0" />
            <div className="space-y-1">
              <span className="font-semibold text-gray-200">¿Cómo funciona la métrica de consumo?</span>
              <p className="leading-relaxed">
                El consumo promedio de un tramo se calcula cuando registras una carga con <strong className="text-sky-300">"Tanque Lleno"</strong>. La aplicación mide la distancia recorrida desde el llenado anterior y la divide por los litros cargados para reponer ese combustible. Las cargas parciales intermedias se acumularán y sumarán sus litros en el siguiente llenado completo.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Historical Table & Chart */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Chart Card */}
          {chartData.length > 0 && (
            <div className="glass rounded-3xl p-6 border-white/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-200 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-sky-400" />
                  Histórico de Consumo y Costo
                </h3>
                <span className="text-[10px] text-gray-500">Datos en orden cronológico</span>
              </div>
              
              <div className="h-60 w-full text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" stroke="#9ca3af" />
                    {/* Left Y Axis for Consumption */}
                    <YAxis 
                      yAxisId="left" 
                      stroke="#38bdf8" 
                      domain={['auto', 'auto']}
                      label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#38bdf8', offset: 10 }}
                    />
                    {/* Right Y Axis for Fuel Price */}
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      stroke="#f59e0b"
                      domain={['auto', 'auto']}
                      label={{ value: 'Precio $/L', angle: 90, position: 'insideRight', fill: '#f59e0b', offset: 10 }}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#18181b", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px", color: "#e5e7eb" }} 
                      labelStyle={{ fontWeight: "bold" }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Line 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="Consumo" 
                      name={`Consumo (${unit})`} 
                      stroke="#0284c7" 
                      activeDot={{ r: 6 }} 
                      strokeWidth={2}
                      connectNulls
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="PrecioLitro" 
                      name="Precio Litro ($/L)" 
                      stroke="#d97706" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Historical Refills Table */}
          <div className="glass rounded-3xl border-white/5 overflow-hidden">
            <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-200 flex items-center gap-2">
                <Fuel className="w-4 h-4 text-sky-400" />
                Historial de Cargas
              </h3>
              <span className="text-xs text-gray-400 bg-white/5 rounded-full px-2.5 py-1">
                {filteredRecords.length} cargas
              </span>
            </div>

            {loading && records.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-sm">Cargando datos...</div>
            ) : filteredRecords.length === 0 ? (
              <div className="py-16 text-center text-gray-500 text-sm space-y-2">
                <AlertCircle className="w-8 h-8 text-gray-600 mx-auto" />
                <p>No se encontraron cargas registradas.</p>
                <p className="text-xs text-gray-600">Comienza agregando tu primera carga en el formulario.</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[480px]">
                <table className="w-full text-left text-sm text-gray-300">
                  <thead className="text-xs text-gray-400 uppercase bg-white/5 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3.5">Fecha</th>
                      <th className="px-4 py-3.5 text-right">Odo. (km)</th>
                      <th className="px-4 py-3.5 text-right">Litros (L)</th>
                      <th className="px-4 py-3.5 text-right">Costo Total</th>
                      <th className="px-4 py-3.5 text-right">$/Litro</th>
                      <th className="px-4 py-3.5 text-center">Tipo / Tipo Carga</th>
                      <th className="px-4 py-3.5 text-right text-sky-400">Consumo</th>
                      <th className="px-4 py-3.5 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredRecords.map((rec) => {
                      const formattedDate = new Date(rec.date + "T12:00:00").toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric"
                      });
                      return (
                        <tr key={rec.id} className="hover:bg-white/2 transition-colors">
                          <td className="px-4 py-3.5 font-medium whitespace-nowrap text-xs text-gray-400">
                            {formattedDate}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-xs">
                            {rec.odometer.toLocaleString("es-AR")}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-xs">
                            {rec.liters.toFixed(2)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-xs text-emerald-400">
                            ${rec.cost.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-xs text-amber-400/90">
                            ${rec.pricePerLiter.toFixed(1)}
                          </td>
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            <span className="text-[10px] bg-white/5 border border-white/5 rounded px-2 py-0.5 text-gray-400 font-semibold mr-1">
                              {rec.fuelType}
                            </span>
                            <span className={`text-[10px] rounded px-2 py-0.5 font-semibold ${
                              rec.isFull 
                                ? "bg-sky-500/10 border border-sky-500/20 text-sky-400" 
                                : "bg-purple-500/10 border border-purple-500/20 text-purple-400"
                            }`}>
                              {rec.isFull ? "Lleno" : "Parcial"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-sky-400 text-xs whitespace-nowrap">
                            {rec.consumption ? (
                              <div className="flex flex-col items-end">
                                <span>{rec.consumption.toFixed(2)} <span className="text-[9px] font-normal text-gray-500">{unit}</span></span>
                                {rec.distance && (
                                  <span className="text-[9px] font-normal text-gray-500">
                                    en {rec.distance} km
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-500 text-xs font-normal">---</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <button
                              onClick={() => handleDelete(rec.id)}
                              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                              title="Eliminar registro"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
