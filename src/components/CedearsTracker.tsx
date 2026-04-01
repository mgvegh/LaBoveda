"use client";
import { useState, useEffect, useMemo } from "react";
import { Plus, TrendingUp, TrendingDown, RefreshCw, Trash2, PieChart } from "lucide-react";
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from "recharts";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase";

type Purchase = {
  id: string;
  ticker: string;
  quantity: number;
  purchasePrice: number;
  date: string;
};

type TickerData = {
  price: number;
  previousClose: number;
  currency: string;
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const getDaysSince = (dateString: string) => {
  const d = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - d.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays || 1; // Minimum 1 day to avoid Infinity
};

export default function CedearsTracker() {
  const [isClient, setIsClient] = useState(false);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [marketData, setMarketData] = useState<Record<string, TickerData>>({});
  const [isLoading, setIsLoading] = useState(false);

  const [tickerInput, setTickerInput] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [dateInput, setDateInput] = useState(new Date().toISOString().split("T")[0]);

  const { user } = useAuth();
  const supabase = createClient();

  useEffect(() => {
    setIsClient(true);
    if (!user) return;
    
    const fetchPurchases = async () => {
      const { data, error } = await supabase.from('cedears_purchases').select('*').eq('user_id', user.id);
      if (data && !error) {
        setPurchases(data.map(d => ({
          id: d.id,
          ticker: d.ticker,
          quantity: Number(d.quantity),
          purchasePrice: Number(d.purchase_price),
          date: d.date
        })));
      }
    };
    fetchPurchases();
  }, [user]);

  const positions = useMemo(() => {
    const posMap: Record<string, { totalQty: number; invested: number; weightedDaysSum: number }> = {};
    purchases.forEach(p => {
      const t = p.ticker.toUpperCase();
      if (!posMap[t]) posMap[t] = { totalQty: 0, invested: 0, weightedDaysSum: 0 };
      const cost = p.quantity * p.purchasePrice;
      posMap[t].totalQty += p.quantity;
      posMap[t].invested += cost;
      posMap[t].weightedDaysSum += (cost * getDaysSince(p.date));
    });

    return Object.entries(posMap).map(([ticker, data]) => {
      const avgPrice = data.invested / data.totalQty;
      const currentPrice = marketData[ticker]?.price || 0;
      const currentValue = currentPrice * data.totalQty;
      const pnlValue = currentValue - data.invested;
      const pnlPercent = data.invested > 0 && currentPrice > 0 ? (pnlValue / data.invested) * 100 : 0;
      
      const avgDaysHeld = Math.max(1, data.weightedDaysSum / data.invested);
      const tna = currentPrice > 0 ? pnlPercent * (365 / avgDaysHeld) : 0;

      return {
        ticker,
        totalQty: data.totalQty,
        invested: data.invested,
        avgPrice,
        currentPrice,
        currentValue,
        pnlValue,
        pnlPercent,
        tna,
        hasData: currentPrice > 0
      };
    }).sort((a,b) => b.invested - a.invested);
  }, [purchases, marketData]);

  const globalStats = useMemo(() => {
    let totalInvested = 0;
    let totalValue = 0;
    let globalWeightedDaysSum = 0;

    purchases.forEach(p => {
       const cost = p.quantity * p.purchasePrice;
       globalWeightedDaysSum += cost * getDaysSince(p.date);
    });

    positions.forEach(p => {
      totalInvested += p.invested;
      if (p.hasData) totalValue += p.currentValue;
      else totalValue += p.invested; 
    });

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
        if (res.ok) {
          const data = await res.json();
          newData[t] = { price: data.price, previousClose: data.previousClose, currency: data.currency };
        }
      } catch (err) {
        console.error("Failed to fetch", t);
      }
    }));

    setMarketData(newData);
    setIsLoading(false);
  };

  useEffect(() => {
    if (purchases.length > 0 && isClient) {
       refreshMarketData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient, purchases.length]);

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tickerInput || !qtyInput || !priceInput || !user) return;

    let t = tickerInput.toUpperCase().trim();
    if (!t.includes(".")) {
      t = t + ".BA";
    }

    const newRow = {
      user_id: user.id,
      ticker: t,
      quantity: parseFloat(qtyInput),
      purchase_price: parseFloat(priceInput),
      date: dateInput || new Date().toISOString().split("T")[0]
    };

    const { data, error } = await supabase.from('cedears_purchases').insert([newRow]).select();
    
    if (data && !error) {
      setPurchases(prev => [...prev, {
        id: data[0].id,
        ticker: data[0].ticker,
        quantity: Number(data[0].quantity),
        purchasePrice: Number(data[0].purchase_price),
        date: data[0].date
      }]);
      setTickerInput("");
      setQtyInput("");
      setPriceInput("");
      setDateInput(new Date().toISOString().split("T")[0]);
    } else {
      alert("Error guardando compra");
    }
  };

  const removePurchase = async (id: string) => {
    const { error } = await supabase.from('cedears_purchases').delete().eq('id', id).eq('user_id', user?.id);
    if (!error) {
      setPurchases(prev => prev.filter(p => p.id !== id));
    }
  };

  if (!isClient) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-6 rounded-2xl md:col-span-1 border-blue-500/20 shadow-lg shadow-blue-500/5">
           <div className="text-sm text-gray-400 mb-1">Valor Total (ARS)</div>
           <div className="text-3xl font-bold text-white mb-2">
             ${globalStats.totalValue.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
           </div>
           
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
           <div className="text-2xl font-bold text-gray-200">
             ${globalStats.totalInvested.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
           </div>
        </div>

        <div className="glass p-6 rounded-2xl md:col-span-2 hidden sm:flex items-center justify-center relative overflow-hidden h-32 border-blue-500/10">
           {positions.length > 0 ? (
             <div className="w-full h-full flex flex-row items-center gap-6">
                <div className="h-full w-1/3">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie data={positions} dataKey="currentValue" innerRadius={20} outerRadius={40} paddingAngle={2}>
                        {positions.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0)" />
                        ))}
                      </Pie>
                      <ReTooltip formatter={(val: any) => `$${Number(val).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-2/3 flex flex-wrap gap-2 overflow-y-auto max-h-full custom-scrollbar">
                  {positions.map((p, i) => (
                    <div key={p.ticker} className="flex items-center gap-1.5 text-xs text-gray-300 bg-white/5 px-2 py-1 rounded">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                      {p.ticker.replace('.BA', '')}
                    </div>
                  ))}
                </div>
             </div>
           ) : (
             <div className="text-gray-500 flex items-center gap-2"><PieChart className="w-5 h-5"/> Sin datos</div>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        <div className="glass-panel p-6 rounded-2xl md:col-span-1 h-fit border-blue-500/10">
          <h2 className="text-lg font-semibold mb-4 text-blue-400">Añadir Compra</h2>
          <form onSubmit={handleAddPurchase} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1 tracking-wide uppercase">Ticker (ej. AAPL, SPY)</label>
              <input 
                 type="text" 
                 required
                 placeholder="AAPL"
                 value={tickerInput}
                 onChange={e => setTickerInput(e.target.value)}
                 className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 uppercase transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1 tracking-wide uppercase">Cantidad</label>
                <input 
                  type="number" 
                  required
                  step="0.01"
                  min="0"
                  placeholder="2"
                  value={qtyInput}
                  onChange={e => setQtyInput(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1 tracking-wide uppercase">Precio (ARS)</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  min="0"
                  placeholder="8500"
                  value={priceInput}
                  onChange={e => setPriceInput(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 tracking-wide uppercase">Fecha</label>
              <input 
                type="date" 
                required
                value={dateInput}
                onChange={e => setDateInput(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors mt-2 shadow-lg shadow-blue-500/20">
              <Plus className="w-4 h-4" /> Registrar
            </button>
          </form>
        </div>

        <div className="glass-panel p-6 rounded-2xl md:col-span-2 border-blue-500/10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-100">Mis Posiciones</h2>
            <button 
              onClick={refreshMarketData} 
              disabled={isLoading}
              className="p-2 text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin")} /> 
              <span className="hidden sm:inline">Actualizar Precios</span>
            </button>
          </div>

          {positions.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No hay activos registrados.</div>
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
                        <div className="font-bold text-gray-200">{p.ticker}</div>
                        <div className="text-xs text-gray-500 lg:hidden">${p.avgPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })}/u avg</div>
                      </td>
                      <td className="py-3 px-2 text-right text-gray-300 font-medium">{(p.totalQty).toLocaleString()}</td>
                      <td className="py-3 px-2 text-right text-gray-400 hidden lg:table-cell">${p.avgPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                      <td className="py-3 px-2 text-right">
                        {p.hasData ? (
                           <span className="font-medium text-blue-100">${p.currentPrice.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                        ) : (
                           <span className="text-gray-500 text-xs">Cargando...</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {p.hasData && (
                          <div className={clsx("flex flex-col items-end", p.pnlValue >= 0 ? "text-emerald-400" : "text-red-400")}>
                            <span className="font-semibold text-sm">
                              {p.pnlValue > 0 ? "+" : ""}{p.pnlPercent.toFixed(2)}%
                            </span>
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
                 {purchases.map(p => (
                   <div key={p.id} className="flex justify-between items-center text-xs bg-black/20 p-2 rounded-md">
                     <span className="text-gray-400 w-24">{p.date}</span>
                     <span className="font-bold text-blue-300 w-24">{p.ticker}</span>
                     <span className="text-gray-400">{p.quantity} x ${p.purchasePrice}</span>
                     <button onClick={() => removePurchase(p.id)} className="text-gray-500 hover:text-red-400 transition-colors p-1" title="Eliminar registro">
                       <Trash2 className="w-4 h-4" />
                     </button>
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
