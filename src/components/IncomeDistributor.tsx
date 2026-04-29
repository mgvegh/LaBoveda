"use client";
import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, RefreshCw, DollarSign, TrendingUp, Settings, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

// ─── Types ─────────────────────────────────────────────────────────────────
type CategoryType = "fixed_usd" | "fixed_ars" | "percentage";

type Category = {
  id: string;
  name: string;
  type: CategoryType;
  value: number; // USD amount | ARS amount | percentage (0-100)
  color: string;
  icon: string;
};

type Expense = {
  id: string;
  name: string;
  amount: number;
  currency: "ARS" | "USD";
};

type IncomeConfig = {
  categories: Category[];
  expenses: Expense[];
};

// ─── Defaults ───────────────────────────────────────────────────────────────
const DEFAULT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
const DEFAULT_CATEGORIES: Category[] = [
  { id: "inv", name: "Inversiones", type: "fixed_usd", value: 200, color: "#10b981", icon: "📈" },
  { id: "ahorro", name: "Ahorro", type: "percentage", value: 15, color: "#3b82f6", icon: "🏦" },
  { id: "gastos_fijos", name: "Gastos Fijos", type: "percentage", value: 40, color: "#f59e0b", icon: "🏠" },
  { id: "ocio", name: "Ocio / Personal", type: "percentage", value: 20, color: "#8b5cf6", icon: "🎉" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);

export default function IncomeDistributor() {
  const [isClient, setIsClient] = useState(false);
  const [config, setConfig] = useState<IncomeConfig>({ categories: DEFAULT_CATEGORIES, expenses: [] });
  const [totalIncome, setTotalIncome] = useState<string>("");
  const [usdRate, setUsdRate] = useState<number>(0);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<CategoryType>("percentage");
  const [newCatValue, setNewCatValue] = useState("");
  const [newExpName, setNewExpName] = useState("");
  const [newExpAmount, setNewExpAmount] = useState("");
  const [newExpCurrency, setNewExpCurrency] = useState<"ARS" | "USD">("ARS");

  const { user } = useAuth();
  const getDocRef = () => user ? doc(db, "users", user.uid, "income_config", "data") : null;

  // Fetch USD/ARS rate via our yahoo proxy (using BTC as proxy to get rate)
  const fetchUsdRate = async () => {
    setIsFetchingRate(true);
    try {
      // Use ARS=X ticker which is USD/ARS official, or try via yahoo
      const res = await fetch("/api/yahoo?ticker=ARS=X");
      if (res.ok) {
        const data = await res.json();
        // ARS=X gives USD per ARS → invert to get ARS per USD
        if (data.price && data.price > 0) {
          setUsdRate(Math.round(1 / data.price));
        }
      }
    } catch { /* keep existing */ }
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
        if (data.categories?.length) setConfig(data);
      }
    });
  }, [user]); // eslint-disable-line

  // Persist config on change
  useEffect(() => {
    if (!isClient || !user) return;
    const docRef = getDocRef();
    if (!docRef) return;
    const id = setTimeout(() => setDoc(docRef, config, { merge: true }), 800);
    return () => clearTimeout(id);
  }, [config, isClient, user]); // eslint-disable-line

  // ─── Calculation ──────────────────────────────────────────────────────────
  const income = parseFloat(totalIncome) || 0;

  const result = useMemo(() => {
    if (income <= 0 || usdRate <= 0) return null;

    // 1. Sum all fixed expenses in ARS
    const totalExpensesARS = config.expenses.reduce((acc, e) => {
      return acc + (e.currency === "USD" ? e.amount * usdRate : e.amount);
    }, 0);

    const remainingAfterExpenses = Math.max(0, income - totalExpensesARS);

    // 2. Sum all fixed-value categories in ARS
    const fixedAllocations = config.categories
      .filter(c => c.type !== "percentage")
      .map(c => ({
        ...c,
        amountARS: c.type === "fixed_usd" ? c.value * usdRate : c.value,
      }));

    const totalFixed = fixedAllocations.reduce((acc, c) => acc + c.amountARS, 0);
    const remainingForPercent = Math.max(0, remainingAfterExpenses - totalFixed);

    // 3. Distribute percentage categories over remaining
    const percentageCategories = config.categories.filter(c => c.type === "percentage");
    const totalPercent = percentageCategories.reduce((acc, c) => acc + c.value, 0);

    const allocations = config.categories.map(cat => {
      if (cat.type === "percentage") {
        const base = totalPercent > 0 ? (cat.value / totalPercent) : 0;
        const amount = base * remainingForPercent;
        return { ...cat, amountARS: amount, pctOfTotal: income > 0 ? (amount / income) * 100 : 0 };
      } else {
        const fixed = fixedAllocations.find(f => f.id === cat.id);
        const amount = fixed?.amountARS ?? 0;
        return { ...cat, amountARS: amount, pctOfTotal: income > 0 ? (amount / income) * 100 : 0 };
      }
    });

    const unallocated = income - totalExpensesARS - allocations.reduce((a, c) => a + c.amountARS, 0);

    return { allocations, totalExpensesARS, unallocated };
  }, [income, config, usdRate]);

  // ─── Config actions ───────────────────────────────────────────────────────
  const addCategory = () => {
    if (!newCatName || !newCatValue) return;
    const idx = config.categories.length;
    setConfig(prev => ({
      ...prev,
      categories: [...prev.categories, {
        id: uid(), name: newCatName, type: newCatType,
        value: parseFloat(newCatValue), color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length], icon: "💰"
      }]
    }));
    setNewCatName(""); setNewCatValue("");
  };

  const removeCategory = (id: string) => setConfig(prev => ({ ...prev, categories: prev.categories.filter(c => c.id !== id) }));
  const updateCategoryValue = (id: string, value: number) => setConfig(prev => ({ ...prev, categories: prev.categories.map(c => c.id === id ? { ...c, value } : c) }));

  const addExpense = () => {
    if (!newExpName || !newExpAmount) return;
    setConfig(prev => ({ ...prev, expenses: [...prev.expenses, { id: uid(), name: newExpName, amount: parseFloat(newExpAmount), currency: newExpCurrency }] }));
    setNewExpName(""); setNewExpAmount("");
  };
  const removeExpense = (id: string) => setConfig(prev => ({ ...prev, expenses: prev.expenses.filter(e => e.id !== id) }));

  if (!isClient) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel p-6 rounded-2xl border-violet-500/20 shadow-lg shadow-violet-500/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Distribución de Ingresos</h2>
            <p className="text-sm text-gray-400">Ingresá tu sueldo y te digo cuánto va a cada lugar.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2">
              <span className="text-xs text-gray-400 uppercase tracking-wide">USD/ARS</span>
              {isFetchingRate ? <RefreshCw className="w-4 h-4 text-violet-400 animate-spin" /> : (
                <span className="text-white font-bold">{usdRate > 0 ? `$${usdRate.toLocaleString('es-AR')}` : "—"}</span>
              )}
              <button onClick={fetchUsdRate} className="text-gray-500 hover:text-violet-400 transition-colors" title="Actualizar cotización">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <button onClick={() => setShowSettings(s => !s)} className={clsx("p-2 rounded-xl transition-colors flex items-center gap-1.5 text-sm", showSettings ? "bg-violet-500/20 text-violet-400" : "bg-white/5 text-gray-400 hover:text-white")}>
              <Settings className="w-4 h-4" />
              {showSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Income input */}
        <div className="mt-6">
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wide">Ingreso Total del Mes (ARS)</label>
          <div className="relative max-w-sm">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="number"
              placeholder="Ej: 2.500.000"
              value={totalIncome}
              onChange={e => setTotalIncome(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xl font-bold text-white focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>
          {usdRate > 0 && income > 0 && (
            <p className="text-xs text-gray-500 mt-1.5">≈ USD {(income / usdRate).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} al tipo de cambio actual</p>
          )}
        </div>
      </div>

      {/* Resultado */}
      {result && income > 0 && (
        <div className="space-y-4">
          {/* Progress bar */}
          <div className="glass-panel p-4 rounded-2xl border-white/5">
            <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
              {result.allocations.map(a => (
                <div
                  key={a.id}
                  style={{ width: `${Math.max(0, a.pctOfTotal)}%`, backgroundColor: a.color }}
                  className="transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                  title={`${a.name}: ${a.pctOfTotal.toFixed(1)}%`}
                />
              ))}
              {result.totalExpensesARS > 0 && (
                <div style={{ width: `${(result.totalExpensesARS / income) * 100}%`, backgroundColor: "#374151" }} className="rounded-r-full transition-all duration-500" title="Gastos fijos" />
              )}
            </div>
          </div>

          {/* Gastos fijos primero */}
          {config.expenses.length > 0 && (
            <div className="glass p-4 rounded-2xl border-gray-500/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">— Gastos fijos a restar</h3>
              <div className="space-y-2">
                {config.expenses.map(e => (
                  <div key={e.id} className="flex justify-between items-center text-sm">
                    <span className="text-gray-300">{e.name}</span>
                    <span className="text-red-400 font-medium">
                      -{(e.currency === "USD" ? e.amount * usdRate : e.amount).toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS
                      {e.currency === "USD" && <span className="text-gray-500 text-xs ml-1">(${e.amount} USD)</span>}
                    </span>
                  </div>
                ))}
                <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-semibold">
                  <span className="text-gray-400">Restante disponible</span>
                  <span className="text-white">{(income - result.totalExpensesARS).toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS</span>
                </div>
              </div>
            </div>
          )}

          {/* Allocations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {result.allocations.map(a => (
              <div key={a.id} className="glass-panel p-5 rounded-2xl border-white/5 hover:-translate-y-0.5 transition-transform" style={{ borderColor: `${a.color}20` }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{a.icon}</span>
                  <span className="text-sm font-medium text-gray-300">{a.name}</span>
                </div>
                <div className="text-2xl font-bold text-white mb-1" style={{ color: a.color }}>
                  ${a.amountARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-gray-500">
                  {a.pctOfTotal.toFixed(1)}% del ingreso
                  {a.type === "fixed_usd" && usdRate > 0 && (
                    <span className="block text-gray-600">≈ USD {a.value}</span>
                  )}
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-white/5">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, a.pctOfTotal)}%`, backgroundColor: a.color }} />
                </div>
              </div>
            ))}
          </div>

          {result.unallocated > 50 && (
            <div className="glass px-4 py-3 rounded-xl border-amber-500/20 text-sm text-amber-400 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 shrink-0" />
              Tenés <strong>${result.unallocated.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS</strong> sin asignar ({((result.unallocated / income) * 100).toFixed(1)}%). Podés agregar categorías o subir el % de ahorro.
            </div>
          )}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Categories */}
          <div className="glass-panel p-6 rounded-2xl border-violet-500/10">
            <h3 className="text-base font-semibold text-violet-400 mb-4">Categorías de Distribución</h3>
            <div className="space-y-3 mb-4">
              {config.categories.map(c => (
                <div key={c.id} className="flex items-center gap-3 text-sm">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="text-gray-300 flex-1 truncate">{c.icon} {c.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      value={c.value}
                      onChange={e => updateCategoryValue(c.id, parseFloat(e.target.value) || 0)}
                      className="w-20 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-center focus:outline-none focus:border-violet-500"
                    />
                    <span className="text-gray-500 text-xs w-16">
                      {c.type === "fixed_usd" ? "USD fijo" : c.type === "fixed_ars" ? "ARS fijo" : "% dist."}
                    </span>
                    <button onClick={() => removeCategory(c.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 pt-4 space-y-2">
              <div className="grid grid-cols-5 gap-2">
                <input type="text" placeholder="Nombre" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="col-span-2 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500" />
                <select value={newCatType} onChange={e => setNewCatType(e.target.value as CategoryType)} className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500">
                  <option value="percentage">%</option>
                  <option value="fixed_usd">USD</option>
                  <option value="fixed_ars">ARS</option>
                </select>
                <input type="number" placeholder="Valor" value={newCatValue} onChange={e => setNewCatValue(e.target.value)} className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500" />
                <button onClick={addCategory} className="bg-violet-600 hover:bg-violet-500 text-white rounded-lg flex items-center justify-center transition-colors"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div className="glass-panel p-6 rounded-2xl border-red-500/10">
            <h3 className="text-base font-semibold text-red-400 mb-4">Gastos Fijos Mensuales</h3>
            <div className="space-y-3 mb-4">
              {config.expenses.length === 0 && <p className="text-gray-500 text-sm">No hay gastos fijos configurados.</p>}
              {config.expenses.map(e => (
                <div key={e.id} className="flex items-center gap-3 text-sm">
                  <span className="text-gray-300 flex-1 truncate">{e.name}</span>
                  <span className="text-red-400 font-medium">{e.amount.toLocaleString('es-AR')} {e.currency}</span>
                  <button onClick={() => removeExpense(e.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 pt-4">
              <div className="grid grid-cols-5 gap-2">
                <input type="text" placeholder="Nombre gasto" value={newExpName} onChange={e => setNewExpName(e.target.value)} className="col-span-2 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-red-500" />
                <input type="number" placeholder="Monto" value={newExpAmount} onChange={e => setNewExpAmount(e.target.value)} className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-red-500" />
                <select value={newExpCurrency} onChange={e => setNewExpCurrency(e.target.value as "ARS" | "USD")} className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-red-500">
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
                <button onClick={addExpense} className="bg-red-600 hover:bg-red-500 text-white rounded-lg flex items-center justify-center transition-colors"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
