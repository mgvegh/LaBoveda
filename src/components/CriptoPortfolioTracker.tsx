"use client";
import { useState, useEffect, useMemo } from "react";
import { Plus, TrendingUp, TrendingDown, RefreshCw, Trash2, PieChart } from "lucide-react";
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from "recharts";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";

type Purchase = { id: string; ticker: string; quantity: number; purchasePrice: number; date: string; };
type TickerData = { price: number; previousClose: number; currency: string; };
const COLORS = ['#14b8a6', '#0ea5e9', '#8b5cf6', '#d946ef', '#f43f5e', '#f59e0b', '#10b981'];
const getDaysSince = (d: string) => { const diff = Math.abs(new Date().getTime() - new Date(d).getTime()); return Math.ceil(diff / 86400000) || 1; };

export default function CriptoPortfolioTracker() {
  const [isClient, setIsClient] = useState(false);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [marketData, setMarketData] = useState<Record<string, TickerData>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [tickerInput, setTickerInput] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [dateInput, setDateInput] = useState(new Date().toISOString().split("T")[0]);
  const { user } = useAuth();
  const colRef = user ? collection(db, "users", user.uid, "cripto_portfolio") : null;

  useEffect(() => {
    setIsClient(true);
    if (!user || !colRef) return;
    getDocs(colRef).then(snap => setPurchases(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Purchase, "id">) }))));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const positions = useMemo(() => {
    const posMap: Record<string, { totalQty: number; invested: number; weightedDaysSum: number }> = {};
    purchases.forEach(p => {
      const t = p.ticker.toUpperCase();
      if (!posMap[t]) posMap[t] = { totalQty: 0, invested: 0, weightedDaysSum: 0 };
      const cost = p.quantity * p.purchasePrice;
      posMap[t].totalQty += p.quantity; posMap[t].invested += cost; posMap[t].weightedDaysSum += cost * getDaysSince(p.date);
    });
    return Object.entries(posMap).map(([ticker, data]) => {
      const avgPrice = data.invested / data.totalQty;
      const currentPrice = marketData[ticker]?.price || 0;
      const currentValue = currentPrice * data.totalQty;
      const pnlValue = currentValue - data.invested;
      const pnlPercent = data.invested > 0 && currentPrice > 0 ? (pnlValue / data.invested) * 100 : 0;
      const avgDaysHeld = Math.max(1, data.weightedDaysSum / data.invested);
      const tna = currentPrice > 0 ? pnlPercent * (365 / avgDaysHeld) : 0;
      return { ticker, totalQty: data.totalQty, invested: data.invested, avgPrice, currentPrice, currentValue, pnlValue, pnlPercent, tna, hasData: currentPrice > 0 };
    }).sort((a, b) => b.invested - a.invested);
  }, [purchases, marketData]);

  const globalStats = useMemo(() => {
    let totalInvested = 0, totalValue = 0, gwd = 0;
    purchases.forEach(p => { const cost = p.quantity * p.purchasePrice; gwd += cost * getDaysSince(p.date); });
    positions.forEach(p => { totalInvested += p.invested; totalValue += p.hasData ? p.currentValue : p.invested; });
    const pnl = totalValue - totalInvested;
    const pnlPercent = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;
    const globalAvgDays = totalInvested > 0 ? Math.max(1, gwd / totalInvested) : 1;
    return { totalInvested, totalValue, pnl, pnlPercent, tna: totalInvested > 0 ? pnlPercent * (365 / globalAvgDays) : 0 };
  }, [positions, purchases]);

  const refreshMarketData = async () => {
    if (!purchases.length) return;
    setIsLoading(true);
    const tickers = [...new Set(purchases.map(p => p.ticker.toUpperCase()))];
    const newData = { ...marketData };
    await Promise.all(tickers.map(async t => {
      try { const r = await fetch(`/api/yahoo?ticker=${t}`); if (r.ok) { const d = await r.json(); newData[t] = { price: d.price, previousClose: d.previousClose, currency: d.currency }; } } catch { /* skip */ }
    }));
    setMarketData(newData); setIsLoading(false);
  };

  useEffect(() => { if (purchases.length > 0 && isClient) refreshMarketData(); }, [isClient, purchases.length]); // eslint-disable-line

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tickerInput || !qtyInput || !priceInput || !user || !colRef) return;
    let t = tickerInput.toUpperCase().trim();
    if (!t.includes("-")) t = t + "-USD";
    const newRow = { ticker: t, quantity: parseFloat(qtyInput), purchasePrice: parseFloat(priceInput), date: dateInput };
    const docRef = await addDoc(colRef, newRow);
    setPurchases(prev => [...prev, { id: docRef.id, ...newRow }]);
    setTickerInput(""); setQtyInput(""); setPriceInput(""); setDateInput(new Date().toISOString().split("T")[0]);
  };

  const removePurchase = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "cripto_portfolio", id));
    setPurchases(prev => prev.filter(p => p.id !== id));
  };

  if (!isClient) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-6 rounded-2xl md:col-span-1 border-teal-500/20 shadow-lg shadow-teal-500/5">
          <div className="text-sm text-gray-400 mb-1">Valor Total (USD)</div>
          <div className="text-3xl font-bold text-white mb-2">${globalStats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className={clsx("flex items-center gap-2 text-sm font-medium", globalStats.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
            {globalStats.pnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            ${Math.abs(globalStats.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({globalStats.pnlPercent.toFixed(2)}%)
          </div>
          <div className={clsx("mt-2 text-xs font-semibold px-2 py-1 rounded inline-block", globalStats.tna >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
            TNA: {globalStats.tna > 0 ? "+" : ""}{globalStats.tna.toFixed(2)}%
          </div>
        </div>
        <div className="glass p-6 rounded-2xl md:col-span-1 flex flex-col justify-center border-teal-500/10">
          <div className="text-sm text-gray-400 mb-1">Capital Invertido (USD)</div>
          <div className="text-2xl font-bold text-gray-200">${globalStats.totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className="glass p-6 rounded-2xl md:col-span-2 hidden sm:flex items-center justify-center relative overflow-hidden h-32 border-teal-500/10">
          {positions.length > 0 ? (
            <div className="w-full h-full flex flex-row items-center gap-6">
              <div className="h-full w-1/3">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie data={positions} dataKey="currentValue" innerRadius={20} outerRadius={40} paddingAngle={2}>
                      {positions.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="rgba(0,0,0,0)" />)}
                    </Pie>
                    <ReTooltip formatter={(v: unknown) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-2/3 flex flex-wrap gap-2 overflow-y-auto max-h-full custom-scrollbar">
                {positions.map((p, i) => (
                  <div key={p.ticker} className="flex items-center gap-1.5 text-xs text-gray-300 bg-white/5 px-2 py-1 rounded">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {p.ticker.replace('-USD', '')}
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="text-gray-500 flex items-center gap-2"><PieChart className="w-5 h-5" />Sin datos</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-2xl md:col-span-1 h-fit border-teal-500/10">
          <h2 className="text-lg font-semibold mb-4 text-teal-400">Añadir Compra (Spot)</h2>
          <form onSubmit={handleAddPurchase} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1 tracking-wide uppercase">Criptomoneda (ej. BTC, ETH)</label>
              <input type="text" required placeholder="BTC" value={tickerInput} onChange={e => setTickerInput(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-teal-500 uppercase transition-colors" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1 tracking-wide uppercase">Cantidad</label>
                <input type="number" required step="0.00000001" min="0" placeholder="0.05" value={qtyInput} onChange={e => setQtyInput(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-teal-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1 tracking-wide uppercase">Precio (USD/u)</label>
                <input type="number" step="0.01" required min="0" placeholder="65000" value={priceInput} onChange={e => setPriceInput(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-teal-500 transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 tracking-wide uppercase">Fecha</label>
              <input type="date" required value={dateInput} onChange={e => setDateInput(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-teal-500 transition-colors" />
            </div>
            <button type="submit" className="w-full bg-teal-600 hover:bg-teal-500 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors mt-2 shadow-lg shadow-teal-500/20">
              <Plus className="w-4 h-4" /> Registrar Compra
            </button>
          </form>
        </div>

        <div className="glass-panel p-6 rounded-2xl md:col-span-2 border-teal-500/10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-100">Billetera Spot</h2>
            <button onClick={refreshMarketData} disabled={isLoading} className="p-2 text-teal-400 hover:text-teal-300 bg-teal-500/10 hover:bg-teal-500/20 rounded-lg transition-colors flex items-center gap-2 text-sm disabled:opacity-50">
              <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin")} />
              <span className="hidden sm:inline">Actualizar Precios</span>
            </button>
          </div>
          {positions.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No hay activos registrados. Añade tu primera compra.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="pb-3 px-2 font-medium">Activo</th>
                    <th className="pb-3 px-2 font-medium text-right">Cant.</th>
                    <th className="pb-3 px-2 font-medium text-right hidden lg:table-cell">Precio Prom.</th>
                    <th className="pb-3 px-2 font-medium text-right">Precio Actual</th>
                    <th className="pb-3 px-2 font-medium text-right">Resultados (TNA)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {positions.map(p => (
                    <tr key={p.ticker} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-2"><div className="font-bold text-gray-200">{p.ticker.replace('-USD', '')}</div></td>
                      <td className="py-3 px-2 text-right text-gray-300 font-medium">{p.totalQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td>
                      <td className="py-3 px-2 text-right text-gray-400 hidden lg:table-cell">${p.avgPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-3 px-2 text-right">{p.hasData ? <span className="font-medium text-teal-100">${p.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> : <span className="text-gray-500 text-xs">Cargando...</span>}</td>
                      <td className="py-3 px-2 text-right">{p.hasData && (<div className={clsx("flex flex-col items-end", p.pnlValue >= 0 ? "text-emerald-400" : "text-red-400")}><span className="font-semibold text-sm">{p.pnlValue > 0 ? "+" : ""}{p.pnlPercent.toFixed(2)}%</span><span className="text-xs opacity-70">${Math.abs(p.pnlValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {purchases.length > 0 && (
            <div className="mt-8 pt-6 border-t border-white/10">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Historial de Compras</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                {purchases.map(p => (
                  <div key={p.id} className="flex justify-between items-center text-xs bg-black/20 p-2 rounded-md">
                    <span className="text-gray-400 w-24">{p.date}</span>
                    <span className="font-bold text-teal-300 w-20">{p.ticker.replace('-USD', '')}</span>
                    <span className="text-gray-400">{p.quantity} x ${p.purchasePrice}</span>
                    <button onClick={() => removePurchase(p.id)} className="text-gray-500 hover:text-red-400 transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
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
