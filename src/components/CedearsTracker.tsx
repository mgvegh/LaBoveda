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

const COLORS = ['#d99b43', '#a1a1a6', '#71717a', '#52525b', '#3f3f46', '#d4d4d8', '#27272a'];

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
      {/* ROW 1: Stats Grid (3 cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl space-y-2">
          <div className="text-xs text-[#85858b]">Valor total (ARS)</div>
          <div className="text-2xl sm:text-3xl font-mono font-medium text-[#ededed] tabular">
            ${globalStats.totalValue.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
          <div className={clsx("flex items-center gap-1.5 text-xs font-mono tabular", globalStats.pnl >= 0 ? "text-[#4cc38a]" : "text-[#e5484d]")}>
            {globalStats.pnl >= 0 ? <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.5} /> : <TrendingDown className="w-3.5 h-3.5" strokeWidth={1.5} />}
            <span>${Math.abs(globalStats.pnl).toLocaleString('es-AR', { maximumFractionDigits: 0 })} ({globalStats.pnlPercent.toFixed(2)}%)</span>
          </div>
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl space-y-2">
          <div className="text-xs text-[#85858b]">Capital invertido (ARS)</div>
          <div className="text-2xl sm:text-3xl font-mono font-medium text-[#ededed] tabular">
            ${globalStats.totalInvested.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-xs text-[#85858b]">Historial acumulado en pesos</div>
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl space-y-2">
          <div className="text-xs text-[#85858b]">Tenencia total (USD)</div>
          <div className="text-2xl sm:text-3xl font-mono font-medium text-[#ededed] tabular">
            ${globalStats.totalValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-[#85858b] font-mono tabular flex items-center gap-1.5">
            <span>TC Ualá</span>
            <span className="text-[#d99b43]">${usdUala} ARS</span>
          </div>
        </div>
      </div>

      {/* ROW 2: Registrar Operación Manual */}
      <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl space-y-4">
        <h2 className="text-base font-medium text-[#ededed] flex items-center gap-2">
          {operationType === "compra" ? <Plus className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} /> : <TrendingDown className="w-4 h-4 text-[#e5484d]" strokeWidth={1.5} />}
          Registrar operación manual
        </h2>
        <form onSubmit={handleAddPurchase} className="flex flex-wrap lg:flex-nowrap items-end gap-3 w-full">
          <div className="w-full sm:w-auto flex-1 min-w-[120px] space-y-1.5">
            <label className="block text-xs text-[#a1a1a6]">Tipo</label>
            <select
              value={operationType}
              onChange={e => setOperationType(e.target.value as "compra" | "venta")}
              className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm text-[#ededed] focus:outline-none focus:border-[#d99b43] transition-colors cursor-pointer"
            >
              <option value="compra">Compra</option>
              <option value="venta">Venta</option>
            </select>
          </div>

          <div className="w-full sm:w-auto flex-1 min-w-[120px] space-y-1.5">
            <label className="block text-xs text-[#a1a1a6]">Ticker</label>
            <input
              type="text"
              required
              placeholder="AAPL"
              value={tickerInput}
              onChange={e => setTickerInput(e.target.value)}
              className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm text-[#ededed] focus:outline-none focus:border-[#d99b43] uppercase transition-colors"
            />
          </div>

          <div className="w-full sm:w-auto flex-1 min-w-[120px] space-y-1.5">
            <label className="block text-xs text-[#a1a1a6]">Cantidad</label>
            <input
              type="number"
              required
              step="any"
              min="0.0001"
              placeholder="2"
              value={qtyInput}
              onChange={e => setQtyInput(e.target.value)}
              className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43] transition-colors"
            />
          </div>

          <div className="w-full sm:w-auto flex-1 min-w-[140px] space-y-1.5">
            <label className="block text-xs text-[#a1a1a6]">Precio (ARS)</label>
            <input
              type="number"
              step="any"
              required
              min="0"
              placeholder="50000"
              value={priceInput}
              onChange={e => setPriceInput(e.target.value)}
              className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43] transition-colors"
            />
          </div>

          <div className="w-full sm:w-auto flex-1 min-w-[140px] space-y-1.5">
            <label className="block text-xs text-[#a1a1a6]">Fecha</label>
            <input
              type="date"
              required
              value={dateInput}
              onChange={e => setDateInput(e.target.value)}
              className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43] transition-colors cursor-pointer"
            />
          </div>

          <div className="w-full lg:w-auto shrink-0">
            <button
              type="submit"
              className={clsx(
                "w-full lg:w-auto h-10 font-medium text-sm px-5 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer",
                operationType === "compra"
                  ? "bg-[#d99b43] hover:bg-[#e3a852] text-[#141415]"
                  : "bg-[#e5484d] hover:bg-[#eb5e63] text-[#ededed]"
              )}
            >
              {operationType === "compra" ? <Plus className="w-4 h-4" strokeWidth={1.5} /> : <TrendingDown className="w-4 h-4" strokeWidth={1.5} />}
              {operationType === "compra" ? "Registrar compra" : "Registrar venta"}
            </button>
          </div>
        </form>
      </div>

      {/* ROW 3: Mis Posiciones & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl lg:col-span-2 flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium text-[#ededed]">Mis posiciones</h2>
              <button
                onClick={refreshMarketData}
                disabled={isLoading}
                className="h-9 px-3 text-[#a1a1a6] hover:text-[#ededed] bg-[#232325] hover:bg-[#2c2c2f] border border-[rgba(237,237,237,0.08)] rounded-lg transition-colors flex items-center gap-2 text-xs font-medium disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={clsx("w-3.5 h-3.5", isLoading && "animate-spin")} strokeWidth={1.5} />
                <span className="hidden sm:inline">Actualizar precios</span>
              </button>
            </div>

            {positions.length === 0 ? (
              <div className="text-center py-12 text-[#85858b] flex flex-col items-center gap-2">
                <Upload className="w-5 h-5" strokeWidth={1.5} />
                <div className="text-sm">Importá tu CSV de Cocos o registrá una compra arriba.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-[rgba(237,237,237,0.08)] text-[#85858b] text-xs">
                      <th className="pb-3 px-2 font-medium">Activo</th>
                      <th className="pb-3 px-2 font-medium text-right">Cant.</th>
                      <th className="pb-3 px-2 font-medium text-right hidden lg:table-cell">PPC</th>
                      <th className="pb-3 px-2 font-medium text-right">Precio actual</th>
                      <th className="pb-3 px-2 font-medium text-right">Tenencia</th>
                      <th className="pb-3 px-2 font-medium text-right">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(237,237,237,0.06)]">
                    {positions.map(p => {
                      const valueToUse = p.hasData ? p.currentValue : p.invested;
                      const percentOfPortfolio = globalStats.totalValue > 0 ? (valueToUse / globalStats.totalValue) * 100 : 0;
                      return (
                        <tr key={p.ticker} className="hover:bg-[#232325]/50 transition-colors">
                          <td className="py-3 px-2">
                            <span className="font-medium text-sm text-[#ededed]">{p.ticker.replace('.BA', '')}</span>
                            <div className="text-xs font-mono text-[#85858b] lg:hidden mt-0.5 tabular">
                              ${p.avgPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })} prom.
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right font-mono text-sm text-[#a1a1a6] tabular">
                            {p.totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-2 text-right font-mono text-sm text-[#85858b] hidden lg:table-cell tabular">
                            ${p.avgPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })} <span className="text-xs">ARS</span>
                          </td>
                          <td className="py-3 px-2 text-right font-mono tabular">
                            {p.hasData ? (
                              <div>
                                <div className="text-sm text-[#ededed]">
                                  ${p.currentPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })} <span className="text-xs text-[#85858b]">ARS</span>
                                </div>
                                <div className="text-xs text-[#85858b] mt-0.5">
                                  ${p.currentPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                </div>
                              </div>
                            ) : (
                              <span className="text-[#85858b] text-xs">Cargando...</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right font-mono tabular">
                            <div className="text-sm font-medium text-[#ededed]">{percentOfPortfolio.toFixed(1)}%</div>
                            <div className="text-xs text-[#85858b] mt-0.5">
                              ${valueToUse.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS
                            </div>
                            <div className="text-xs text-[#85858b]">
                              ${(valueToUse / usdUala).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USD
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right font-mono tabular">
                            {p.hasData && (
                              <div className={clsx("flex flex-col items-end", p.pnlValue >= 0 ? "text-[#4cc38a]" : "text-[#e5484d]")}>
                                <span className="text-sm font-medium">
                                  {p.pnlValue > 0 ? "+" : ""}{p.pnlPercent.toFixed(2)}%
                                </span>
                                <div className="text-xs mt-0.5 opacity-85">
                                  {p.pnlValue > 0 ? "+" : ""}${Math.abs(p.pnlValue).toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS
                                </div>
                                <div className="text-xs opacity-75">
                                  {p.pnlValue > 0 ? "+" : ""}${(Math.abs(p.pnlValue) / usdUala).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
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

          {purchases.length > 0 && (
            <div className="pt-6 border-t border-[rgba(237,237,237,0.08)] space-y-3">
              <h3 className="text-xs font-medium text-[#85858b]">Historial de operaciones</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {[...purchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => {
                  const cleanTicker = p.ticker.replace('.BA', '');
                  return (
                    <div key={p.id} className="grid grid-cols-12 gap-2 items-center text-xs bg-[#141415] px-3 py-2.5 rounded-lg border border-[rgba(237,237,237,0.06)] hover:bg-[#232325]/50 transition-colors">
                      <div className="col-span-3 font-mono text-[#85858b] truncate tabular">{new Date(p.date).toLocaleDateString('es-AR')}</div>
                      <span className="col-span-2 font-medium text-[#ededed] truncate">{cleanTicker}</span>
                      <div className={clsx("col-span-3 text-right font-mono tabular truncate", p.quantity > 0 ? "text-[#4cc38a]" : "text-[#e5484d]")}>
                        {p.quantity > 0 ? "+" : ""}{p.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                      <div className="col-span-3 text-right font-mono text-[#a1a1a6] truncate tabular">
                        ${p.purchasePrice.toLocaleString('es-AR')} {p.currency}
                      </div>
                      <div className="col-span-1 flex justify-end items-center gap-1.5">
                        {p.nroTicket && <span className="text-[#85858b] font-mono text-[10px] hidden md:block">CSV</span>}
                        <button
                          onClick={() => removePurchase(p.id)}
                          className="text-[#85858b] hover:text-[#e5484d] transition-colors p-1 cursor-pointer"
                          title="Eliminar registro"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Holdings Pie Chart Card */}
        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl lg:col-span-1 flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-base font-medium text-[#ededed]">Distribución</h2>
            <div className="text-xs text-[#85858b] mt-0.5">Participación actual por activo</div>
          </div>

          {positions.length > 0 ? (
            <div className="flex flex-col items-center gap-4">
              <div className="h-[240px] w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Pie
                      data={positions}
                      dataKey="currentValue"
                      innerRadius={66}
                      outerRadius={94}
                      paddingAngle={2}
                      cx="50%"
                      cy="50%"
                    >
                      {positions.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0)" />
                      ))}
                    </Pie>
                    <ReTooltip
                      formatter={(val: unknown) => `$${Number(val).toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS`}
                      contentStyle={{ backgroundColor: "#19191b", borderColor: "rgba(237,237,237,0.12)", borderRadius: "8px", color: "#ededed", fontSize: "12px" }}
                    />
                  </RePieChart>
                </ResponsiveContainer>

                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none font-mono tabular">
                  <span className="text-xs text-[#85858b]">Total</span>
                  <span className="text-base font-medium text-[#ededed] mt-0.5">
                    ${globalStats.totalValue.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-xs text-[#a1a1a6] mt-0.5">
                    USD ${(globalStats.totalValueUSD).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              <div className="w-full space-y-1.5">
                {positions.map((p, i) => {
                  const percent = globalStats.totalValue > 0 ? (p.currentValue / globalStats.totalValue) * 100 : 0;
                  return (
                    <div key={p.ticker} className="flex items-center justify-between text-xs bg-[#141415] px-3 py-2 rounded-lg border border-[rgba(237,237,237,0.06)]">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="font-medium text-[#ededed]">{p.ticker.replace('.BA', '')}</span>
                      </div>
                      <div className="font-mono text-[#a1a1a6] tabular">
                        {percent.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-[#85858b] gap-2 py-12 flex flex-col items-center justify-center">
              <PieChart className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-sm">Sin posiciones activas</span>
            </div>
          )}
        </div>
      </div>

      {/* ROW 4: Cocos CSV Import Zone */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div
            className={clsx(
              "relative border border-dashed rounded-xl p-6 transition-colors cursor-pointer h-full flex items-center justify-center min-h-[120px]",
              isDragging ? "border-[#d99b43] bg-[#232325]" : "border-[rgba(237,237,237,0.14)] bg-[#19191b] hover:bg-[#1e1e21]"
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept=".csv" multiple className="hidden" onChange={onFileChange} />
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
              <div className="w-10 h-10 rounded-lg bg-[#232325] border border-[rgba(237,237,237,0.08)] flex items-center justify-center shrink-0">
                {isImporting ? <RefreshCw className="w-4 h-4 text-[#d99b43] animate-spin" strokeWidth={1.5} /> : <FileUp className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />}
              </div>
              <div className="text-center sm:text-left flex-1 min-w-0">
                <div className="text-sm font-medium text-[#ededed]">
                  {isImporting ? "Importando archivos..." : "Importar CSV de Cocos"}
                </div>
                <div className="text-xs text-[#85858b] mt-0.5">
                  Arrastrá o hacé clic para subir archivos. Se omiten operaciones anteriores a febrero 2025.
                </div>
              </div>
              {importResult && !isImporting && (
                <div className="flex items-center gap-2.5 text-xs shrink-0 bg-[#141415] px-3 py-2 rounded-lg border border-[rgba(237,237,237,0.08)] font-mono tabular">
                  <div className="flex items-center gap-1 text-[#4cc38a]">
                    <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span>{importResult.imported} importados</span>
                  </div>
                  {importResult.skipped > 0 && (
                    <span className="text-[#85858b]">{importResult.skipped} omitidos</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setImportResult(null); }}
                    className="text-[#85858b] hover:text-[#ededed] p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-5 rounded-xl h-full max-h-[160px] lg:max-h-full overflow-y-auto space-y-3">
            <h3 className="text-xs font-medium text-[#85858b]">Archivos CSV importados ({csvImports.length})</h3>
            {csvImports.length > 0 ? (
              <div className="space-y-1.5">
                {[...csvImports].sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()).map(imp => (
                  <div key={imp.id} className="bg-[#141415] border border-[rgba(237,237,237,0.06)] rounded-lg p-2.5 flex justify-between items-center group text-xs hover:bg-[#232325]/50 transition-colors">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-medium text-[#ededed] truncate" title={imp.filename}>
                        {imp.filename}
                      </div>
                      <div className="text-xs font-mono text-[#85858b] mt-0.5 tabular">
                        {new Date(imp.periodStart).toLocaleDateString('es-AR')} – {new Date(imp.periodEnd).toLocaleDateString('es-AR')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-[#a1a1a6] bg-[#232325] px-2 py-0.5 rounded font-mono tabular">
                        {imp.rowCount}
                      </span>
                      <button
                        onClick={() => removeCsvImport(imp.id)}
                        className="text-[#85858b] hover:text-[#e5484d] p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Eliminar importación"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-[#85858b] text-center py-6">No hay archivos CSV registrados</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
