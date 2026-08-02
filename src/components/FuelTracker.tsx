"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Fuel, Calendar, Gauge, Trash2, Plus, Pencil,
  TrendingUp, Coins, Info, Filter, RotateCcw,
  Sparkles, AlertCircle, Car, X, Check
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { 
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy 
} from "firebase/firestore";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend
} from "recharts";

type Vehicle = {
  id: string;
  name: string;          // e.g. "Peugeot 208", "Gol Trend"
  plate?: string;         // e.g. "AA123BB"
  defaultFuelType?: string; // e.g. "Nafta Súper"
};

type FuelRecord = {
  id: string;
  date: string;       // YYYY-MM-DD
  odometer: number;   // km
  liters: number;     // liters
  cost: number;       // total cost in ARS
  fuelType: string;   // Nafta Súper, Premium, Gasoil, GNC
  isFull: boolean;    // Is this a full tank?
  vehicleId?: string; // ID of the associated vehicle
};

type ComputedRecord = FuelRecord & {
  distance?: number;      // km since previous full tank (inclusive of intermediate partials)
  consumption?: number;   // calculated fuel consumption for this segment
  costPerKm?: number;     // ARS per km for this segment
  pricePerLiter: number;  // ARS per liter
};

export default function FuelTracker() {
  // Records & Computed State
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [computedRecords, setComputedRecords] = useState<ComputedRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<ComputedRecord[]>([]);
  
  // Vehicles State
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("all");
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState("");
  const [newVehiclePlate, setNewVehiclePlate] = useState("");
  const [newVehicleFuelType, setNewVehicleFuelType] = useState("Nafta Súper");
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [assignTargetVehicleId, setAssignTargetVehicleId] = useState<string>("");

  // Load Form State
  const [date, setDate] = useState<string>("");
  const [odometer, setOdometer] = useState<string>("");
  const [liters, setLiters] = useState<string>("");
  const [cost, setCost] = useState<string>("");
  const [fuelType, setFuelType] = useState<string>("Nafta Súper");
  const [isFull, setIsFull] = useState<boolean>(true);
  const [formVehicleId, setFormVehicleId] = useState<string>("");
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  
  // Filter and Toggle State
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [unit, setUnit] = useState<"L/100km" | "km/L">("L/100km");
  
  const [isClient, setIsClient] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const formRef = useRef<HTMLDivElement | null>(null);

  // Load vehicles from Firestore
  const fetchVehicles = async () => {
    if (!user) return;
    try {
      const snap = await getDocs(collection(db, "users", user.uid, "vehicles"));
      const vData: Vehicle[] = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Vehicle[];
      setVehicles(vData);
      if (vData.length > 0 && !formVehicleId) {
        setFormVehicleId(vData[0].id);
      }
    } catch (e) {
      console.error("Error fetching vehicles:", e);
    }
  };

  // Load fuel records from Firestore
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
    const today = new Date().toISOString().split("T")[0];
    setDate(today);
    fetchVehicles();
    fetchRecords();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate segment consumptions based on standard algorithm GROUPED BY VEHICLE
  useEffect(() => {
    if (records.length === 0) {
      setComputedRecords([]);
      return;
    }

    // Group records by vehicleId (fallback to "unassigned" for older records)
    const groupedByVehicle: Record<string, FuelRecord[]> = {};
    for (const r of records) {
      const vId = r.vehicleId || "unassigned";
      if (!groupedByVehicle[vId]) {
        groupedByVehicle[vId] = [];
      }
      groupedByVehicle[vId].push(r);
    }

    const computed: ComputedRecord[] = [];

    // Process consumption independently per vehicle
    for (const vId in groupedByVehicle) {
      const sorted = [...groupedByVehicle[vId]].sort((a, b) => a.odometer - b.odometer);

      for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const pricePerLiter = current.liters > 0 ? current.cost / current.liters : 0;
        
        const recordComp: ComputedRecord = {
          ...current,
          pricePerLiter
        };

        if (current.isFull) {
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
    }

    setComputedRecords(computed);
  }, [records, unit]);

  // Handle Filtering by Vehicle and Date Range
  useEffect(() => {
    if (computedRecords.length === 0) {
      setFilteredRecords([]);
      return;
    }

    let filtered = [...computedRecords];

    if (selectedVehicleId !== "all") {
      filtered = filtered.filter(r => {
        const rVId = r.vehicleId || "unassigned";
        return rVId === selectedVehicleId;
      });
    }

    if (startDate) {
      filtered = filtered.filter(r => r.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(r => r.date <= endDate);
    }

    // Sort by odometer descending for table viewing
    setFilteredRecords(filtered.sort((a, b) => b.odometer - a.odometer));
  }, [computedRecords, selectedVehicleId, startDate, endDate]);

  // Add / Edit Vehicle Handlers
  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newVehicleName.trim()) return;

    try {
      if (editingVehicleId) {
        // Update existing vehicle
        await updateDoc(doc(db, "users", user.uid, "vehicles", editingVehicleId), {
          name: newVehicleName.trim(),
          plate: newVehiclePlate.trim(),
          defaultFuelType: newVehicleFuelType
        });
      } else {
        // Add new vehicle
        const newV = {
          name: newVehicleName.trim(),
          plate: newVehiclePlate.trim(),
          defaultFuelType: newVehicleFuelType,
          created_at: new Date().toISOString()
        };
        const ref = await addDoc(collection(db, "users", user.uid, "vehicles"), newV);
        setFormVehicleId(ref.id);
        if (selectedVehicleId === "all") setSelectedVehicleId(ref.id);
      }

      setNewVehicleName("");
      setNewVehiclePlate("");
      setEditingVehicleId(null);
      setShowVehicleModal(false);
      await fetchVehicles();
    } catch (e) {
      console.error("Error saving vehicle:", e);
      alert("Error al guardar el vehículo.");
    }
  };

  const handleEditVehicleClick = (v: Vehicle) => {
    setEditingVehicleId(v.id);
    setNewVehicleName(v.name);
    setNewVehiclePlate(v.plate || "");
    setNewVehicleFuelType(v.defaultFuelType || "Nafta Súper");
    setShowVehicleModal(true);
  };

  const handleDeleteVehicle = async (vId: string) => {
    if (!user) return;
    if (!confirm("¿Deseas eliminar este vehículo? Los registros cargados se conservarán.")) return;

    try {
      await deleteDoc(doc(db, "users", user.uid, "vehicles", vId));
      if (selectedVehicleId === vId) setSelectedVehicleId("all");
      if (formVehicleId === vId) setFormVehicleId("");
      await fetchVehicles();
    } catch (e) {
      console.error("Error deleting vehicle:", e);
      alert("Error al eliminar el vehículo.");
    }
  };

  // Batch assign all unassigned records to a target vehicle
  const handleBatchAssignUnassigned = async (targetVehicleId: string) => {
    if (!user || !targetVehicleId) return;
    const unassigned = records.filter(r => !r.vehicleId);
    if (unassigned.length === 0) return;

    const targetV = vehicles.find(v => v.id === targetVehicleId);
    const targetName = targetV ? (targetV.plate ? `${targetV.name} (${targetV.plate})` : targetV.name) : "el vehículo seleccionado";

    if (!confirm(`¿Deseas asignar las ${unassigned.length} carga(s) sin auto a "${targetName}"?`)) return;

    try {
      setLoading(true);
      for (const rec of unassigned) {
        await updateDoc(doc(db, "users", user.uid, "fuel_records", rec.id), {
          vehicleId: targetVehicleId
        });
      }
      setAssignTargetVehicleId("");
      await fetchRecords();
      alert(`¡Se asignaron ${unassigned.length} cargas a "${targetName}" correctamente!`);
    } catch (e) {
      console.error("Error batch assigning records:", e);
      alert("Error al asignar las cargas.");
      setLoading(false);
    }
  };

  // Assign a single unassigned record to a vehicle directly from table row
  const handleAssignSingleRecord = async (recId: string, targetVehicleId: string) => {
    if (!user || !targetVehicleId) return;
    try {
      setLoading(true);
      await updateDoc(doc(db, "users", user.uid, "fuel_records", recId), {
        vehicleId: targetVehicleId
      });
      await fetchRecords();
    } catch (e) {
      console.error("Error assigning single record:", e);
      alert("Error al asignar el vehículo.");
      setLoading(false);
    }
  };

  // Start Editing a Fuel Load
  const handleStartEdit = (rec: FuelRecord) => {
    setEditingRecordId(rec.id);
    setDate(rec.date);
    setOdometer(rec.odometer.toString());
    setLiters(rec.liters.toString());
    setCost(rec.cost.toString());
    setFuelType(rec.fuelType);
    setIsFull(rec.isFull);
    setFormVehicleId(rec.vehicleId || (vehicles[0]?.id || ""));
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingRecordId(null);
    setOdometer("");
    setLiters("");
    setCost("");
    const today = new Date().toISOString().split("T")[0];
    setDate(today);
  };

  // Submit Add or Edit Fuel Load
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

    // Check duplicate odometer (except when editing current record)
    const duplicate = records.find(r => r.odometer === odomVal && r.id !== editingRecordId && (r.vehicleId || "unassigned") === (formVehicleId || "unassigned"));
    if (duplicate) {
      alert("Ya existe una carga registrada con ese kilometraje exacto para este vehículo.");
      return;
    }

    try {
      setLoading(true);
      const recordPayload = {
        date,
        odometer: odomVal,
        liters: litVal,
        cost: costVal,
        fuelType,
        isFull,
        vehicleId: formVehicleId || (vehicles[0]?.id || "")
      };

      if (editingRecordId) {
        // Update existing record
        await updateDoc(doc(db, "users", user.uid, "fuel_records", editingRecordId), recordPayload);
        setEditingRecordId(null);
      } else {
        // Create new record
        await addDoc(collection(db, "users", user.uid, "fuel_records"), {
          ...recordPayload,
          created_at: new Date().toISOString()
        });
      }
      
      // Reset form fields
      setOdometer("");
      setLiters("");
      setCost("");
      const today = new Date().toISOString().split("T")[0];
      setDate(today);

      await fetchRecords();
    } catch (e) {
      console.error("Error saving fuel record:", e);
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
      if (editingRecordId === id) handleCancelEdit();
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
    const chronRecords = [...filteredRecords].sort((a, b) => a.odometer - b.odometer);
    
    if (chronRecords.length < 2) {
      return {
        avgConsumption: 0,
        totalCost: chronRecords.reduce((acc, r) => acc + r.cost, 0),
        totalLiters: chronRecords.reduce((acc, r) => acc + r.liters, 0),
        totalDistance: 0,
        avgPricePerLiter: chronRecords.length > 0 && chronRecords.reduce((acc, r) => acc + r.liters, 0) > 0
          ? chronRecords.reduce((acc, r) => acc + r.cost, 0) / chronRecords.reduce((acc, r) => acc + r.liters, 0)
          : 0,
        avgCostPerKm: 0,
        avgDistanceBetween: 0
      };
    }

    const fullTanks = chronRecords.filter(r => r.isFull);
    
    let avgConsumption = 0;
    let calcDistance = 0;
    let calcLiters = 0;

    if (fullTanks.length >= 2) {
      const firstFull = fullTanks[0];
      const lastFull = fullTanks[fullTanks.length - 1];
      
      const firstIndex = chronRecords.findIndex(r => r.id === firstFull.id);
      const lastIndex = chronRecords.findIndex(r => r.id === lastFull.id);
      
      calcDistance = lastFull.odometer - firstFull.odometer;
      
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
    
    const absoluteDistance = chronRecords[chronRecords.length - 1].odometer - chronRecords[0].odometer;
    
    const avgPricePerLiter = totalLiters > 0 ? totalCost / totalLiters : 0;
    const avgCostPerKm = absoluteDistance > 0 ? totalCost / absoluteDistance : 0;

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
  const unassignedCount = records.filter(r => !r.vehicleId).length;

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

  // Map vehicle ID to Vehicle Name helper
  const getVehicleName = (vId?: string) => {
    if (!vId) return "Sin asignar";
    const v = vehicles.find(item => item.id === vId);
    return v ? (v.plate ? `${v.name} (${v.plate})` : v.name) : "Vehículo";
  };

  if (!isClient) return null;

  return (
    <div className="space-y-6">

      {/* Vehicle Selection Header Bar */}
      <div className="glass rounded-3xl p-5 border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900/60 to-sky-950/20">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-500/10 border border-sky-500/20 rounded-2xl text-sky-400">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Vehículo Seleccionado</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-sm font-bold text-sky-400 focus:outline-none focus:border-sky-500/50 cursor-pointer"
              >
                <option value="all">🚗 Todos los vehículos ({records.length} cargas)</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    🚘 {v.name} {v.plate ? `[${v.plate}]` : ""}
                  </option>
                ))}
                {unassignedCount > 0 && (
                  <option value="unassigned">⚠️ Cargas sin auto asignado ({unassignedCount})</option>
                )}
              </select>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingVehicleId(null);
            setNewVehicleName("");
            setNewVehiclePlate("");
            setShowVehicleModal(true);
          }}
          className="flex items-center gap-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Gestionar / Nuevo Auto</span>
        </button>
      </div>

      {/* Unassigned Loads Batch Assignment Alert Banner */}
      {unassignedCount > 0 && vehicles.length > 0 && (
        <div className="glass rounded-2xl p-4 border-amber-500/20 bg-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <span>
              Tienes <strong className="text-white font-bold">{unassignedCount}</strong> carga(s) sin vehículo asignado.
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-gray-400 whitespace-nowrap">Asignar todas a:</span>
            <select
              value={assignTargetVehicleId}
              onChange={(e) => setAssignTargetVehicleId(e.target.value)}
              className="bg-black/50 border border-amber-500/30 rounded-xl px-2.5 py-1 text-xs text-amber-100 focus:outline-none cursor-pointer"
            >
              <option value="">Seleccionar auto...</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.plate ? `(${v.plate})` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => handleBatchAssignUnassigned(assignTargetVehicleId)}
              disabled={!assignTargetVehicleId || loading}
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-3.5 py-1 rounded-xl shadow transition-all disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              Asignar Cargas
            </button>
          </div>
        </div>
      )}

      {/* Vehicle Management Modal */}
      {showVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass bg-[#12141c] border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-gray-100 flex items-center gap-2">
                <Car className="w-5 h-5 text-sky-400" />
                {editingVehicleId ? "Editar Auto" : "Agregar Nuevo Auto"}
              </h3>
              <button 
                onClick={() => {
                  setShowVehicleModal(false);
                  setEditingVehicleId(null);
                }}
                className="text-gray-400 hover:text-gray-200 p-1 rounded-lg hover:bg-white/5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of Existing Vehicles */}
            {vehicles.length > 0 && !editingVehicleId && (
              <div className="space-y-2">
                <span className="text-xs text-gray-400 font-medium">Tus vehículos registrados:</span>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {vehicles.map(v => (
                    <div key={v.id} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-xs">
                      <div>
                        <span className="font-semibold text-gray-200">{v.name}</span>
                        {v.plate && <span className="ml-2 text-gray-400 text-[11px]">({v.plate})</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditVehicleClick(v)}
                          className="p-1 text-gray-400 hover:text-sky-400 hover:bg-white/5 rounded-md cursor-pointer"
                          title="Editar vehículo"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteVehicle(v.id)}
                          className="p-1 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded-md cursor-pointer"
                          title="Eliminar vehículo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Vehicle Form */}
            <form onSubmit={handleSaveVehicle} className="space-y-3 pt-1">
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">
                  Nombre / Modelo <span className="text-sky-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej: Peugeot 208 Active"
                  value={newVehicleName}
                  onChange={(e) => setNewVehicleName(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-sky-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-medium block mb-1">Patente (Opcional)</label>
                  <input
                    type="text"
                    placeholder="ej: AF123CD"
                    value={newVehiclePlate}
                    onChange={(e) => setNewVehiclePlate(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-sky-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium block mb-1">Combustible Usual</label>
                  <select
                    value={newVehicleFuelType}
                    onChange={(e) => setNewVehicleFuelType(e.target.value)}
                    className="w-full bg-[#18181b] border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-sky-500/50 cursor-pointer"
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

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowVehicleModal(false);
                    setEditingVehicleId(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-gray-200 rounded-xl hover:bg-white/5 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-white rounded-xl shadow-lg transition-all cursor-pointer"
                >
                  {editingVehicleId ? "Guardar Auto" : "Agregar Auto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 bg-white/5 hover:bg-white/10 rounded-lg px-2 py-1 transition-all cursor-pointer"
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
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              unit === "L/100km" 
                ? "bg-sky-500/20 text-sky-400 border border-sky-500/30 shadow-sm"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            L/100km
          </button>
          <button 
            onClick={() => setUnit("km/L")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              unit === "km/L" 
                ? "bg-sky-500/20 text-sky-400 border border-sky-500/30 shadow-sm"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            km/L
          </button>
        </div>
      </div>

      {/* Top Grid: Compact Refill Form + Consumption Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Compact Refill Form */}
        <div className="lg:col-span-5 space-y-4">
          <div ref={formRef} className="glass rounded-3xl p-5 border-white/5 relative overflow-hidden transition-all">
            <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <h2 className="text-base font-bold text-gray-200">
                  {editingRecordId ? "Editar Carga" : "Registrar Carga"}
                </h2>
              </div>
              {editingRecordId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-[11px] text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Vehicle Selection in Form */}
              {vehicles.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400 font-medium flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5 text-gray-500" /> Vehículo
                  </label>
                  <select
                    value={formVehicleId}
                    onChange={(e) => setFormVehicleId(e.target.value)}
                    className="w-full bg-[#18181b] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-sky-500/50 cursor-pointer"
                  >
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.name} {v.plate ? `(${v.plate})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {/* Date */}
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400 font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-500" /> Fecha
                  </label>
                  <input 
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-black/35 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-sky-500/50"
                  />
                </div>

                {/* Fuel Type */}
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400 font-medium flex items-center gap-1.5">
                    <Fuel className="w-3.5 h-3.5 text-gray-500" /> Combustible
                  </label>
                  <select
                    value={fuelType}
                    onChange={(e) => setFuelType(e.target.value)}
                    className="w-full bg-[#18181b] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-sky-500/50 cursor-pointer"
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

              <div className="grid grid-cols-3 gap-3">
                {/* Odometer (km) */}
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400 font-medium flex items-center gap-1">
                    <Gauge className="w-3 h-3 text-gray-500" /> Km
                  </label>
                  <input 
                    type="number"
                    required
                    placeholder="ej: 104500"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    className="w-full bg-black/35 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-sky-500/50"
                  />
                </div>

                {/* Liters */}
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400 font-medium flex items-center gap-1">
                    Litros (L)
                  </label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    placeholder="ej: 42.5"
                    value={liters}
                    onChange={(e) => setLiters(e.target.value)}
                    className="w-full bg-black/35 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-sky-500/50"
                  />
                </div>

                {/* Cost */}
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-400 font-medium flex items-center gap-1">
                    Costo ($)
                  </label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    placeholder="ej: 45000"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    className="w-full bg-black/35 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-sky-500/50"
                  />
                </div>
              </div>

              {/* Tank Full Toggle */}
              <div className="flex items-center justify-between bg-black/25 border border-white/5 rounded-xl px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-200 flex items-center gap-1">
                    ¿Tanque Lleno? 
                    <span className="text-[10px] text-gray-500 font-normal">(Recomendado)</span>
                  </span>
                  <span className="text-[10px] text-gray-500">Mide consumos entre llenados</span>
                </div>
                <input 
                  type="checkbox"
                  checked={isFull}
                  onChange={(e) => setIsFull(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                />
              </div>

              {/* Submit / Save Button */}
              <button 
                type="submit"
                disabled={loading}
                className={`w-full text-white rounded-xl py-2.5 px-4 text-xs font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-1 cursor-pointer ${
                  editingRecordId
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:shadow-amber-500/10"
                    : "bg-gradient-to-r from-sky-500 to-indigo-500 hover:shadow-sky-500/10"
                }`}
              >
                {editingRecordId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{editingRecordId ? "Guardar Cambios" : "Agregar Carga"}</span>
              </button>
            </form>
          </div>

          {/* Explanation Banner */}
          <div className="glass rounded-2xl p-4 border-white/5 bg-sky-950/10 flex gap-3 text-xs text-gray-400">
            <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-[11px]">
              <span className="font-semibold text-gray-200 block">Métrica de consumo</span>
              <p className="leading-normal">
                El consumo se calcula al cargar con <strong className="text-sky-300">"Tanque Lleno"</strong> midiendo los km desde el llenado anterior del mismo vehículo.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Consumption Chart */}
        <div className="lg:col-span-7">
          {chartData.length > 0 ? (
            <div className="glass rounded-3xl p-5 border-white/5 h-full flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-sky-400" />
                  Histórico de Consumo y Costo
                </h3>
                <span className="text-[10px] text-gray-500">Orden cronológico</span>
              </div>
              
              <div className="h-64 w-full text-xs mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" stroke="#9ca3af" />
                    <YAxis 
                      yAxisId="left" 
                      stroke="#38bdf8" 
                      domain={['auto', 'auto']}
                      label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#38bdf8', offset: 10 }}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      stroke="#f59e0b"
                      domain={['auto', 'auto']}
                      label={{ value: '$/L', angle: 90, position: 'insideRight', fill: '#f59e0b', offset: 10 }}
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
          ) : (
            <div className="glass rounded-3xl p-8 border-white/5 h-full flex flex-col items-center justify-center text-center text-gray-500 text-xs space-y-2">
              <TrendingUp className="w-8 h-8 text-gray-600" />
              <p>El gráfico se generará cuando registres tus cargas de combustible.</p>
            </div>
          )}
        </div>
      </div>

      {/* FULL WIDTH Historical Refills Table Card (col-span-12) */}
      <div className="glass rounded-3xl border-white/5 overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-black/20">
          <h3 className="text-base font-bold text-gray-200 flex items-center gap-2">
            <Fuel className="w-4 h-4 text-sky-400" />
            Historial de Cargas
          </h3>
          <span className="text-xs text-gray-400 bg-white/5 rounded-full px-3 py-1 font-semibold">
            {filteredRecords.length} cargas registradas
          </span>
        </div>

        {loading && records.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">Cargando datos...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-16 text-center text-gray-500 text-sm space-y-2">
            <AlertCircle className="w-8 h-8 text-gray-600 mx-auto" />
            <p>No se encontraron cargas registradas.</p>
            <p className="text-xs text-gray-600">Comienza agregando tu primera carga en el formulario superior.</p>
          </div>
        ) : (
          /* FULL WIDTH & INCREASED HEIGHT max-h-[600px] */
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-sm text-gray-300 border-separate border-spacing-0">
              <thead className="text-xs text-gray-300 uppercase sticky top-0 z-20 shadow-md">
                <tr>
                  <th className="px-4 py-3 bg-[#12141c] border-b border-white/10 font-semibold">Fecha</th>
                  <th className="px-4 py-3 bg-[#12141c] border-b border-white/10 font-semibold">Vehículo / Auto</th>
                  <th className="px-4 py-3 bg-[#12141c] border-b border-white/10 font-semibold text-right">Odo. (km)</th>
                  <th className="px-4 py-3 bg-[#12141c] border-b border-white/10 font-semibold text-right">Litros (L)</th>
                  <th className="px-4 py-3 bg-[#12141c] border-b border-white/10 font-semibold text-right">Costo Total</th>
                  <th className="px-4 py-3 bg-[#12141c] border-b border-white/10 font-semibold text-right">$/Litro</th>
                  <th className="px-4 py-3 bg-[#12141c] border-b border-white/10 font-semibold text-center">Combustible / Tanque</th>
                  <th className="px-4 py-3 bg-[#12141c] border-b border-white/10 font-semibold text-right text-sky-400">Consumo</th>
                  <th className="px-4 py-3 bg-[#12141c] border-b border-white/10 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRecords.map((rec) => {
                  const formattedDate = new Date(rec.date + "T12:00:00").toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                  });
                  const isBeingEdited = editingRecordId === rec.id;
                  const hasNoVehicle = !rec.vehicleId;
                  return (
                    <tr 
                      key={rec.id} 
                      className={`transition-colors ${
                        isBeingEdited ? "bg-amber-500/10 border-l-2 border-amber-400" : "hover:bg-white/5"
                      }`}
                    >
                      <td className="px-4 py-3 font-medium whitespace-nowrap text-xs text-gray-400">
                        {formattedDate}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {hasNoVehicle ? (
                          vehicles.length > 0 ? (
                            <select
                              onChange={(e) => {
                                if (e.target.value) handleAssignSingleRecord(rec.id, e.target.value);
                              }}
                              defaultValue=""
                              className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold rounded px-2 py-0.5 focus:outline-none cursor-pointer"
                            >
                              <option value="" disabled>⚠️ Asignar auto...</option>
                              {vehicles.map(v => (
                                <option key={v.id} value={v.id} className="bg-[#18181b] text-gray-200">
                                  {v.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-semibold">
                              Sin asignar
                            </span>
                          )
                        ) : (
                          <span className="text-sky-300/90 font-semibold">
                            {getVehicleName(rec.vehicleId)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-200">
                        {rec.odometer.toLocaleString("es-AR")}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-gray-200">
                        {rec.liters.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-emerald-400 font-semibold">
                        ${rec.cost.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-amber-400/90">
                        ${rec.pricePerLiter.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="text-[10px] bg-white/5 border border-white/5 rounded px-2 py-0.5 text-gray-400 font-semibold mr-1.5">
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
                      <td className="px-4 py-3 text-right font-bold text-sky-400 text-xs whitespace-nowrap">
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
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleStartEdit(rec)}
                            className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all cursor-pointer"
                            title="Editar registro"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(rec.id)}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer"
                            title="Eliminar registro"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
  );
}
