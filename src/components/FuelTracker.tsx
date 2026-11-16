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
      <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg flex items-center justify-center text-[#d99b43] shrink-0">
            <Car className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <div className="space-y-1">
            <h2 className="text-xs text-[#85858b]">Vehículo seleccionado</h2>
            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="h-9 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm font-medium text-[#ededed] focus:outline-none focus:border-[#d99b43] cursor-pointer"
            >
              <option value="all">Todos los vehículos ({records.length} cargas)</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.plate ? `[${v.plate}]` : ""}
                </option>
              ))}
              {unassignedCount > 0 && (
                <option value="unassigned">Cargas sin auto asignado ({unassignedCount})</option>
              )}
            </select>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingVehicleId(null);
            setNewVehicleName("");
            setNewVehiclePlate("");
            setShowVehicleModal(true);
          }}
          className="inline-flex items-center gap-2 h-9 bg-[#232325] hover:bg-[#2c2c2f] text-[#ededed] border border-[rgba(237,237,237,0.08)] px-3.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
          <span>Gestionar autos</span>
        </button>
      </div>

      {/* Unassigned Loads Batch Assignment Alert Banner */}
      {unassignedCount > 0 && vehicles.length > 0 && (
        <div className="bg-[#19191b] rounded-xl p-4 border border-[#d99b43]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#a1a1a6]">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#d99b43] shrink-0" strokeWidth={1.5} />
            <span>
              Tenés <strong className="text-[#ededed] font-mono tabular">{unassignedCount}</strong> carga(s) sin vehículo asignado.
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-[#85858b] whitespace-nowrap">Asignar a</span>
            <select
              value={assignTargetVehicleId}
              onChange={(e) => setAssignTargetVehicleId(e.target.value)}
              className="h-8 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-2.5 text-xs text-[#ededed] focus:outline-none cursor-pointer"
            >
              <option value="">Seleccionar auto</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.plate ? `(${v.plate})` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => handleBatchAssignUnassigned(assignTargetVehicleId)}
              disabled={!assignTargetVehicleId || loading}
              className="h-8 bg-[#d99b43] hover:bg-[#e3a852] text-[#141415] font-medium px-3 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              Asignar cargas
            </button>
          </div>
        </div>
      )}

      {/* Vehicle Management Modal */}
      {showVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-[#19191b] border border-[rgba(237,237,237,0.12)] rounded-2xl p-6 w-full max-w-md space-y-5 relative">
            <div className="flex items-center justify-between border-b border-[rgba(237,237,237,0.08)] pb-3">
              <h3 className="text-base font-medium text-[#ededed] flex items-center gap-2">
                <Car className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
                {editingVehicleId ? "Editar auto" : "Agregar nuevo auto"}
              </h3>
              <button
                onClick={() => {
                  setShowVehicleModal(false);
                  setEditingVehicleId(null);
                }}
                className="text-[#85858b] hover:text-[#ededed] p-1 rounded-md hover:bg-[#232325] cursor-pointer"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {vehicles.length > 0 && !editingVehicleId && (
              <div className="space-y-2">
                <span className="text-xs text-[#85858b]">Vehículos registrados</span>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {vehicles.map(v => (
                    <div key={v.id} className="flex items-center justify-between bg-[#141415] border border-[rgba(237,237,237,0.06)] rounded-lg px-3 py-2 text-xs">
                      <div>
                        <span className="font-medium text-[#ededed]">{v.name}</span>
                        {v.plate && <span className="ml-2 font-mono text-[#85858b]">({v.plate})</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditVehicleClick(v)}
                          className="p-1 text-[#85858b] hover:text-[#ededed] hover:bg-[#232325] rounded cursor-pointer"
                          title="Editar vehículo"
                        >
                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteVehicle(v.id)}
                          className="p-1 text-[#85858b] hover:text-[#e5484d] hover:bg-[#232325] rounded cursor-pointer"
                          title="Eliminar vehículo"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveVehicle} className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs text-[#a1a1a6] block">
                  Nombre o modelo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Peugeot 208 Active"
                  value={newVehicleName}
                  onChange={(e) => setNewVehicleName(e.target.value)}
                  className="w-full h-9 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm text-[#ededed] focus:outline-none focus:border-[#d99b43]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-[#a1a1a6] block">Patente (opcional)</label>
                  <input
                    type="text"
                    placeholder="AF123CD"
                    value={newVehiclePlate}
                    onChange={(e) => setNewVehiclePlate(e.target.value)}
                    className="w-full h-9 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-[#a1a1a6] block">Combustible usual</label>
                  <select
                    value={newVehicleFuelType}
                    onChange={(e) => setNewVehicleFuelType(e.target.value)}
                    className="w-full h-9 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm text-[#ededed] focus:outline-none focus:border-[#d99b43] cursor-pointer"
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
                  className="h-9 px-3 text-xs font-medium text-[#a1a1a6] hover:text-[#ededed] rounded-lg hover:bg-[#232325] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 text-xs font-medium bg-[#d99b43] hover:bg-[#e3a852] text-[#141415] rounded-lg transition-colors cursor-pointer"
                >
                  {editingVehicleId ? "Guardar auto" : "Agregar auto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* KPI Cards Grid (numbers only, uniform rhythm) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs text-[#85858b]">Consumo medio</span>
          <div className="mt-2 flex items-baseline gap-1 font-mono tabular">
            <span className="text-xl font-medium text-[#d99b43]">
              {metrics.avgConsumption > 0 ? metrics.avgConsumption.toFixed(2) : "—"}
            </span>
            <span className="text-xs text-[#85858b]">{unit}</span>
          </div>
          <p className="text-xs text-[#85858b] mt-1">Sobre tanques llenos</p>
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs text-[#85858b]">Gasto acumulado</span>
          <div className="mt-2 font-mono tabular">
            <span className="text-xl font-medium text-[#ededed]">
              ${metrics.totalCost.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
          <p className="text-xs font-mono text-[#85858b] mt-1 tabular">
            {metrics.totalLiters.toFixed(1)} L cargados
          </p>
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs text-[#85858b]">Distancia</span>
          <div className="mt-2 font-mono tabular">
            <span className="text-xl font-medium text-[#ededed]">
              {metrics.totalDistance > 0 ? `${metrics.totalDistance.toLocaleString("es-AR")} km` : "—"}
            </span>
          </div>
          <p className="text-xs text-[#85858b] mt-1">Total en el rango</p>
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs text-[#85858b]">Costo por km</span>
          <div className="mt-2 flex items-baseline gap-1 font-mono tabular">
            <span className="text-xl font-medium text-[#ededed]">
              {metrics.avgCostPerKm > 0 ? `$${metrics.avgCostPerKm.toFixed(1)}` : "—"}
            </span>
            <span className="text-xs text-[#85858b]">/km</span>
          </div>
          <p className="text-xs text-[#85858b] mt-1">Gasto / distancia</p>
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs text-[#85858b]">Precio medio</span>
          <div className="mt-2 flex items-baseline gap-1 font-mono tabular">
            <span className="text-xl font-medium text-[#ededed]">
              {metrics.avgPricePerLiter > 0 ? `$${metrics.avgPricePerLiter.toFixed(1)}` : "—"}
            </span>
            <span className="text-xs text-[#85858b]">/L</span>
          </div>
          <p className="text-xs text-[#85858b] mt-1">Promedio ponderado</p>
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl p-4 flex flex-col justify-between">
          <span className="text-xs text-[#85858b]">Frecuencia</span>
          <div className="mt-2 font-mono tabular">
            <span className="text-xl font-medium text-[#ededed]">
              {metrics.avgDistanceBetween > 0 ? `${Math.round(metrics.avgDistanceBetween)} km` : "—"}
            </span>
          </div>
          <p className="text-xs text-[#85858b] mt-1">Media entre cargas</p>
        </div>
      </div>

      {/* Filters and Unit Toggles bar */}
      <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs text-[#a1a1a6]">
            <Filter className="w-4 h-4 text-[#85858b]" strokeWidth={1.5} />
            <span>Filtrar tramo</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-2.5 text-xs font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43] transition-colors"
            />
            <span className="text-[#85858b] text-xs">a</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-2.5 text-xs font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43] transition-colors"
            />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 h-8 text-xs text-[#a1a1a6] hover:text-[#ededed] bg-[#232325] rounded-lg px-2.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>Limpiar</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-[#141415] border border-[rgba(237,237,237,0.08)] p-1 rounded-lg w-full md:w-auto justify-center">
          <button
            onClick={() => setUnit("L/100km")}
            className={`px-3 h-7 rounded-md text-xs font-mono font-medium transition-colors cursor-pointer ${
              unit === "L/100km"
                ? "bg-[#232325] text-[#ededed]"
                : "text-[#85858b] hover:text-[#ededed]"
            }`}
          >
            L/100km
          </button>
          <button
            onClick={() => setUnit("km/L")}
            className={`px-3 h-7 rounded-md text-xs font-mono font-medium transition-colors cursor-pointer ${
              unit === "km/L"
                ? "bg-[#232325] text-[#ededed]"
                : "text-[#85858b] hover:text-[#ededed]"
            }`}
          >
            km/L
          </button>
        </div>
      </div>

      {/* Top Grid: Compact Refill Form + Consumption Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 space-y-4">
          <div ref={formRef} className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
                <h2 className="text-base font-medium text-[#ededed]">
                  {editingRecordId ? "Editar carga" : "Registrar carga"}
                </h2>
              </div>
              {editingRecordId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-xs text-[#d99b43] hover:underline cursor-pointer"
                >
                  Cancelar
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {vehicles.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs text-[#a1a1a6] flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5 text-[#85858b]" strokeWidth={1.5} /> Vehículo
                  </label>
                  <select
                    value={formVehicleId}
                    onChange={(e) => setFormVehicleId(e.target.value)}
                    className="w-full h-9 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-xs text-[#ededed] focus:outline-none focus:border-[#d99b43] cursor-pointer"
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
                <div className="space-y-1">
                  <label className="text-xs text-[#a1a1a6] flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#85858b]" strokeWidth={1.5} /> Fecha
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full h-9 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-xs font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-[#a1a1a6] flex items-center gap-1.5">
                    <Fuel className="w-3.5 h-3.5 text-[#85858b]" strokeWidth={1.5} /> Combustible
                  </label>
                  <select
                    value={fuelType}
                    onChange={(e) => setFuelType(e.target.value)}
                    className="w-full h-9 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-xs text-[#ededed] focus:outline-none focus:border-[#d99b43] cursor-pointer"
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

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-[#a1a1a6] block">Km</label>
                  <input
                    type="number"
                    required
                    placeholder="104500"
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    className="w-full h-9 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-2.5 text-xs font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-[#a1a1a6] block">Litros</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="42.5"
                    value={liters}
                    onChange={(e) => setLiters(e.target.value)}
                    className="w-full h-9 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-2.5 text-xs font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-[#a1a1a6] block">Costo ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="45000"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    className="w-full h-9 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-2.5 text-xs font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between bg-[#141415] border border-[rgba(237,237,237,0.06)] rounded-lg px-3 py-2.5">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-[#ededed]">Tanque lleno</span>
                  <span className="text-xs text-[#85858b]">Mide el consumo entre llenados</span>
                </div>
                <input
                  type="checkbox"
                  checked={isFull}
                  onChange={(e) => setIsFull(e.target.checked)}
                  className="w-4 h-4 accent-[#d99b43] cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-[#d99b43] hover:bg-[#e3a852] text-[#141415] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {editingRecordId ? <Check className="w-4 h-4" strokeWidth={1.5} /> : <Plus className="w-4 h-4" strokeWidth={1.5} />}
                <span>{editingRecordId ? "Guardar cambios" : "Agregar carga"}</span>
              </button>
            </form>
          </div>

          <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl p-4 flex gap-3 text-xs text-[#a1a1a6]">
            <Info className="w-4 h-4 text-[#85858b] shrink-0 mt-0.5" strokeWidth={1.5} />
            <div className="space-y-0.5">
              <span className="font-medium text-[#ededed] block">Cálculo de consumo</span>
              <p className="leading-relaxed">
                Se calcula cuando registrás tanque lleno midiendo los km recorridos desde el llenado anterior del mismo vehículo.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Consumption Chart */}
        <div className="lg:col-span-7">
          {chartData.length > 0 ? (
            <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl p-5 h-full flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-medium text-[#ededed]">
                  Histórico de consumo y precio
                </h3>
                <span className="text-xs text-[#85858b]">Orden cronológico</span>
              </div>

              <div className="h-72 w-full text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: -16, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(237,237,237,0.06)" />
                    <XAxis dataKey="date" stroke="#85858b" tick={{ fill: "#85858b", fontSize: 11 }} />
                    <YAxis
                      yAxisId="left"
                      stroke="#d99b43"
                      domain={['auto', 'auto']}
                      tick={{ fill: "#85858b", fontSize: 11 }}
                      label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#d99b43', offset: 12, fontSize: 11 }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#a1a1a6"
                      domain={['auto', 'auto']}
                      tick={{ fill: "#85858b", fontSize: 11 }}
                      label={{ value: '$/L', angle: 90, position: 'insideRight', fill: '#a1a1a6', offset: 12, fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#19191b", borderColor: "rgba(237,237,237,0.12)", borderRadius: "8px", color: "#ededed", fontSize: "12px" }}
                    />
                    <Legend verticalAlign="top" height={32} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="Consumo"
                      name={`Consumo (${unit})`}
                      stroke="#d99b43"
                      activeDot={{ r: 5 }}
                      strokeWidth={2}
                      connectNulls
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="PrecioLitro"
                      name="Precio por litro ($/L)"
                      stroke="#a1a1a6"
                      strokeWidth={1.5}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl p-8 h-full flex flex-col items-center justify-center text-center text-[#85858b] text-sm space-y-2">
              <TrendingUp className="w-5 h-5" strokeWidth={1.5} />
              <p>El gráfico se genera al registrar cargas de combustible.</p>
            </div>
          )}
        </div>
      </div>

      {/* Historical Refills Table */}
      <div className="bg-[#19191b] rounded-xl border border-[rgba(237,237,237,0.08)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(237,237,237,0.08)] flex items-center justify-between">
          <h3 className="text-base font-medium text-[#ededed]">Historial de cargas</h3>
          <span className="text-xs font-mono text-[#85858b] tabular">
            {filteredRecords.length} registros
          </span>
        </div>

        {loading && records.length === 0 ? (
          <div className="py-12 text-center text-[#85858b] text-sm">Cargando datos...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-16 text-center text-[#85858b] text-sm space-y-2">
            <AlertCircle className="w-5 h-5 mx-auto" strokeWidth={1.5} />
            <p>No se encontraron cargas registradas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-sm text-[#a1a1a6] border-separate border-spacing-0">
              <thead className="text-xs text-[#85858b] sticky top-0 z-20">
                <tr>
                  <th className="px-4 py-3 bg-[#141415] border-b border-[rgba(237,237,237,0.08)] font-medium">Fecha</th>
                  <th className="px-4 py-3 bg-[#141415] border-b border-[rgba(237,237,237,0.08)] font-medium">Vehículo</th>
                  <th className="px-4 py-3 bg-[#141415] border-b border-[rgba(237,237,237,0.08)] font-medium text-right">Odo. (km)</th>
                  <th className="px-4 py-3 bg-[#141415] border-b border-[rgba(237,237,237,0.08)] font-medium text-right">Litros</th>
                  <th className="px-4 py-3 bg-[#141415] border-b border-[rgba(237,237,237,0.08)] font-medium text-right">Costo total</th>
                  <th className="px-4 py-3 bg-[#141415] border-b border-[rgba(237,237,237,0.08)] font-medium text-right">$/L</th>
                  <th className="px-4 py-3 bg-[#141415] border-b border-[rgba(237,237,237,0.08)] font-medium text-center">Tipo</th>
                  <th className="px-4 py-3 bg-[#141415] border-b border-[rgba(237,237,237,0.08)] font-medium text-right">Consumo</th>
                  <th className="px-4 py-3 bg-[#141415] border-b border-[rgba(237,237,237,0.08)] font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(237,237,237,0.06)]">
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
                        isBeingEdited ? "bg-[#232325]" : "hover:bg-[#232325]/50"
                      }`}
                    >
                      <td className="px-4 py-3 font-mono whitespace-nowrap text-xs text-[#85858b] tabular">
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
                              className="bg-[#232325] border border-[#d99b43]/40 text-[#d99b43] text-xs rounded px-2 py-1 focus:outline-none cursor-pointer"
                            >
                              <option value="" disabled>Asignar auto</option>
                              {vehicles.map(v => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-[#d99b43]">Sin asignar</span>
                          )
                        ) : (
                          <span className="text-[#ededed] font-medium">
                            {getVehicleName(rec.vehicleId)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-[#ededed] tabular">
                        {rec.odometer.toLocaleString("es-AR")}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-[#a1a1a6] tabular">
                        {rec.liters.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-[#ededed] tabular">
                        ${rec.cost.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-[#85858b] tabular">
                        ${rec.pricePerLiter.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap text-xs">
                        <span className="text-[#a1a1a6] mr-2">{rec.fuelType}</span>
                        <span className={rec.isFull ? "text-[#d99b43] font-mono" : "text-[#85858b] font-mono"}>
                          {rec.isFull ? "Lleno" : "Parcial"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs whitespace-nowrap tabular">
                        {rec.consumption ? (
                          <div className="flex flex-col items-end">
                            <span className="text-[#d99b43] font-medium">{rec.consumption.toFixed(2)} <span className="text-[#85858b]">{unit}</span></span>
                            {rec.distance && (
                              <span className="text-[#85858b]">
                                {rec.distance} km
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#85858b]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleStartEdit(rec)}
                            className="p-1.5 text-[#85858b] hover:text-[#ededed] hover:bg-[#232325] rounded-md transition-colors cursor-pointer"
                            title="Editar registro"
                          >
                            <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                          <button
                            onClick={() => handleDelete(rec.id)}
                            className="p-1.5 text-[#85858b] hover:text-[#e5484d] hover:bg-[#232325] rounded-md transition-colors cursor-pointer"
                            title="Eliminar registro"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
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
