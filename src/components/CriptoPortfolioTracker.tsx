"use client";
import { useState, useEffect, useMemo } from "react";
import { Plus, TrendingUp, TrendingDown, RefreshCw, Trash2, PieChart, DollarSign, Calculator } from "lucide-react";
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from "recharts";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";

type Purchase = { id: string; ticker: string; quantity: number; purchasePrice: number; date: string; };
type TickerData = { price: number; previousClose: number; currency: string; };
const COLORS = ['#d99b43', '#a1a1a6', '#71717a', '#52525b', '#3f3f46', '#d4d4d8', '#27272a'];
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
  const [operationType, setOperationType] = useState<"compra" | "venta">("compra");
  const [currencyMode, setCurrencyMode] = useState<"USD" | "ARS">("USD");
  const [arsSpentInput, setArsSpentInput] = useState("");
  const [arsRateInput, setArsRateInput] = useState("");
  const [usdtReceivedInput, setUsdtReceivedInput] = useState("");
  const [liveCriptoRate, setLiveCriptoRate] = useState<number | null>(null);
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
    
    // Process in chronological order
    const sorted = [...purchases].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sorted.forEach(p => {
      const t = p.ticker.toUpperCase();
      if (!posMap[t]) posMap[t] = { totalQty: 0, invested: 0, weightedDaysSum: 0 };
      
      if (p.quantity > 0) {
        // PURCHASE
        const cost = p.quantity * p.purchasePrice;
        posMap[t].totalQty += p.quantity;
        posMap[t].invested += cost;
        posMap[t].weightedDaysSum += cost * getDaysSince(p.date);
      } else {
        // SALE: Decreases quantity, reduces invested cost proportionally (maintaining PPC constant)
        const qtyToSubtract = Math.abs(p.quantity);
        if (posMap[t].totalQty > 0) {
          const currentPPC = posMap[t].invested / posMap[t].totalQty;
          const currentAvgDays = posMap[t].weightedDaysSum / posMap[t].invested;
          posMap[t].totalQty -= qtyToSubtract;
          posMap[t].invested = Math.max(0, posMap[t].totalQty * currentPPC);
          posMap[t].weightedDaysSum = Math.max(0, posMap[t].invested * currentAvgDays);
        } else {
          posMap[t].totalQty -= qtyToSubtract;
        }
      }
    });

    return Object.entries(posMap)
      .filter(([_, data]) => Math.abs(data.totalQty) > 0.0001)
      .map(([ticker, data]) => {
        const avgPrice = data.totalQty > 0 ? data.invested / data.totalQty : 0;
        const currentPrice = marketData[ticker]?.price || 0;
        const currentValue = currentPrice * data.totalQty;
        const pnlValue = currentValue - data.invested;
        const pnlPercent = data.invested > 0 && currentPrice > 0 ? (pnlValue / data.invested) * 100 : 0;
        const avgDaysHeld = data.invested > 0 ? Math.max(1, data.weightedDaysSum / data.invested) : 1;
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
          avgDaysHeld,
          hasData: currentPrice > 0 
        };
      }).sort((a, b) => b.invested - a.invested);
  }, [purchases, marketData]);

  const globalStats = useMemo(() => {
    let totalInvested = 0, totalValue = 0, gwd = 0;
    positions.forEach(p => {
      totalInvested += p.invested;
      totalValue += p.hasData ? p.currentValue : p.invested;
      gwd += p.invested * (p.avgDaysHeld || 1);
    });
    const pnl = totalValue - totalInvested;
    const pnlPercent = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;
    const globalAvgDays = totalInvested > 0 ? Math.max(1, gwd / totalInvested) : 1;
    return { totalInvested, totalValue, pnl, pnlPercent, tna: totalInvested > 0 ? pnlPercent * (365 / globalAvgDays) : 0 };
  }, [positions]);

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

  const fetchLiveCriptoRate = async () => {
    try {
      const res = await fetch("/api/dolar/cripto");
      if (res.ok) {
        const data = await res.json();
        if (data.venta) {
          setLiveCriptoRate(data.venta);
          if (!arsRateInput && !usdtReceivedInput) {
            setArsRateInput(data.venta.toString());
          }
        }
      }
    } catch {
      // skip
    }
  };

  // Cálculos automáticos para modo ARS
  const arsSpent = parseFloat(arsSpentInput) || 0;
  const arsRate = parseFloat(arsRateInput) || 0;
  const usdtReceived = parseFloat(usdtReceivedInput) || 0;
  const parsedQty = parseFloat(qtyInput) || 0;

  let effectiveUsd = 0;
  let implicitRate = arsRate;
  if (usdtReceived > 0) {
    effectiveUsd = usdtReceived;
    if (arsSpent > 0) {
      implicitRate = arsSpent / usdtReceived;
    }
  } else if (arsSpent > 0 && arsRate > 0) {
    effectiveUsd = arsSpent / arsRate;
  }

  const calculatedUnitPriceUsd = parsedQty > 0 && effectiveUsd > 0 ? effectiveUsd / parsedQty : 0;

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tickerInput || !qtyInput || !user || !colRef) return;
    let t = tickerInput.toUpperCase().trim();
    if (!t.includes("-")) t = t + "-USD";
    
    const qty = parseFloat(qtyInput);
    if (isNaN(qty) || qty <= 0) return;

    let finalPrice = 0;
    if (operationType === "compra" && currencyMode === "ARS") {
      if (calculatedUnitPriceUsd <= 0) {
        alert("Por favor ingresá un monto válido en pesos y la cotización o USDT recibidos.");
        return;
      }
      finalPrice = calculatedUnitPriceUsd;
    } else {
      finalPrice = parseFloat(priceInput);
      if (isNaN(finalPrice) || finalPrice <= 0) {
        alert("Por favor ingresá un precio válido en USD.");
        return;
      }
    }

    const signedQty = operationType === "compra" ? qty : -qty;

    const newRow = { ticker: t, quantity: signedQty, purchasePrice: finalPrice, date: dateInput };
    const docRef = await addDoc(colRef, newRow);
    setPurchases(prev => [...prev, { id: docRef.id, ...newRow }]);
    setTickerInput(""); 
    setQtyInput(""); 
    setPriceInput(""); 
    setArsSpentInput("");
    setUsdtReceivedInput("");
    setDateInput(new Date().toISOString().split("T")[0]);
    setOperationType("compra");
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
        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl md:col-span-1 space-y-2">
          <div className="text-xs text-[#85858b]">Valor total (USD)</div>
          <div className="text-3xl font-mono font-medium text-[#ededed] tabular">
            ${globalStats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={clsx("flex items-center gap-1.5 text-xs font-mono tabular", globalStats.pnl >= 0 ? "text-[#4cc38a]" : "text-[#e5484d]")}>
            {globalStats.pnl >= 0 ? <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.5} /> : <TrendingDown className="w-3.5 h-3.5" strokeWidth={1.5} />}
            ${Math.abs(globalStats.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({globalStats.pnlPercent.toFixed(2)}%)
          </div>
          <div className={clsx("text-xs font-mono tabular", globalStats.tna >= 0 ? "text-[#4cc38a]" : "text-[#e5484d]")}>
            TNA {globalStats.tna > 0 ? "+" : ""}{globalStats.tna.toFixed(2)}%
          </div>
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl md:col-span-1 flex flex-col justify-center space-y-1">
          <div className="text-xs text-[#85858b]">Capital invertido (USD)</div>
          <div className="text-2xl font-mono font-medium text-[#ededed] tabular">
            ${globalStats.totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl md:col-span-2 hidden sm:flex items-center justify-center h-36">
          {positions.length > 0 ? (
            <div className="w-full h-full flex flex-row items-center gap-6">
              <div className="h-full w-1/3">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie data={positions} dataKey="currentValue" innerRadius={24} outerRadius={44} paddingAngle={2}>
                      {positions.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="rgba(0,0,0,0)" />)}
                    </Pie>
                    <ReTooltip formatter={(v: unknown) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-2/3 flex flex-wrap gap-2 overflow-y-auto max-h-full">
                {positions.map((p, i) => (
                  <div key={p.ticker} className="flex items-center gap-1.5 text-xs font-mono text-[#a1a1a6] bg-[#232325] px-2 py-1 rounded-md">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {p.ticker.replace('-USD', '')}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#85858b] flex items-center gap-2">
              <PieChart className="w-4 h-4" strokeWidth={1.5} />
              Sin datos
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl md:col-span-1 h-fit space-y-4">
          <h2 className="text-base font-medium text-[#ededed] flex items-center gap-2">
            {operationType === "compra" ? <Plus className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} /> : <TrendingDown className="w-4 h-4 text-[#e5484d]" strokeWidth={1.5} />}
            Registrar operación manual
          </h2>
          <form onSubmit={handleAddPurchase} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs text-[#a1a1a6]">Tipo</label>
              <select
                value={operationType}
                onChange={e => setOperationType(e.target.value as "compra" | "venta")}
                className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm text-[#ededed] focus:outline-none focus:border-[#d99b43] transition-colors cursor-pointer"
              >
                <option value="compra">Compra (Spot)</option>
                <option value="venta">Venta (Spot)</option>
              </select>
            </div>

            {operationType === "compra" && (
              <div className="space-y-1.5">
                <label className="block text-xs text-[#a1a1a6]">Modo de carga</label>
                <div className="grid grid-cols-2 gap-1 p-1 bg-[#141415] border border-[rgba(237,237,237,0.08)] rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCurrencyMode("USD")}
                    className={clsx(
                      "h-8 px-2 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer",
                      currencyMode === "USD" ? "bg-[#232325] text-[#ededed]" : "text-[#85858b] hover:text-[#ededed]"
                    )}
                  >
                    <DollarSign className="w-3.5 h-3.5" strokeWidth={1.5} /> En USD
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrencyMode("ARS");
                      if (!liveCriptoRate) fetchLiveCriptoRate();
                    }}
                    className={clsx(
                      "h-8 px-2 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer",
                      currencyMode === "ARS" ? "bg-[#232325] text-[#ededed]" : "text-[#85858b] hover:text-[#ededed]"
                    )}
                  >
                    <Calculator className="w-3.5 h-3.5" strokeWidth={1.5} /> En ARS
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs text-[#a1a1a6]">Criptomoneda (ej. BTC, ETH)</label>
              <input type="text" required placeholder="BTC" value={tickerInput} onChange={e => setTickerInput(e.target.value)} className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm text-[#ededed] focus:outline-none focus:border-[#d99b43] uppercase transition-colors" />
            </div>

            {currencyMode === "ARS" && operationType === "compra" ? (
              <div className="space-y-3 bg-[#141415] p-3.5 rounded-lg border border-[rgba(237,237,237,0.08)]">
                <div className="space-y-1">
                  <label className="block text-xs text-[#a1a1a6]">Gastado en pesos (ARS)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#85858b] text-sm font-mono">$</span>
                    <input
                      type="number"
                      step="any"
                      required
                      min="1"
                      placeholder="318700"
                      value={arsSpentInput}
                      onChange={e => setArsSpentInput(e.target.value)}
                      className="w-full h-9 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg pl-7 pr-3 text-[#ededed] focus:outline-none focus:border-[#d99b43] font-mono transition-colors text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-[#85858b]">Dólar cripto</label>
                      {liveCriptoRate && (
                        <button
                          type="button"
                          onClick={() => {
                            setArsRateInput(liveCriptoRate.toString());
                            setUsdtReceivedInput("");
                          }}
                          className="text-xs font-mono text-[#d99b43] hover:underline cursor-pointer"
                          title="Usar cotización actual"
                        >
                          ${liveCriptoRate.toFixed(0)}
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="any"
                      placeholder="1593.5"
                      value={arsRateInput}
                      onChange={e => {
                        setArsRateInput(e.target.value);
                        setUsdtReceivedInput("");
                      }}
                      className="w-full h-8 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-2.5 text-[#ededed] focus:outline-none focus:border-[#d99b43] font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#85858b] mb-1">o USDT recibidos</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="200"
                      value={usdtReceivedInput}
                      onChange={e => {
                        setUsdtReceivedInput(e.target.value);
                        if (arsSpent > 0 && parseFloat(e.target.value) > 0) {
                          setArsRateInput((arsSpent / parseFloat(e.target.value)).toFixed(2));
                        }
                      }}
                      className="w-full h-8 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-2.5 text-[#ededed] focus:outline-none focus:border-[#d99b43] font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-[#a1a1a6]">Cantidad comprada</label>
                  <input
                    type="number"
                    required
                    step="0.00000001"
                    min="0.00000001"
                    placeholder="0.00263935"
                    value={qtyInput}
                    onChange={e => setQtyInput(e.target.value)}
                    className="w-full h-9 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-[#ededed] focus:outline-none focus:border-[#d99b43] font-mono text-sm"
                  />
                </div>

                {effectiveUsd > 0 && (
                  <div className="pt-2 border-t border-[rgba(237,237,237,0.08)] text-xs font-mono space-y-1 tabular">
                    <div className="flex justify-between text-[#85858b]">
                      <span>Inversión</span>
                      <span className="text-[#ededed]">${effectiveUsd.toFixed(2)} USD</span>
                    </div>
                    {implicitRate > 0 && (
                      <div className="flex justify-between text-[#85858b]">
                        <span>Tasa efectiva</span>
                        <span className="text-[#a1a1a6]">${implicitRate.toFixed(2)} ARS/USD</span>
                      </div>
                    )}
                    {calculatedUnitPriceUsd > 0 && (
                      <div className="flex justify-between text-[#85858b]">
                        <span>Precio</span>
                        <span className="text-[#d99b43]">${calculatedUnitPriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs text-[#a1a1a6]">Cantidad</label>
                  <input type="number" required step="0.00000001" min="0.00000001" placeholder="0.05" value={qtyInput} onChange={e => setQtyInput(e.target.value)} className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43] transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs text-[#a1a1a6]">Precio (USD)</label>
                  <input type="number" step="0.01" required min="0" placeholder="65000" value={priceInput} onChange={e => setPriceInput(e.target.value)} className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43] transition-colors" />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs text-[#a1a1a6]">Fecha</label>
              <input type="date" required value={dateInput} onChange={e => setDateInput(e.target.value)} className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43] transition-colors" />
            </div>

            <button
              type="submit"
              className={clsx(
                "w-full h-10 font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer",
                operationType === "compra"
                  ? "bg-[#d99b43] hover:bg-[#e3a852] text-[#141415]"
                  : "bg-[#e5484d] hover:bg-[#eb5e63] text-[#ededed]"
              )}
            >
              {operationType === "compra" ? <Plus className="w-4 h-4" strokeWidth={1.5} /> : <TrendingDown className="w-4 h-4" strokeWidth={1.5} />}
              {operationType === "compra" ? "Registrar compra" : "Registrar venta"}
            </button>
          </form>
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl md:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-[#ededed]">Billetera Spot</h2>
            <button onClick={refreshMarketData} disabled={isLoading} className="h-9 px-3 text-[#a1a1a6] hover:text-[#ededed] bg-[#232325] hover:bg-[#2c2c2f] border border-[rgba(237,237,237,0.08)] rounded-lg transition-colors flex items-center gap-2 text-xs font-medium disabled:opacity-50 cursor-pointer">
              <RefreshCw className={clsx("w-3.5 h-3.5", isLoading && "animate-spin")} strokeWidth={1.5} />
              <span className="hidden sm:inline">Actualizar precios</span>
            </button>
          </div>

          {positions.length === 0 ? (
            <div className="text-center py-10 text-sm text-[#85858b]">No hay activos registrados.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[rgba(237,237,237,0.08)] text-[#85858b] text-xs">
                    <th className="pb-3 px-2 font-medium">Activo</th>
                    <th className="pb-3 px-2 font-medium text-right">Cantidad</th>
                    <th className="pb-3 px-2 font-medium text-right hidden lg:table-cell">Precio prom.</th>
                    <th className="pb-3 px-2 font-medium text-right">Precio actual</th>
                    <th className="pb-3 px-2 font-medium text-right">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(237,237,237,0.06)]">
                  {positions.map(p => (
                    <tr key={p.ticker} className="hover:bg-[#232325]/50 transition-colors">
                      <td className="py-3 px-2 font-medium text-sm text-[#ededed]">{p.ticker.replace('-USD', '')}</td>
                      <td className="py-3 px-2 text-right font-mono text-sm text-[#a1a1a6] tabular">{p.totalQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</td>
                      <td className="py-3 px-2 text-right font-mono text-sm text-[#85858b] hidden lg:table-cell tabular">${p.avgPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-3 px-2 text-right font-mono text-sm tabular">
                        {p.hasData ? <span className="text-[#ededed]">${p.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> : <span className="text-[#85858b] text-xs">Cargando...</span>}
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular">
                        {p.hasData && (
                          <div className={clsx("flex flex-col items-end", p.pnlValue >= 0 ? "text-[#4cc38a]" : "text-[#e5484d]")}>
                            <span className="text-sm font-medium">{p.pnlValue > 0 ? "+" : ""}{p.pnlPercent.toFixed(2)}%</span>
                            <span className="text-xs opacity-80">${Math.abs(p.pnlValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
            <div className="pt-6 border-t border-[rgba(237,237,237,0.08)] space-y-3">
              <h3 className="text-xs font-medium text-[#85858b]">Historial de operaciones</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {[...purchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => {
                  const cleanTicker = p.ticker.replace('-USD', '');
                  return (
                    <div key={p.id} className="grid grid-cols-12 gap-2 items-center text-xs bg-[#141415] px-3 py-2.5 rounded-lg border border-[rgba(237,237,237,0.06)] hover:bg-[#232325]/50 transition-colors">
                      <div className="col-span-3 font-mono text-[#85858b] truncate tabular">{new Date(p.date).toLocaleDateString('es-AR')}</div>
                      <span className="col-span-2 font-medium text-[#ededed] truncate">{cleanTicker}</span>
                      <div className={clsx("col-span-3 text-right font-mono tabular truncate", p.quantity > 0 ? "text-[#4cc38a]" : "text-[#e5484d]")}>
                        {p.quantity > 0 ? "+" : ""}{p.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                      </div>
                      <div className="col-span-3 text-right font-mono text-[#a1a1a6] truncate tabular">
                        ${p.purchasePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="col-span-1 flex justify-end items-center">
                        <button onClick={() => removePurchase(p.id)} className="text-[#85858b] hover:text-[#e5484d] transition-colors p-1 cursor-pointer" title="Eliminar registro">
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
      </div>
    </div>
  );
}
