"use client";
import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, RefreshCw, DollarSign, TrendingUp, Landmark, ArrowRightLeft, ListChecks, Coins, Users } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

// ─── Types ─────────────────────────────────────────────────────────────────
type CategoryType = "fixed_usd" | "fixed_ars" | "percentage";

type Category = {
  id: string;
  name: string;
  type: CategoryType;
  value: number; 
  color: string;
  icon: string;
};

type Expense = {
  id: string;
  name: string;
  amount: number;
  currency: "ARS" | "USD";
};

type Debt = {
  id: string;
  debtorName: string;
  description?: string;
  amount: number;
  currency: "ARS" | "USD";
  isPaid: boolean;
};

type IncomeConfig = {
  categories: Category[];
  expenses: Expense[];
  lastIncome?: string;
  completedIds?: string[];
  debts?: Debt[];
};

// ─── Defaults ───────────────────────────────────────────────────────────────
const DEFAULT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
const DEFAULT_CATEGORIES: Category[] = [
  { id: "inv", name: "Inversiones", type: "fixed_usd", value: 200, color: "#10b981", icon: "📈" },
  { id: "ahorro", name: "Ahorro", type: "percentage", value: 20, color: "#3b82f6", icon: "🏦" },
  { id: "ocio", name: "Ocio / Gastos", type: "percentage", value: 80, color: "#ec4899", icon: "🎉" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);

export default function IncomeDistributor() {
  const [isClient, setIsClient] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [config, setConfig] = useState<IncomeConfig>({ categories: DEFAULT_CATEGORIES, expenses: [], completedIds: [], debts: [] });
  const [totalIncome, setTotalIncome] = useState<string>("");
  const [usdRate, setUsdRate] = useState<number>(0);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<string>("fixed_usd");
  const [newCatValue, setNewCatValue] = useState("");
  const [absorbCategory, setAbsorbCategory] = useState("");

  const [newDebtName, setNewDebtName] = useState("");
  const [newDebtDescription, setNewDebtDescription] = useState("");
  const [newDebtAmount, setNewDebtAmount] = useState("");
  const [newDebtCurrency, setNewDebtCurrency] = useState<"ARS" | "USD">("ARS");
  const [debtorFilter, setDebtorFilter] = useState<string>("");

  const { user } = useAuth();
  const getDocRef = () => user ? doc(db, "users", user.uid, "income_config", "data") : null;

  const fetchUsdRate = async () => {
    setIsFetchingRate(true);
    try {
      const res = await fetch("/api/dolar/uala");
      if (res.ok) {
        const data = await res.json();
        if (data.compra) setUsdRate(Math.round(data.compra));
      } else {
        // Fallback al oficial si falla el scraper
        const fallbackRes = await fetch("https://dolarapi.com/v1/dolares/oficial");
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          if (fallbackData.venta) setUsdRate(Math.round(fallbackData.venta));
        }
      }
    } catch (err) { console.error("Error fetching rate:", err); }
    setIsFetchingRate(false);
  };

  useEffect(() => {
    setIsClient(true);
    fetchUsdRate();
    if (!user) return;
    const docRef = getDocRef();
    if (!docRef) return;
    
    getDoc(docRef).then(snap => {
      if (snap.exists()) {
        const data = snap.data() as IncomeConfig;
        setConfig({
          categories: data.categories || [],
          expenses: data.expenses || [],
          completedIds: data.completedIds || [],
          debts: data.debts || []
        });
        if (data.lastIncome !== undefined) setTotalIncome(data.lastIncome);
      }
      setIsDataLoaded(true);
    }).catch(err => {
      console.error("Error loading config:", err);
      setIsDataLoaded(true);
    });
  }, [user]); // eslint-disable-line

  useEffect(() => {
    if (!isClient || !user || !isDataLoaded) return;
    const docRef = getDocRef();
    if (!docRef) return;
    const id = setTimeout(() => setDoc(docRef, { ...config, lastIncome: totalIncome }, { merge: true }), 800);
    return () => clearTimeout(id);
  }, [config, totalIncome, isClient, user, isDataLoaded]); // eslint-disable-line

  const income = parseFloat(totalIncome) || 0;

  const result = useMemo(() => {
    if (usdRate <= 0) return null;

    const totalExpensesARS = config.expenses.reduce((acc, e) => {
      return acc + (e.currency === "USD" ? e.amount * usdRate : e.amount);
    }, 0);

    const fixedAllocations = config.categories
      .filter(c => c.type !== "percentage")
      .map(c => ({
        ...c,
        amountARS: c.type === "fixed_usd" ? c.value * usdRate : c.value,
      }));

    const totalFixedAllocations = fixedAllocations.reduce((acc, c) => acc + c.amountARS, 0);

    const isNeededMode = income <= 0;

    if (isNeededMode) {
      return {
        isNeededMode,
        totalNeededARS: totalExpensesARS + totalFixedAllocations,
        totalExpensesARS,
        allocations: fixedAllocations.map(a => ({...a, pctOfTotal: 0})),
        unallocated: 0,
        afterExpenses: 0
      };
    }

    const afterExpenses = Math.max(0, income - totalExpensesARS);
    const afterFixed = Math.max(0, afterExpenses - totalFixedAllocations);

    const percentageCategories = config.categories.filter(c => c.type === "percentage");
    const totalPercentDefined = percentageCategories.reduce((acc, c) => acc + c.value, 0);

    const allocations = config.categories.map(cat => {
      if (cat.type === "percentage") {
        const weight = totalPercentDefined > 0 ? (cat.value / totalPercentDefined) : 0;
        const amount = weight * afterFixed;
        return { ...cat, amountARS: amount, pctOfTotal: income > 0 ? (amount / income) * 100 : 0 };
      } else {
        const fixed = fixedAllocations.find(f => f.id === cat.id);
        const amount = fixed?.amountARS ?? 0;
        return { ...cat, amountARS: amount, pctOfTotal: income > 0 ? (amount / income) * 100 : 0 };
      }
    });

    const totalAllocated = allocations.reduce((a, c) => a + c.amountARS, 0);
    const unallocated = income - totalExpensesARS - totalAllocated;

    return { isNeededMode, totalNeededARS: 0, allocations, totalExpensesARS, unallocated, afterExpenses };
  }, [income, config, usdRate]);

  const debtTotals = useMemo(() => {
    let totalARS = 0;
    let totalUSD = 0;
    (config.debts || []).forEach(d => {
      if (d.isPaid) return;
      if (d.currency === "USD") {
        totalUSD += d.amount;
        totalARS += d.amount * (usdRate || 0);
      } else {
        totalARS += d.amount;
        totalUSD += usdRate > 0 ? d.amount / usdRate : 0;
      }
    });
    return { totalARS, totalUSD };
  }, [config.debts, usdRate]);

  const uniqueDebtors = useMemo(() => {
    const names = (config.debts || []).map(d => d.debtorName.trim()).filter(Boolean);
    return [...new Set(names)];
  }, [config.debts]);

  const filteredDebts = useMemo(() => {
    const list = config.debts || [];
    if (!debtorFilter) return list;
    return list.filter(d => d.debtorName.trim().toLowerCase() === debtorFilter.toLowerCase());
  }, [config.debts, debtorFilter]);

  const filteredDebtTotals = useMemo(() => {
    let totalARS = 0;
    let totalUSD = 0;
    filteredDebts.forEach(d => {
      if (d.isPaid) return;
      if (d.currency === "USD") {
        totalUSD += d.amount;
        totalARS += d.amount * (usdRate || 0);
      } else {
        totalARS += d.amount;
        totalUSD += usdRate > 0 ? d.amount / usdRate : 0;
      }
    });
    return { totalARS, totalUSD };
  }, [filteredDebts, usdRate]);

  const removeCategory = (id: string) => setConfig(prev => ({ ...prev, categories: prev.categories.filter(c => c.id !== id) }));
  const updateCategory = (id: string, updates: Partial<Category>) => setConfig(prev => ({ ...prev, categories: prev.categories.map(c => c.id === id ? { ...c, ...updates } : c) }));
  const removeExpense = (id: string) => setConfig(prev => ({ ...prev, expenses: prev.expenses.filter(e => e.id !== id) }));
  const updateExpense = (id: string, updates: Partial<Expense>) => setConfig(prev => ({ ...prev, expenses: prev.expenses.map(e => e.id === id ? { ...e, ...updates } : e) }));

  const toggleCompleted = (id: string) => {
    setConfig(prev => {
      const isCompleted = prev.completedIds?.includes(id);
      return {
        ...prev,
        completedIds: isCompleted 
          ? (prev.completedIds || []).filter(i => i !== id)
          : [...(prev.completedIds || []), id]
      };
    });
  };

  const addDebt = (debtorName: string, description: string, amount: number, currency: "ARS" | "USD") => {
    setConfig(prev => ({
      ...prev,
      debts: [...(prev.debts || []), { id: uid(), debtorName, description, amount, currency, isPaid: false }]
    }));
  };

  const removeDebt = (id: string) => {
    setConfig(prev => ({
      ...prev,
      debts: (prev.debts || []).filter(d => d.id !== id)
    }));
  };

  const toggleDebtPaid = (id: string) => {
    setConfig(prev => ({
      ...prev,
      debts: (prev.debts || []).map(d => d.id === id ? { ...d, isPaid: !d.isPaid } : d)
    }));
  };

  const updateDebt = (id: string, updates: Partial<Debt>) => {
    setConfig(prev => ({
      ...prev,
      debts: (prev.debts || []).map(d => d.id === id ? { ...d, ...updates } : d)
    }));
  };

  const handleAbsorbRemainder = () => {
    if (!absorbCategory || !result || result.unallocated <= 0) return;
    const cat = config.categories.find(c => c.id === absorbCategory);
    if (!cat) return;
    
    let amountToAdd = result.unallocated;
    if (cat.type === "fixed_usd") amountToAdd = amountToAdd / usdRate;
    
    setConfig(prev => ({
      ...prev,
      categories: prev.categories.map(c => 
        c.id === absorbCategory ? { ...c, value: Math.round((c.value + amountToAdd) * 100) / 100 } : c
      )
    }));
    setAbsorbCategory("");
  };

  if (!isClient) return null;

  return (
    <div className="space-y-6">
      {/* 1. INPUT DE INGRESO */}
      <div className="glass-panel p-6 rounded-2xl border-violet-500/20 shadow-lg shadow-violet-500/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-violet-400" />
              Ingreso del Mes
            </h2>
            <p className="text-sm text-gray-400">¿Cuánta plata entró hoy a tu cuenta?</p>
          </div>
          <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2 h-fit">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Valor USD</span>
            <div className="flex items-center gap-1">
              <span className="text-gray-500 font-bold">$</span>
              <input 
                type="number" 
                value={usdRate || ""} 
                onChange={(e) => setUsdRate(Number(e.target.value))}
                className="w-16 bg-transparent text-white font-bold focus:outline-none"
              />
            </div>
            <button onClick={fetchUsdRate} className={`text-gray-500 hover:text-violet-400 transition-colors ml-1 ${isFetchingRate ? "animate-spin text-violet-400" : ""}`} title="Actualizar Ualá">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="relative max-w-md">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-500">$</span>
          <input
            type="number"
            placeholder="Ej: 2.500.000"
            value={totalIncome}
            onChange={e => setTotalIncome(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-2xl pl-10 pr-4 py-4 text-3xl font-bold text-white focus:outline-none focus:border-violet-500 transition-colors shadow-inner"
          />
        </div>
        {usdRate > 0 && income > 0 && (
          <p className="text-sm text-gray-500 mt-3 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" />
            Equivale a <strong>USD {(income / usdRate).toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
          </p>
        )}
      </div>

      {/* 2. HOJA DE RUTA (SALIDAS) */}
      {result && (income > 0 || result.isNeededMode) && (
        <div className="space-y-6 w-full">
          <div className="glass-panel overflow-hidden rounded-2xl border-emerald-500/20">
              <div className="bg-emerald-500/10 px-6 py-4 border-b border-emerald-500/10 flex justify-between items-center">
                <h3 className="font-bold text-emerald-400 flex items-center gap-2">
                  <ListChecks className="w-5 h-5" /> {result.isNeededMode ? "Salidas Fijas (Ingreso Necesario)" : "Salidas Programadas"}
                </h3>
                <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-full font-mono uppercase">Resumen en Pesos</span>
              </div>
              
              <div className="divide-y divide-white/5">
                {/* Gastos Fijos (Como parte de las Salidas) */}
                {config.expenses.map(e => {
                  const amount = e.currency === "USD" ? e.amount * usdRate : e.amount;
                  const isCompleted = config.completedIds?.includes(e.id);
                  return (
                    <div key={e.id} className={`p-4 flex justify-between items-center hover:bg-white/5 transition-colors ${isCompleted ? 'opacity-40 grayscale' : ''}`}>
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleCompleted(e.id)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isCompleted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-500 hover:text-white hover:bg-white/10'}`} title="Marcar como completado">
                          <CheckCircleIcon />
                        </button>
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400"><DollarSign className="w-4 h-4" /></div>
                        <span className={`text-gray-300 text-sm font-medium ${isCompleted ? 'line-through' : ''}`}>{e.name}</span>
                      </div>
                      <span className="text-red-400 font-mono font-bold">
                        ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })}

                {/* Distribución (Como parte de las Salidas) */}
                {result.allocations.map(a => {
                  const isCompleted = config.completedIds?.includes(a.id);
                  return (
                    <div key={a.id} className={`p-4 flex justify-between items-center hover:bg-white/5 transition-colors ${isCompleted ? 'opacity-40 grayscale' : ''}`}>
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleCompleted(a.id)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isCompleted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-500 hover:text-white hover:bg-white/10'}`} title="Marcar como completado">
                          <CheckCircleIcon />
                        </button>
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-lg">{a.icon}</div>
                        <div>
                          <div className={`text-sm font-bold text-white ${isCompleted ? 'line-through' : ''}`}>{a.name}</div>
                          <div className="text-[10px] text-gray-500 uppercase tracking-tighter">
                            {a.type === "fixed_usd" ? `${a.value} USD fijo` : a.type === "fixed_ars" ? `${a.value} ARS fijo` : `${a.value}% del resto`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-mono font-black text-white">
                          ${a.amountARS.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {a.pctOfTotal.toFixed(1)}% del total
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total Summary Row */}
              <div className="p-6 bg-black/40 border-t border-white/10 flex justify-between items-center">
                <span className="text-gray-400 font-bold uppercase text-xs tracking-widest">
                  {result.isNeededMode ? "Total Necesario" : "Total Salidas"}
                </span>
                <span className="text-2xl font-black text-white">
                  ${(result.isNeededMode ? result.totalNeededARS : result.totalExpensesARS + result.allocations.reduce((a,c) => a + c.amountARS, 0)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Sobras / Unallocated */}
            {!result.isNeededMode && result.unallocated > 100 ? (
              <div className="glass-panel p-6 rounded-2xl border-amber-500/20 bg-amber-500/5 animate-pulse">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                    <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400 shrink-0"><TrendingUp className="w-6 h-6" /></div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-amber-400">¡Te sobra plata!</h4>
                      <p className="text-xs text-amber-500/70">
                        Tenés <strong>${result.unallocated.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> sin asignar
                        {usdRate > 0 && (
                          <> (equivale a <strong>USD {(result.unallocated / usdRate).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</strong>)</>
                        )}.
                      </p>
                      
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <select value={absorbCategory} onChange={e => setAbsorbCategory(e.target.value)} className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1 text-amber-400 text-xs focus:outline-none max-w-full">
                          <option value="">Sumar a una salida...</option>
                          {config.categories.filter(c => c.type !== "percentage").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button onClick={handleAbsorbRemainder} disabled={!absorbCategory} className="bg-amber-500 disabled:opacity-50 hover:bg-amber-400 text-black px-3 py-1 rounded-lg text-xs font-bold transition-colors">
                          Asignar Resto
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="text-2xl font-black text-amber-400 self-end sm:self-center shrink-0">
                    +${result.unallocated.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ) : !result.isNeededMode && (
              <div className="glass-panel p-4 rounded-xl border-white/5 text-center text-xs text-gray-500">
                Ingreso 100% distribuido. ¡Buen trabajo!
              </div>
            )}
        </div>
      )}

      {/* 3. GESTIÓN DE SALIDAS (SIEMPRE VISIBLE) */}
      <div className="pt-10 border-t border-white/10">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Coins className="w-5 h-5 text-amber-400" />
          Configurar Salidas
        </h3>
        
        <div className="glass-panel p-6 rounded-2xl border-white/5 w-full">
          <div className="space-y-3 mb-6">
            {config.expenses.length === 0 && config.categories.length === 0 && (
              <p className="text-gray-500 text-xs py-4 text-center">No hay salidas configuradas.</p>
            )}
            
            {/* Gastos Fijos */}
            {config.expenses.map(e => (
              <div key={e.id} className="flex items-center gap-3 text-sm bg-black/20 p-3 rounded-xl border border-white/5 group">
                <div className="w-8 h-8 flex items-center justify-center bg-red-500/10 rounded-lg text-red-400"><DollarSign className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <input
                    type="text"
                    value={e.name}
                    onChange={ev => updateExpense(e.id, { name: ev.target.value })}
                    className="bg-transparent text-gray-200 font-bold focus:outline-none focus:border-b focus:border-red-500/50 w-full"
                  />
                  <div className="text-[10px] text-gray-500 uppercase">Gasto Fijo</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-white/5 border border-white/10 rounded-lg px-2">
                    <span className="text-gray-500 font-bold mr-1">$</span>
                    <input
                      type="number"
                      value={e.amount || ""}
                      onChange={ev => updateExpense(e.id, { amount: parseFloat(ev.target.value) || 0 })}
                      className="w-40 bg-transparent py-1.5 text-red-400 text-right font-mono font-bold text-xs focus:outline-none"
                    />
                    <select
                      value={e.currency}
                      onChange={ev => updateExpense(e.id, { currency: ev.target.value as "ARS"|"USD" })}
                      className="ml-1 bg-transparent text-red-400 text-xs font-mono font-bold focus:outline-none cursor-pointer"
                    >
                      <option value="ARS" className="bg-[#09090b]">ARS</option>
                      <option value="USD" className="bg-[#09090b]">USD</option>
                    </select>
                  </div>
                  <button onClick={() => removeExpense(e.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1 opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}

            {/* Categorías */}
            {config.categories.map(c => (
              <div key={c.id} className="flex items-center gap-3 text-sm bg-black/20 p-3 rounded-xl border border-white/5 group">
                <div className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg text-lg">{c.icon}</div>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <input
                    type="text"
                    value={c.name}
                    onChange={e => updateCategory(c.id, { name: e.target.value })}
                    className="bg-transparent text-gray-200 font-bold focus:outline-none focus:border-b focus:border-violet-500/50 w-full"
                  />
                  <select
                    value={c.type}
                    onChange={e => updateCategory(c.id, { type: e.target.value as CategoryType })}
                    className="bg-transparent text-[10px] text-gray-500 uppercase focus:outline-none w-fit cursor-pointer"
                  >
                    <option value="fixed_usd" className="bg-[#09090b]">USD Fijo</option>
                    <option value="fixed_ars" className="bg-[#09090b]">ARS Fijo</option>
                    <option value="percentage" className="bg-[#09090b]">% del Resto</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={c.value || ""}
                    onChange={e => updateCategory(c.id, { value: parseFloat(e.target.value) || 0 })}
                    className="w-44 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-center font-bold text-xs focus:outline-none focus:border-violet-500"
                  />
                  <button onClick={() => removeCategory(c.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1 opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 bg-black/40 p-3 rounded-xl border border-white/5">
            <input type="text" placeholder="Nombre" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="col-span-1 sm:col-span-2 bg-transparent text-white text-sm focus:outline-none px-2" />
            <select 
              value={newCatType} 
              onChange={e => setNewCatType(e.target.value)} 
              className="col-span-1 sm:col-span-2 bg-transparent text-white text-xs focus:outline-none cursor-pointer"
            >
              <option value="fixed_usd" className="bg-[#09090b]">USD FIJO</option>
              <option value="fixed_ars" className="bg-[#09090b]">ARS FIJO</option>
              <option value="percentage" className="bg-[#09090b]">% DEL REMANENTE</option>
            </select>
            <input type="number" placeholder="Monto / %" value={newCatValue} onChange={e => setNewCatValue(e.target.value)} className="col-span-1 bg-transparent text-white text-sm focus:outline-none px-2 text-center" />
            <button 
              onClick={() => {
                if (!newCatName || !newCatValue) return;
                const idx = config.categories.length;
                setConfig(prev => ({
                  ...prev,
                  categories: [...prev.categories, {
                    id: uid(), name: newCatName, type: newCatType as CategoryType,
                    value: parseFloat(newCatValue), color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length], icon: "💰"
                  }]
                }));
                setNewCatName(""); setNewCatValue("");
              }} 
              className="col-span-1 bg-violet-600/20 hover:bg-violet-600 text-violet-400 hover:text-white rounded-lg flex items-center justify-center transition-all py-2"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. DEUDAS A MI FAVOR */}
      <div className="pt-10 border-t border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              Deudas a mi Favor
            </h3>
            <p className="text-sm text-gray-400">Registrá la plata que te debe alguien y controlá los cobros.</p>
          </div>
          {debtTotals.totalARS > 0 && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl px-4 py-2 flex flex-col items-end">
              <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Total Pendiente de Cobro</span>
              <div className="text-lg font-black text-white">
                ${debtTotals.totalARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })} <span className="text-xs font-bold text-gray-400">ARS</span>
              </div>
              {usdRate > 0 && (
                <div className="text-[11px] text-gray-400 mt-0.5">
                  o USD {debtTotals.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="glass-panel p-6 rounded-2xl border-white/5 w-full space-y-4">
          {/* Filtro por deudor */}
          {uniqueDebtors.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-black/20 p-3 rounded-xl border border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-semibold uppercase">Filtrar por Deudor:</span>
                <select
                  value={debtorFilter}
                  onChange={e => setDebtorFilter(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none cursor-pointer"
                >
                  <option value="" className="bg-[#09090b]">Todos los deudores</option>
                  {uniqueDebtors.map(name => (
                    <option key={name} value={name} className="bg-[#09090b]">{name}</option>
                  ))}
                </select>
              </div>
              {debtorFilter && (
                <div className="text-xs text-indigo-300 font-medium sm:ml-auto">
                  Suma pendiente de {debtorFilter}: <strong>${filteredDebtTotals.totalARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS</strong>
                  {usdRate > 0 && ` / USD ${filteredDebtTotals.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {(!config.debts || config.debts.length === 0) && (
              <p className="text-gray-500 text-xs py-4 text-center">No tenés deudas registradas a tu favor.</p>
            )}

            {filteredDebts.length === 0 && config.debts && config.debts.length > 0 && (
              <p className="text-gray-500 text-xs py-4 text-center">No hay deudas cargadas para el deudor seleccionado.</p>
            )}

            {filteredDebts.map(d => (
              <div key={d.id} className={`flex items-center gap-3 text-sm bg-black/20 p-3 rounded-xl border border-white/5 group transition-all duration-300 ${d.isPaid ? 'opacity-40 grayscale' : ''}`}>
                <button 
                  onClick={() => toggleDebtPaid(d.id)} 
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${d.isPaid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-500 hover:text-white hover:bg-white/10'}`} 
                  title={d.isPaid ? "Marcar como no cobrado" : "Marcar como cobrado"}
                >
                  <CheckCircleIcon />
                </button>
                <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-4">
                    <input
                      type="text"
                      value={d.debtorName}
                      onChange={ev => updateDebt(d.id, { debtorName: ev.target.value })}
                      className={`bg-transparent text-gray-200 font-bold focus:outline-none focus:border-b focus:border-indigo-500/50 w-full ${d.isPaid ? 'line-through' : ''}`}
                      placeholder="Deudor"
                    />
                    <div className="text-[10px] text-gray-500 uppercase">Deudor</div>
                  </div>
                  <div className="sm:col-span-8">
                    <input
                      type="text"
                      value={d.description || ""}
                      onChange={ev => updateDebt(d.id, { description: ev.target.value })}
                      className={`bg-transparent text-gray-300 focus:outline-none focus:border-b focus:border-indigo-500/50 w-full ${d.isPaid ? 'line-through' : ''}`}
                      placeholder="Concepto (ej: Cena, Alquiler)"
                    />
                    <div className="text-[10px] text-gray-500 uppercase">Concepto</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-white/5 border border-white/10 rounded-lg px-2">
                    <span className="text-gray-500 font-bold mr-1">$</span>
                    <input
                      type="number"
                      value={d.amount || ""}
                      onChange={ev => updateDebt(d.id, { amount: parseFloat(ev.target.value) || 0 })}
                      className="w-24 sm:w-40 bg-transparent py-1.5 text-indigo-400 text-right font-mono font-bold text-xs focus:outline-none"
                    />
                    <select
                      value={d.currency}
                      onChange={ev => updateDebt(d.id, { currency: ev.target.value as "ARS"|"USD" })}
                      className="ml-1 bg-transparent text-indigo-400 text-xs font-mono font-bold focus:outline-none cursor-pointer"
                    >
                      <option value="ARS" className="bg-[#09090b]">ARS</option>
                      <option value="USD" className="bg-[#09090b]">USD</option>
                    </select>
                  </div>
                  <button onClick={() => removeDebt(d.id)} className="text-gray-500 hover:text-red-400 transition-colors p-1" title="Eliminar deuda"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Formulario de carga rápida para nuevas deudas */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-black/40 p-3 rounded-xl border border-white/5">
            <input 
              type="text" 
              placeholder="Deudor" 
              value={newDebtName} 
              onChange={e => setNewDebtName(e.target.value)} 
              className="col-span-1 sm:col-span-2 bg-transparent text-white text-sm focus:outline-none px-2" 
            />
            <input 
              type="text" 
              placeholder="Concepto (ej: Cena, Alquiler)" 
              value={newDebtDescription} 
              onChange={e => setNewDebtDescription(e.target.value)} 
              className="col-span-1 sm:col-span-4 bg-transparent text-white text-sm focus:outline-none px-2" 
            />
            <select 
              value={newDebtCurrency} 
              onChange={e => setNewDebtCurrency(e.target.value as "ARS"|"USD")} 
              className="col-span-1 sm:col-span-3 bg-transparent text-white text-xs focus:outline-none cursor-pointer animate-none"
            >
              <option value="ARS" className="bg-[#09090b]">ARS (Pesos)</option>
              <option value="USD" className="bg-[#09090b]">USD (Dólares)</option>
            </select>
            <input 
              type="number" 
              placeholder="Monto" 
              value={newDebtAmount} 
              onChange={e => setNewDebtAmount(e.target.value)} 
              className="col-span-1 sm:col-span-2 bg-transparent text-white text-sm focus:outline-none px-2 text-center" 
            />
            <button 
              onClick={() => {
                if (!newDebtName || !newDebtAmount) return;
                addDebt(newDebtName, newDebtDescription, parseFloat(newDebtAmount), newDebtCurrency);
                setNewDebtName(""); 
                setNewDebtDescription("");
                setNewDebtAmount("");
              }} 
              className="col-span-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-lg flex items-center justify-center transition-all py-2"
              title="Añadir deuda"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckCircleIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
