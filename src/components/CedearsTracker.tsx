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

const getDaysSince = (dateString: string) => {
  const d = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - d.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays || 1;
};

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

  const [tickerInput, setTickerInput] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [dateInput, setDateInput] = useState(new Date().toISOString().split("T")[0]);
  const [importStartDate, setImportStartDate] = useState("");
  const [importEndDate, setImportEndDate] = useState("");

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const positions = useMemo(() => {
    const posMap: Record<string, { totalQty: number; totalCost: number; weightedDaysSum: number }> = {};
    
    // Sort by date to calculate PPC correctly if there are many buys/sells
    const sorted = [...purchases].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sorted.forEach(p => {
      const t = p.ticker.toUpperCase();
      if (!posMap[t]) posMap[t] = { totalQty: 0, totalCost: 0, weightedDaysSum: 0 };
      
      if (p.quantity > 0) {
        // PURCHASE: Increases quantity and total cost
        const cost = p.quantity * p.purchasePrice;
        posMap[t].totalQty += p.quantity;
        posMap[t].totalCost += cost;
        posMap[t].weightedDaysSum += (cost * getDaysSince(p.date));
      } else {
        // SALE: Decreases quantity, reduces total cost proportionally (keeping PPC constant)
        const qtyToSubtract = Math.abs(p.quantity);
        if (posMap[t].totalQty > 0) {
          const currentPPC = posMap[t].totalCost / posMap[t].totalQty;
          posMap[t].totalQty -= qtyToSubtract;
          posMap[t].totalCost = Math.max(0, posMap[t].totalQty * currentPPC);
          // Days held doesn't change PPC, so we don't adjust weightedDaysSum for simplicity here
        } else {
          posMap[t].totalQty -= qtyToSubtract;
        }
      }
    });

    return Object.entries(posMap)
      .filter(([_, data]) => Math.abs(data.totalQty) > 0.001) // Filter out closed positions
      .map(([ticker, data]) => {
        const avgPrice = data.totalQty > 0 ? data.totalCost / data.totalQty : 0;
        const currentPrice = marketData[ticker]?.price || 0;
        const currentValue = currentPrice * data.totalQty;
        const pnlValue = currentValue - data.totalCost;
        const pnlPercent = data.totalCost > 0 && currentPrice > 0 ? (pnlValue / data.totalCost) * 100 : 0;
        const avgDaysHeld = data.totalCost > 0 ? Math.max(1, data.weightedDaysSum / data.totalCost) : 1;
        const tna = currentPrice > 0 ? pnlPercent * (365 / avgDaysHeld) : 0;
        
        return { 
          ticker, 
          totalQty: data.totalQty, 
          invested: data.totalCost, 
          avgPrice, 
          currentPrice, 
          currentValue, 
          pnlValue, 
          pnlPercent, 
          tna, 
          hasData: currentPrice > 0 
        };
      })
      .sort((a, b) => b.invested - a.invested);
  }, [purchases, marketData]);

  const globalStats = useMemo(() => {
    let totalInvested = 0, totalValue = 0, globalWeightedDaysSum = 0;
    purchases.forEach(p => { const cost = p.quantity * p.purchasePrice; globalWeightedDaysSum += cost * getDaysSince(p.date); });
    positions.forEach(p => { totalInvested += p.invested; totalValue += p.hasData ? p.currentValue : p.invested; });
    const pnl = totalValue - totalInvested;
    const pnlPercent = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;
    const globalAvgDays = totalInvested > 0 ? Math.max(1, globalWeightedDaysSum / totalInvested) : 1;
    const globalTna = totalInvested > 0 ? pnlPercent * (365 / globalAvgDays) : 0;
    return { totalInvested, totalValue, pnl, pnlPercent, tna: globalTna };
  }, [positions, purchases]);

  const refreshMarketData = async () => {
    if (purchases.length === 0) return;
    setIsLoading(true);
    const uniqueTickers = [...new Set(purchases.map(p => p.ticker.toUpperCase()))];
    const newData: Record<string, TickerData> = { ...marketData };
    await Promise.all(uniqueTickers.map(async (t) => {
      try {
        const res = await fetch(`/api/yahoo?ticker=${t}`);
        if (res.ok) { const data = await res.json(); newData[t] = { price: data.price, previousClose: data.previousClose, currency: data.currency }; }
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
    if (!t.includes(".")) t = t + ".BA";
    const newRow = { ticker: t, quantity: parseFloat(qtyInput), purchasePrice: parseFloat(priceInput), date: dateInput || new Date().toISOString().split("T")[0], currency: "ARS" };
    const docRef = await addDoc(colRef, newRow);
    setPurchases(prev => [...prev, { id: docRef.id, ...newRow }]);
    setTickerInput(""); setQtyInput(""); setPriceInput(""); setDateInput(new Date().toISOString().split("T")[0]);
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
          
          if (importStartDate && row.date < importStartDate) { skipped++; continue; }
          if (importEndDate && row.date > importEndDate) { skipped++; continue; }

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
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-6 rounded-2xl md:col-span-1 border-blue-500/20 shadow-lg shadow-blue-500/5">
          <div className="text-sm text-gray-400 mb-1">Valor Total (ARS)</div>
          <div className="text-3xl font-bold text-white mb-2">${globalStats.totalValue.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
          <div className={clsx("flex items-center gap-2 text-sm font-medium", globalStats.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
            {globalStats.pnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            ${Math.abs(globalStats.pnl).toLocaleString('es-AR', { maximumFractionDigits: 0 })} ({globalStats.pnlPercent.toFixed(2)}%)
          </div>
          <div className={clsx("mt-2 text-xs font-semibold px-2 py-1 rounded inline-block", globalStats.tna >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
            TNA: {globalStats.tna > 0 ? "+" : ""}{globalStats.tna.toFixed(2)}%
          </div>
        </div>
        <div className="glass p-6 rounded-2xl md:col-span-1 flex flex-col justify-center border-blue-500/10">
          <div className="text-sm text-gray-400 mb-1">Capital Invertido</div>
          <div className="text-2xl font-bold text-gray-200">${globalStats.totalInvested.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="glass p-6 rounded-2xl md:col-span-2 hidden sm:flex items-center justify-center relative overflow-hidden h-32 border-blue-500/10">
          {positions.length > 0 ? (
            <div className="w-full h-full flex flex-row items-center gap-6">
              <div className="h-full w-1/3">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie data={positions} dataKey="currentValue" innerRadius={20} outerRadius={40} paddingAngle={2}>
                      {positions.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0)" />))}
                    </Pie>
                    <ReTooltip formatter={(val: unknown) => `$${Number(val).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-2/3 flex flex-wrap gap-2 overflow-y-auto max-h-full custom-scrollbar">
                {positions.map((p, i) => (
                  <div key={p.ticker} className="flex items-center gap-1.5 text-xs text-gray-300 bg-white/5 px-2 py-1 rounded">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {p.ticker.replace('.BA', '')}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 flex items-center gap-2"><PieChart className="w-5 h-5" />Sin datos</div>
          )}
        </div>
      </div>

      {/* CSV Import */}
      <div className="glass-panel p-6 rounded-2xl border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row items-end gap-4 bg-black/20 p-4 rounded-xl border border-white/5">
          <div className="flex-1 w-full">
            <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Desde Fecha (Opcional)</label>
            <input type="date" value={importStartDate} onChange={e => setImportStartDate(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-[10px] text-gray-400 mb-1 uppercase tracking-wider">Hasta Fecha (Opcional)</label>
            <input type="date" value={importEndDate} onChange={e => setImportEndDate(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>
        </div>
        <div
          className={clsx("relative border-2 border-dashed rounded-2xl p-6 transition-all cursor-pointer", isDragging ? "border-blue-400 bg-blue-500/10" : "border-white/10 hover:border-blue-500/40 hover:bg-white/5")}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
        <input ref={fileInputRef} type="file" accept=".csv" multiple className="hidden" onChange={onFileChange} />
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className={clsx("p-3 rounded-xl", isDragging ? "bg-blue-500/20" : "bg-blue-500/10")}>
            {isImporting ? <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" /> : <FileUp className="w-6 h-6 text-blue-400" />}
          </div>
          <div className="text-center sm:text-left">
            <div className="font-medium text-gray-200">
              {isImporting ? "Importando..." : "Importar CSV de Cocos"}
            </div>
            <div className="text-sm text-gray-500">
              Arrastrá o hacé clic · Podés subir múltiples archivos a la vez
            </div>
          </div>
          {importResult && !isImporting && (
            <div className="ml-auto flex items-center gap-3 text-sm shrink-0">
              <button onClick={(e) => { e.stopPropagation(); setImportResult(null); }} className="text-gray-500 hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-semibold">{importResult.imported} importados</span>
              </div>
              {importResult.skipped > 0 && (
                <span className="text-gray-500">{importResult.skipped} omitidos</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Manual add form */}
        <div className="glass-panel p-6 rounded-2xl md:col-span-1 h-fit border-blue-500/10">
          <h2 className="text-lg font-semibold mb-4 text-blue-400 flex items-center gap-2">
            <Plus className="w-4 h-4" />Añadir Compra Manual
          </h2>
          <form onSubmit={handleAddPurchase} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1 tracking-wide uppercase">Ticker (ej. AAPL, SPY)</label>
              <input type="text" required placeholder="AAPL" value={tickerInput} onChange={e => setTickerInput(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 uppercase transition-colors" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1 tracking-wide uppercase">Cantidad</label>
                <input type="number" required step="0.01" min="0" placeholder="2" value={qtyInput} onChange={e => setQtyInput(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1 tracking-wide uppercase">Precio (ARS)</label>
                <input type="number" step="0.01" required min="0" placeholder="50000" value={priceInput} onChange={e => setPriceInput(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 tracking-wide uppercase">Fecha</label>
              <input type="date" required value={dateInput} onChange={e => setDateInput(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors mt-2 shadow-lg shadow-blue-500/20">
              <Plus className="w-4 h-4" /> Registrar
            </button>
          </form>

          {/* Imported CSVs List */}
          {csvImports.length > 0 && (
            <div className="pt-6 border-t border-white/10 mt-6">
              <h3 className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wider">CSVs Importados</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                {[...csvImports].sort((a,b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()).map(imp => (
                  <div key={imp.id} className="bg-black/20 border border-white/5 rounded-lg p-2.5 flex justify-between items-center group text-xs hover:bg-white/5 transition-colors">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-medium text-blue-300 truncate" title={imp.filename}>
                        {imp.filename}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {new Date(imp.periodStart).toLocaleDateString('es-AR')} - {new Date(imp.periodEnd).toLocaleDateString('es-AR')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-gray-600 bg-white/5 px-1.5 py-0.5 rounded font-mono">
                        {imp.rowCount}
                      </span>
                      <button 
                        onClick={() => removeCsvImport(imp.id)} 
                        className="text-gray-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-all"
                        title="Eliminar importación"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Positions table */}
        <div className="glass-panel p-6 rounded-2xl md:col-span-2 border-blue-500/10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-100">Mis Posiciones</h2>
            <button onClick={refreshMarketData} disabled={isLoading} className="p-2 text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors flex items-center gap-2 text-sm disabled:opacity-50">
              <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin")} />
              <span className="hidden sm:inline">Actualizar Precios</span>
            </button>
          </div>
          {positions.length === 0 ? (
            <div className="text-center py-10 text-gray-500 flex flex-col items-center gap-3">
              <Upload className="w-8 h-8 text-gray-600" />
              <div>Importá tu CSV de Cocos o añadí una compra manualmente.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="pb-3 px-2 font-medium">Activo</th>
                    <th className="pb-3 px-2 font-medium text-right">Cant.</th>
                    <th className="pb-3 px-2 font-medium text-right hidden lg:table-cell">PPC</th>
                    <th className="pb-3 px-2 font-medium text-right">Precio Actual</th>
                    <th className="pb-3 px-2 font-medium text-right">Resultados (TNA)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {positions.map(p => (
                    <tr key={p.ticker} className="hover:bg-white/5 transition-colors group">
                      <td className="py-3 px-2">
                        <div className="font-bold text-gray-200">{p.ticker.replace('.BA', '')}</div>
                        <div className="text-xs text-gray-500 lg:hidden">${p.avgPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })}/u avg</div>
                      </td>
                      <td className="py-3 px-2 text-right text-gray-300 font-medium">{p.totalQty.toLocaleString()}</td>
                      <td className="py-3 px-2 text-right text-gray-400 hidden lg:table-cell">${p.avgPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                      <td className="py-3 px-2 text-right">
                        {p.hasData ? <span className="font-medium text-blue-100">${p.currentPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span> : <span className="text-gray-500 text-xs">Cargando...</span>}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {p.hasData && (
                          <div className={clsx("flex flex-col items-end", p.pnlValue >= 0 ? "text-emerald-400" : "text-red-400")}>
                            <span className="font-semibold text-sm">{p.pnlValue > 0 ? "+" : ""}{p.pnlPercent.toFixed(2)}%</span>
                            <div className="text-xs font-medium space-x-1">
                              <span className="opacity-70">${Math.abs(p.pnlValue).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                              <span className={clsx("px-1.5 py-0.5 rounded ml-1 text-[10px]", p.tna >= 0 ? "bg-emerald-500/10" : "bg-red-500/10")}>
                                TNA {p.tna > 0 ? "+" : ""}{p.tna.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {purchases.length > 0 && (
            <div className="mt-8 pt-6 border-t border-white/10">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Historial de Compras Individuales</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                {[...purchases].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => (
                  <div key={p.id} className="grid grid-cols-5 items-center text-xs bg-black/20 p-3 rounded-xl border border-white/5 hover:bg-white/5 transition-colors group">
                    <div className="text-gray-400">{new Date(p.date).toLocaleDateString('es-AR')}</div>
                    <div className="font-bold text-blue-300">{p.ticker.replace('.BA', '')}</div>
                    <div className="text-gray-300 text-center">{p.quantity > 0 ? "+" : ""}{p.quantity}</div>
                    <div className="text-gray-400 text-right">${p.purchasePrice.toLocaleString('es-AR')}</div>
                    <div className="flex justify-end items-center gap-2">
                      {p.nroTicket && <span className="bg-white/10 text-gray-400 px-1.5 py-0.5 rounded text-[10px] hidden sm:block">CSV</span>}
                      <button onClick={() => removePurchase(p.id)} className="text-gray-500 hover:text-red-400 transition-colors p-1 opacity-0 sm:opacity-100 lg:opacity-0 lg:group-hover:opacity-100" title="Eliminar registro">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
