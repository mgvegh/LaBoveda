"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, TrendingUp, TrendingDown, RefreshCw, Trash2, PieChart, Upload, FileUp, X, CheckCircle2 } from "lucide-react";
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from "recharts";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, getDocs, deleteDoc, doc, query, where, writeBatch,
} from "firebase/firestore";

type Purchase = {
  id: string;
  ticker: string;
  quantity: number;
  purchasePrice: number;
  date: string;
  currency: string;
  nroTicket?: string; // Cocos dedup key
  importId?: string;
};

type CsvImport = {
  id: string;
  filename: string;
  importedAt: string;
  periodStart: string;
  periodEnd: string;
  rowCount: number;
};

type TickerData = {
  price: number;
  previousClose: number;
  currency: string;
};

type ImportResult = {
  imported: number;
  skipped: number;
  errors: number;
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

// Removed getDaysSince

// Parse Spanish-format number: "52.575" → 52575, "157.725,50" → 157725.50
const parseSpanishNumber = (s: string): number => {
  if (!s) return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
};

// Parse DD-MM-YYYY → YYYY-MM-DD
const parseCocosDate = (s: string): string => {
  const parts = s.split("-");
  if (parts.length !== 3) return s;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

// Extract ticker from "CEDEAR SPDR S&P 500 (SPY)" → "SPY"
const extractTicker = (instrumento: string): string | null => {
  const match = instrumento.match(/\(([^)]+)\)$/);
  return match ? match[1].toUpperCase() : null;
};

const isCedearRow = (row: Record<string, string>): boolean => {
  const inst = (row["instrumento"] || "").toLowerCase();
  return inst.includes("cedear");
};

const parseCocosCSV = (text: string): Omit<Purchase, "id">[] => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(";").map(h => h.trim());
  const result: Omit<Purchase, "id">[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(";").map(v => v.trim());
    if (values.length < headers.length) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });

    if (!isCedearRow(row)) continue;

    const ticker = extractTicker(row["instrumento"]);
    if (!ticker) continue;

    // Cocos uses negative quantity for sales, we keep it as is
    const quantity = parseSpanishNumber(row["cantidad"]);
    const price = Math.abs(parseSpanishNumber(row["precio"]));
    const date = parseCocosDate(row["fechaEjecucion"]);
    const currency = (row["moneda"] || "ARS").toUpperCase();
    const nroTicket = row["nroTicket"];

    if (quantity === 0) continue;

    result.push({
      ticker: ticker + ".BA",
      quantity,
      purchasePrice: price,
      date,
      currency,
      nroTicket,
    });
  }

  return result;
};

export default function CedearsTracker() {
  const [isClient, setIsClient] = useState(false);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [csvImports, setCsvImports] = useState<CsvImport[]>([]);
  const [marketData, setMarketData] = useState<Record<string, TickerData>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [tickerInput, setTickerInput] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [dateInput, setDateInput] = useState(new Date().toISOString().split("T")[0]);
  const [operationType, setOperationType] = useState<"compra" | "venta">("compra");

  const [usdUala, setUsdUala] = useState<number>(1420); // Default to a recent realistic rate

  const { user } = useAuth();

  const colRef = user ? collection(db, "users", user.uid, "cedears_purchases") : null;

  useEffect(() => {
    setIsClient(true);
    if (!user || !colRef) return;
    const fetchPurchases = async () => {
      const snap = await getDocs(colRef);
      setPurchases(snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<Purchase, "id">),
      })));
    };
    const fetchImports = async () => {
      const importsSnap = await getDocs(collection(db, "users", user.uid, "cedears_csv_imports"));
      setCsvImports(importsSnap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<CsvImport, "id">),
      })));
    };
    fetchPurchases();
    fetchImports();

    const fetchUalaRate = async () => {
      try {
        const res = await fetch("/api/dolar/uala");
        if (res.ok) {
          const data = await res.json();
          if (data.compra) {
            setUsdUala(Math.round(data.compra));
            return;
          }
        }
        // Fallback to Dolar MEP if Uala scraper fails
        const fallbackRes = await fetch("https://dolarapi.com/v1/dolares/mep");
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          if (fallbackData.venta) {
            setUsdUala(fallbackData.venta);
          }
        }
      } catch (err) {
        console.error("Error fetching Uala rate:", err);
      }
    };
    fetchUalaRate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const positions = useMemo(() => {
    const posMap: Record<string, { totalQty: number; totalCost: number }> = {};
    
    // Sort by date to calculate PPC correctly if there are many buys/sells
    const sorted = [...purchases].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sorted.forEach(p => {
      const t = p.ticker.toUpperCase();
      if (!posMap[t]) posMap[t] = { totalQty: 0, totalCost: 0 };
      
      const isUsd = p.currency === "USD" || p.currency === "EXT" || p.currency === "MEP";
      let actualPrice = p.purchasePrice;
      
      if (isUsd) {
        // Historical rates matching exact dates in Cocos CSV
        if (p.date === "2025-11-28" || p.date === "2024-11-28") {
          actualPrice = p.purchasePrice * 1482;
        } 
        else if (p.date === "2026-01-28" || p.date === "2026-01-29") {
          actualPrice = p.purchasePrice * 1472;
        } else {
          actualPrice = p.purchasePrice * usdUala;
        }
      }

      if (p.quantity > 0) {
        // PURCHASE: Increases quantity and total cost
        const cost = p.quantity * actualPrice;
        posMap[t].totalQty += p.quantity;
        posMap[t].totalCost += cost;
      } else {
        // SALE: Decreases quantity, reduces total cost proportionally (keeping PPC constant)
        const qtyToSubtract = Math.abs(p.quantity);
        if (posMap[t].totalQty > 0) {
          const currentPPC = posMap[t].totalCost / posMap[t].totalQty;
          posMap[t].totalQty -= qtyToSubtract;
          posMap[t].totalCost = Math.max(0, posMap[t].totalQty * currentPPC);
        } else {
          posMap[t].totalQty -= qtyToSubtract;
        }
      }
    });

    return Object.entries(posMap)
      .filter(([_, data]) => Math.abs(data.totalQty) > 0.001) // Standard threshold for Cedears
      .map(([ticker, data]) => {
        const avgPriceARS = data.totalQty > 0 ? data.totalCost / data.totalQty : 0;
        const avgPriceUSD = usdUala > 0 ? avgPriceARS / usdUala : 0;
        
        const rawPrice = marketData[ticker]?.price || 0;
        
        const currentPriceARS = rawPrice;
        const currentPriceUSD = usdUala > 0 ? rawPrice / usdUala : 0;
        
        const currentValueARS = currentPriceARS * data.totalQty;
        const currentValueUSD = currentPriceUSD * data.totalQty;
        
        const pnlValueARS = currentValueARS - data.totalCost;
        const pnlPercent = data.totalCost > 0 && currentPriceARS > 0 ? (pnlValueARS / data.totalCost) * 100 : 0;
        
        return { 
          ticker, 
          totalQty: data.totalQty, 
          invested: data.totalCost, 
          avgPrice: avgPriceARS, 
          avgPriceUSD,
          currentPrice: currentPriceARS, 
          currentPriceUSD,
          currentValue: currentValueARS, 
          currentValueUSD,
          pnlValue: pnlValueARS, 
          pnlPercent, 
          hasData: rawPrice > 0 
        };
      })
      .sort((a, b) => b.invested - a.invested);
  }, [purchases, marketData, usdUala]);

  const globalStats = useMemo(() => {
    let totalInvested = 0, totalValue = 0;
    positions.forEach(p => { 
      totalInvested += p.invested; 
      totalValue += p.hasData ? p.currentValue : p.invested; 
    });
    const pnl = totalValue - totalInvested;
    const pnlPercent = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

    const totalInvestedUSD = usdUala > 0 ? totalInvested / usdUala : 0;
    const totalValueUSD = usdUala > 0 ? totalValue / usdUala : 0;
    const pnlUSD = totalValueUSD - totalInvestedUSD;

    return { 
      totalInvested, 
      totalValue, 
      pnl, 
      pnlPercent,
      totalInvestedUSD,
      totalValueUSD,
      pnlUSD
    };
  }, [positions, usdUala]);

  const refreshMarketData = async () => {
    if (purchases.length === 0) return;
    setIsLoading(true);
    const uniqueTickers = [...new Set(purchases.map(p => p.ticker.toUpperCase()))];
    const newData: Record<string, TickerData> = { ...marketData };
    await Promise.all(uniqueTickers.map(async (t) => {
      try {
        const res = await fetch(`/api/yahoo?ticker=${t}`);
        if (res.ok) { 
          const data = await res.json(); 
          newData[t] = { 
            price: data.price, 
            previousClose: data.previousClose, 
            currency: data.currency 
          }; 
        }
      } catch { console.error("Failed to fetch", t); }
    }));
    setMarketData(newData);
    setIsLoading(false);
  };

  useEffect(() => {
    if (purchases.length > 0 && isClient) refreshMarketData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient, purchases.length]);

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tickerInput || !qtyInput || !priceInput || !user || !colRef) return;
    let t = tickerInput.toUpperCase().trim();
    
    if (!t.includes(".")) {
      t = t + ".BA";
    }

    const qty = parseFloat(qtyInput);
    const signedQty = operationType === "compra" ? qty : -qty;

    const newRow = { 
      ticker: t, 
      quantity: signedQty, 
      purchasePrice: parseFloat(priceInput), 
      date: dateInput || new Date().toISOString().split("T")[0], 
      currency: "ARS" 
    };
    const docRef = await addDoc(colRef, newRow);
    setPurchases(prev => [...prev, { id: docRef.id, ...newRow }]);
    setTickerInput(""); 
    setQtyInput(""); 
    setPriceInput(""); 
    setDateInput(new Date().toISOString().split("T")[0]);
    setOperationType("compra");
  };

  const removePurchase = async (id: string) => {
    if (!user || !colRef) return;
    await deleteDoc(doc(db, "users", user.uid, "cedears_purchases", id));
    setPurchases(prev => prev.filter(p => p.id !== id));
  };

  const handleCSVFiles = async (files: FileList) => {
    if (!user || !colRef) return;
    setIsImporting(true);
    setImportResult(null);

    // Existing nroTickets for dedup
    const existingTickets = new Set(purchases.map(p => p.nroTicket).filter(Boolean));

    let imported = 0, skipped = 0, errors = 0;
    const newPurchases: Purchase[] = [];
    const newImports: CsvImport[] = [];
    const batch = writeBatch(db);
    const importsColRef = collection(db, "users", user.uid, "cedears_csv_imports");

    try {
      for (const file of Array.from(files)) {
        const text = await file.text();
        const rows = parseCocosCSV(text);
        
        let minDate = "";
        let maxDate = "";
        let rowCount = 0;
        
        const importDocRef = doc(importsColRef);
        const importId = importDocRef.id;

        for (const row of rows) {
          if (row.nroTicket && existingTickets.has(row.nroTicket)) { skipped++; continue; }
          
          if (row.date < "2025-02-01") { skipped++; continue; }

          if (!minDate || row.date < minDate) minDate = row.date;
          if (!maxDate || row.date > maxDate) maxDate = row.date;
          rowCount++;

          const docRef = doc(colRef);
          const purchaseData = { ...row, importId };
          batch.set(docRef, purchaseData);
          newPurchases.push({ id: docRef.id, ...purchaseData } as Purchase);
          if (row.nroTicket) existingTickets.add(row.nroTicket);
          imported++;
        }
        
        if (rowCount > 0) {
          const importRecord = {
            filename: file.name,
            importedAt: new Date().toISOString(),
            periodStart: minDate,
            periodEnd: maxDate,
            rowCount
          };
          batch.set(importDocRef, importRecord);
          newImports.push({ id: importId, ...importRecord });
        }
      }

      if (imported > 0 || newImports.length > 0) {
        await batch.commit();
        setPurchases(prev => [...prev, ...newPurchases]);
        setCsvImports(prev => [...prev, ...newImports]);
      }
      setImportResult({ imported, skipped, errors });
    } catch (err: any) {
      console.error("Error al importar:", err);
      alert("Error al guardar en Firebase. Revisá las reglas de seguridad de Firestore.");
      setImportResult({ imported: 0, skipped: 0, errors: 1 });
    } finally {
      setIsImporting(false);
    }
  };

  const removeCsvImport = async (importId: string) => {
    if (!user || !colRef) return;
    const confirmDelete = window.confirm("¿Estás seguro de eliminar este archivo? Se borrarán todos sus movimientos.");
    if (!confirmDelete) return;

    try {
      const batch = writeBatch(db);
      
      const importRef = doc(db, "users", user.uid, "cedears_csv_imports", importId);
      batch.delete(importRef);

      const q = query(colRef, where("importId", "==", importId));
      const snap = await getDocs(q);
      snap.forEach(d => {
        batch.delete(d.ref);
      });

      await batch.commit();

      setCsvImports(prev => prev.filter(i => i.id !== importId));
      setPurchases(prev => prev.filter(p => p.importId !== importId));
    } catch (err) {
      console.error("Error eliminando importación:", err);
      alert("Error al eliminar los archivos.");
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleCSVFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleCSVFiles(e.dataTransfer.files);
  };

  if (!isClient) return null;

  return (
    <div className="space-y-6">
      {/* ROW 1: Premium Stats Grid (3 cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Valor Total ARS */}
        <div className="glass-panel p-6 rounded-2xl border-blue-500/20 shadow-lg shadow-blue-500/5 relative overflow-hidden group hover:border-blue-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-all pointer-events-none" />
          <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Valor Total (ARS)</div>
          <div className="text-2xl font-black text-white mb-2">
            ${globalStats.totalValue.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
          <div className={clsx("flex items-center gap-1.5 text-xs font-semibold", globalStats.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
            {globalStats.pnl >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            <span>${Math.abs(globalStats.pnl).toLocaleString('es-AR', { maximumFractionDigits: 0 })} ({globalStats.pnlPercent.toFixed(2)}%)</span>
          </div>
        </div>

        {/* Capital Invertido ARS */}
        <div className="glass-panel p-6 rounded-2xl border-white/5 relative overflow-hidden group hover:border-white/10 transition-all">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Capital Invertido (ARS)</div>
          <div className="text-2xl font-bold text-gray-200 mb-1">
            ${globalStats.totalInvested.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] text-gray-500 font-medium">Historial acumulado en pesos</div>
        </div>

        {/* Tenencia Total USD (Sin rendimiento, solo actual) */}
        <div className="glass-panel p-6 rounded-2xl border-emerald-500/20 shadow-lg shadow-emerald-500/5 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all pointer-events-none" />
          <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">Tenencia Total (USD)</div>
          <div className="text-2xl font-black text-white mb-2">
            ${globalStats.totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-gray-500 font-medium flex items-center gap-1">
            <span>TC Ualá:</span>
            <span className="font-bold text-blue-400">${usdUala} ARS</span>
          </div>
        </div>
      </div>

      {/* ROW 2: Horizontal "Registrar Operación Manual" Form */}
      <div className={clsx(
        "glass-panel p-6 rounded-2xl transition-all duration-300",
        operationType === "compra" ? "border-blue-500/10" : "border-rose-500/10"
      )}>
        <h2 className={clsx(
          "text-lg font-bold mb-4 flex items-center gap-2 transition-colors duration-300",
          operationType === "compra" ? "text-blue-400" : "text-rose-400"
        )}>
          {operationType === "compra" ? <Plus className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />} Registrar Operación Manual
        </h2>
        <form onSubmit={handleAddPurchase} className="flex flex-wrap lg:flex-nowrap items-end gap-4 w-full">
          {/* Tipo de Operación */}
          <div className="w-full sm:w-auto flex-1 min-w-[120px]">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 tracking-wide uppercase">Tipo</label>
            <select
              value={operationType}
              onChange={e => setOperationType(e.target.value as "compra" | "venta")}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
            >
              <option value="compra" className="bg-[#09090b]">Compra</option>
              <option value="venta" className="bg-[#09090b]">Venta</option>
            </select>
          </div>

          {/* Ticker */}
          <div className="w-full sm:w-auto flex-1 min-w-[120px]">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 tracking-wide uppercase">Ticker</label>
            <input
              type="text"
              required
              placeholder="AAPL"
              value={tickerInput}
              onChange={e => setTickerInput(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 uppercase transition-colors"
            />
          </div>

          {/* Cantidad */}
          <div className="w-full sm:w-auto flex-1 min-w-[120px]">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 tracking-wide uppercase">Cantidad</label>
            <input
              type="number"
              required
              step="0.01"
              min="0.0001"
              placeholder="2"
              value={qtyInput}
              onChange={e => setQtyInput(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Precio ARS */}
          <div className="w-full sm:w-auto flex-1 min-w-[150px]">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 tracking-wide uppercase">
              Precio (ARS)
            </label>
            <input
              type="number"
              step="0.01"
              required
              min="0"
              placeholder="50000"
              value={priceInput}
              onChange={e => setPriceInput(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Fecha */}
          <div className="w-full sm:w-auto flex-1 min-w-[150px]">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5 tracking-wide uppercase">Fecha</label>
            <input
              type="date"
              required
              value={dateInput}
              onChange={e => setDateInput(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
            />
          </div>

          {/* Submit Button */}
          <div className="w-full lg:w-auto shrink-0">
            <button
              type="submit"
              className={clsx(
                "w-full lg:w-auto text-white font-bold py-2.5 px-6 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95",
                operationType === "compra" 
                  ? "bg-blue-600 hover:bg-blue-500 shadow-blue-500/20" 
                  : "bg-rose-600 hover:bg-rose-500 shadow-rose-500/20"
              )}
            >
              {operationType === "compra" ? <Plus className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {operationType === "compra" ? "Registrar Compra" : "Registrar Venta"}
            </button>
          </div>
        </form>
      </div>

      {/* ROW 3: Mis Posiciones & Unified Chart Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Positions Table */}
        <div className="glass-panel p-6 rounded-2xl lg:col-span-2 border-blue-500/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-400" /> Mis Posiciones
              </h2>
              <button 
                onClick={refreshMarketData} 
                disabled={isLoading} 
                className="p-2 text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin")} />
                <span className="hidden sm:inline font-semibold">Actualizar Precios</span>
              </button>
            </div>
            
            {positions.length === 0 ? (
              <div className="text-center py-12 text-gray-500 flex flex-col items-center gap-3">
                <Upload className="w-8 h-8 text-gray-600" />
                <div className="text-sm">Importá tu CSV de Cocos o añadí una compra manualmente en la sección de arriba.</div>
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
                      <th className="pb-3 px-2 font-semibold">Activo</th>
                      <th className="pb-3 px-2 font-semibold text-right">Cant.</th>
                      <th className="pb-3 px-2 font-semibold text-right hidden lg:table-cell">PPC</th>
                      <th className="pb-3 px-2 font-semibold text-right">Precio Actual</th>
                      <th className="pb-3 px-2 font-semibold text-right">Tenencia</th>
                      <th className="pb-3 px-2 font-semibold text-right">Resultados (PnL)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {positions.map(p => {
                      const valueToUse = p.hasData ? p.currentValue : p.invested;
                      const percentOfPortfolio = globalStats.totalValue > 0 ? (valueToUse / globalStats.totalValue) * 100 : 0;
                      return (
                        <tr key={p.ticker} className="hover:bg-white/5 transition-colors group">
                          {/* Activo */}
                          <td className="py-3 px-2">
                            <span className="font-bold text-gray-200">{p.ticker.replace('.BA', '')}</span>
                            <div className="text-xs text-gray-500 lg:hidden mt-0.5">
                              ${p.avgPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })} avg
                            </div>
                          </td>
                          {/* Cant. */}
                          <td className="py-3 px-2 text-right text-gray-300 font-medium">
                            {p.totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          {/* PPC (ARS Only) */}
                          <td className="py-3 px-2 text-right text-gray-400 hidden lg:table-cell">
                            <div className="font-medium text-gray-200">
                              ${p.avgPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })} <span className="text-[9px] text-gray-500 font-bold uppercase">ARS</span>
                            </div>
                          </td>
                          {/* Precio Actual */}
                          <td className="py-3 px-2 text-right">
                            {p.hasData ? (
                              <div>
                                <div className="font-semibold text-blue-100">
                                  ${p.currentPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })} <span className="text-[9px] text-gray-500 font-bold uppercase">ARS</span>
                                </div>
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                  ${p.currentPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-500 text-xs">Cargando...</span>
                            )}
                          </td>
                          {/* Tenencia */}
                          <td className="py-3 px-2 text-right">
                            <div className="font-bold text-gray-200">{percentOfPortfolio.toFixed(1)}%</div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              ${valueToUse.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS
                            </div>
                            <div className="text-[9px] text-gray-600">
                              ${(valueToUse / usdUala).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USD
                            </div>
                          </td>
                          {/* PnL */}
                          <td className="py-3 px-2 text-right">
                            {p.hasData && (
                              <div className={clsx("flex flex-col items-end", p.pnlValue >= 0 ? "text-emerald-400" : "text-red-400")}>
                                <span className="font-bold text-sm">
                                  {p.pnlValue > 0 ? "+" : ""}{p.pnlPercent.toFixed(2)}%
                                </span>
                                <div className="text-[10px] mt-0.5">
                                  ${p.pnlValue > 0 ? "+" : ""}{p.pnlValue.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS
                                </div>
                                <div className="text-[9px] opacity-75">
                                  ${p.pnlValue > 0 ? "+" : ""}{(p.pnlValue / usdUala).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Individual Purchases History inside table card */}
          {purchases.length > 0 && (
            <div className="mt-8 pt-6 border-t border-white/10">
              <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">Historial de Operaciones</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                {[...purchases].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => {
                  const cleanTicker = p.ticker.replace('.BA', '');
                  return (
                    <div key={p.id} className="grid grid-cols-5 items-center text-xs bg-black/20 p-3 rounded-xl border border-white/5 hover:bg-white/5 transition-colors group">
                      <div className="text-gray-400">{new Date(p.date).toLocaleDateString('es-AR')}</div>
                      <span className={clsx("font-bold transition-colors", p.quantity > 0 ? "text-blue-300" : "text-rose-300")}>{cleanTicker}</span>
                      <div className={clsx("text-center font-mono font-bold", p.quantity > 0 ? "text-emerald-400" : "text-rose-400")}>
                        {p.quantity > 0 ? "+" : ""}{p.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-gray-400 text-right">
                        <span>${p.purchasePrice.toLocaleString()}</span>
                        <span className="text-[9px] ml-1 opacity-70 font-semibold font-mono">{p.currency}</span>
                      </div>
                      <div className="flex justify-end items-center gap-2">
                        {p.nroTicket && <span className="bg-white/10 text-gray-400 px-1.5 py-0.5 rounded text-[10px] hidden sm:block">CSV</span>}
                        <button 
                          onClick={() => removePurchase(p.id)} 
                          className="text-gray-500 hover:text-red-400 transition-colors p-1 opacity-0 sm:opacity-100 lg:opacity-0 lg:group-hover:opacity-100" 
                          title="Eliminar registro"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Holdings Pie Chart Card - Compact layout */}
        <div className="glass-panel p-6 rounded-2xl lg:col-span-1 border-blue-500/10 flex flex-col h-full">
          <div>
            <h2 className="text-lg font-bold text-gray-100 mb-1 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-blue-400" /> Distribución
            </h2>
            <div className="text-[11px] text-gray-500 mb-2">Porcentaje de tenencia actual</div>
          </div>
          
          {positions.length > 0 ? (
            <div className="flex flex-col items-center gap-2">
              {/* Graphic container */}
              <div className="h-[270px] w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Pie 
                      data={positions} 
                      dataKey="currentValue" 
                      innerRadius={70} 
                      outerRadius={100} 
                      paddingAngle={3}
                      cx="50%"
                      cy="50%"
                    >
                      {positions.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0)" />
                      ))}
                    </Pie>
                    <ReTooltip 
                      formatter={(val: unknown) => `$${Number(val).toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS`} 
                      contentStyle={{ backgroundColor: "rgba(0,0,0,0.9)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff" }}
                    />
                  </RePieChart>
                </ResponsiveContainer>
                
                {/* Sleek center donut label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[9px] text-gray-400 font-semibold tracking-wider uppercase">Cartera Total</span>
                  <span className="text-lg font-black text-white mt-0.5">
                    ${globalStats.totalValue.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-[9px] text-emerald-400 font-bold mt-0.5">
                    USD ${(globalStats.totalValueUSD).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
              
              {/* Legend showing all items (no max-height/scroll) */}
              <div className="w-full space-y-1.5 mt-2">
                {positions.map((p, i) => {
                  const percent = globalStats.totalValue > 0 ? (p.currentValue / globalStats.totalValue) * 100 : 0;
                  return (
                    <div key={p.ticker} className="flex items-center justify-between text-xs text-gray-300 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="font-bold">{p.ticker.replace('.BA', '')}</span>
                      </div>
                      <div className="text-right font-bold text-gray-200">
                        {percent.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 gap-2 py-8 flex flex-col items-center justify-center">
              <PieChart className="w-8 h-8 text-gray-600 animate-pulse" />
              <span className="text-sm">Sin posiciones activas</span>
            </div>
          )}
        </div>
      </div>

      {/* ROW 4: Cocos CSV Import Zone & CSV Imports List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div
            className={clsx(
              "relative border-2 border-dashed rounded-2xl p-6 transition-all cursor-pointer h-full flex items-center justify-center min-h-[120px]", 
              isDragging ? "border-blue-400 bg-blue-500/10" : "border-white/10 hover:border-blue-500/40 hover:bg-white/5"
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".csv" multiple className="hidden" onChange={onFileChange} />
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
              <div className={clsx("p-3 rounded-xl shrink-0", isDragging ? "bg-blue-500/20" : "bg-blue-500/10")}>
                {isImporting ? <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" /> : <FileUp className="w-6 h-6 text-blue-400" />}
              </div>
              <div className="text-center sm:text-left flex-1 min-w-0">
                <div className="font-bold text-gray-200">
                  {isImporting ? "Importando archivo(s)..." : "Importar CSV de Cocos"}
                </div>
                <div className="text-xs text-gray-500 mt-1 truncate">
                  Arrastrá o haz clic para subir múltiples archivos. Se omiten operaciones anteriores a Febrero 2025.
                </div>
              </div>
              {importResult && !isImporting && (
                <div className="flex items-center gap-2.5 text-xs shrink-0 bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                  <div className="flex items-center gap-1 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{importResult.imported} importados</span>
                  </div>
                  {importResult.skipped > 0 && (
                    <span className="text-gray-400 font-medium font-mono">{importResult.skipped} omitidos</span>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); setImportResult(null); }} 
                    className="text-gray-500 hover:text-gray-300 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          {/* List of imported files */}
          <div className="glass-panel p-5 rounded-2xl border-white/5 h-full max-h-[140px] lg:max-h-full overflow-y-auto custom-scrollbar">
            <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Archivos CSV Importados ({csvImports.length})</h3>
            {csvImports.length > 0 ? (
              <div className="space-y-2">
                {[...csvImports].sort((a,b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()).map(imp => (
                  <div key={imp.id} className="bg-black/30 border border-white/5 rounded-xl p-2.5 flex justify-between items-center group text-xs hover:bg-white/5 transition-colors">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-bold text-blue-300 truncate" title={imp.filename}>
                        {imp.filename}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {new Date(imp.periodStart).toLocaleDateString('es-AR')} - {new Date(imp.periodEnd).toLocaleDateString('es-AR')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-lg font-bold font-mono">
                        {imp.rowCount}
                      </span>
                      <button 
                        onClick={() => removeCsvImport(imp.id)} 
                        className="text-gray-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        title="Eliminar importación"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 text-center py-6">No hay archivos CSV registrados</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
