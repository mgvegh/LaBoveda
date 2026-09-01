"use client";
import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, RefreshCw, DollarSign, TrendingUp, Landmark, ArrowRightLeft, ListChecks, Coins, Users, GripVertical, ChevronUp, ChevronDown, Save, Check, AlertCircle, Calculator, Calendar, Sparkles, ChevronLeft, ChevronRight, GraduationCap, Briefcase, X } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import FloatingCalculator from "@/components/FloatingCalculator";

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

type MonthlyRecord = {
  income?: string;
  completedIds?: string[];
  expenses?: Expense[];
  categories?: Category[];
};

type IncomeConfig = {
  categories: Category[];
  expenses: Expense[];
  lastIncome?: string;
  completedIds?: string[];
  debts?: Debt[];
  baseSalary?: string;
  monthlyRecords?: Record<string, MonthlyRecord>;
};

function getMonthName(month: number, year: number) {
  return new Date(year, month, 1).toLocaleString("es-AR", { month: "long", year: "numeric" });
}

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
  const [config, setConfig] = useState<IncomeConfig>({ categories: DEFAULT_CATEGORIES, expenses: [], completedIds: [], debts: [], monthlyRecords: {} });
  const [totalIncome, setTotalIncome] = useState<string>("");
  const [usdRate, setUsdRate] = useState<number>(0);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  
  // Month selector
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Modal for salary + classes calculation
  const [isSalaryClassesModalOpen, setIsSalaryClassesModalOpen] = useState(false);
  const [calcMonth, setCalcMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [salaryAmount, setSalaryAmount] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [tutorClasses, setTutorClasses] = useState<any[]>([]);

  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<string>("fixed_ars");
  const [newCatValue, setNewCatValue] = useState("");
  const [absorbCategory, setAbsorbCategory] = useState("");

  const [newDebtName, setNewDebtName] = useState("");
  const [newDebtDescription, setNewDebtDescription] = useState("");
  const [newDebtAmount, setNewDebtAmount] = useState("");
  const [newDebtCurrency, setNewDebtCurrency] = useState<"ARS" | "USD">("ARS");
  const [debtorFilter, setDebtorFilter] = useState<string>("");

  const [draggedExpenseIdx, setDraggedExpenseIdx] = useState<number | null>(null);
  const [dragOverExpenseIdx, setDragOverExpenseIdx] = useState<number | null>(null);
  const [canDragExpenseIdx, setCanDragExpenseIdx] = useState<number | null>(null);
  const [draggedCategoryIdx, setDraggedCategoryIdx] = useState<number | null>(null);
  const [dragOverCategoryIdx, setDragOverCategoryIdx] = useState<number | null>(null);
  const [canDragCategoryIdx, setCanDragCategoryIdx] = useState<number | null>(null);

  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const { user } = useAuth();
  const getDocRef = () => user ? doc(db, "users", user.uid, "income_config", "data") : null;

  const selectedMonthKey = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, "0")}`;

  // Load tutor classes for income calculator
  useEffect(() => {
    if (!user) return;
    const col = collection(db, "users", user.uid, "tutorClasses");
    getDocs(col).then(snap => {
      setTutorClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(e => console.error("Error loading tutor classes for income:", e));
  }, [user]);

  const handleManualSave = async () => {
    if (!user) return;
    setSaveStatus("saving");
    const docRef = getDocRef();

    // Explicitly freeze current month's record with its own isolated copy of expenses, categories and income
    const currentMonthRecord: MonthlyRecord = {
      income: totalIncome,
      expenses: activeExpenses,
      categories: activeCategories,
      completedIds: activeCompletedIds,
    };

    const updatedConfig: IncomeConfig = {
      ...config,
      lastIncome: totalIncome,
      monthlyRecords: {
        ...(config.monthlyRecords || {}),
        [selectedMonthKey]: currentMonthRecord,
      }
    };

    setConfig(updatedConfig);

    // 1. Guardar copia local inmediata
    const storageKey = `boveda_income_${user.uid}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(updatedConfig));
    } catch (e) {
      console.warn("Error guardando copia local:", e);
    }

    // 2. Guardar en Firebase Firestore
    try {
      if (docRef) {
        await setDoc(docRef, updatedConfig, { merge: true });
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err) {
      console.error("Error guardando en Firestore:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

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

  // Carga inicial y sincronización segura con Firebase Firestore y fallback local
  useEffect(() => {
    setIsClient(true);
    fetchUsdRate();
    if (!user) return;

    const storageKey = `boveda_income_${user.uid}`;
    let localData: IncomeConfig | null = null;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        localData = JSON.parse(stored);
        if (localData) {
          setConfig({
            categories: localData.categories && localData.categories.length > 0 ? localData.categories : DEFAULT_CATEGORIES,
            expenses: localData.expenses || [],
            completedIds: localData.completedIds || [],
            debts: localData.debts || [],
            baseSalary: localData.baseSalary || "",
            monthlyRecords: localData.monthlyRecords || {},
          });
          const mRec = localData.monthlyRecords?.[selectedMonthKey];
          if (mRec?.income !== undefined) setTotalIncome(mRec.income);
          else if (localData.lastIncome !== undefined) setTotalIncome(localData.lastIncome);
          if (localData.baseSalary) setSalaryAmount(localData.baseSalary);
        }
      }
    } catch (e) {
      console.warn("Error reading local cache for income:", e);
    }

    const docRef = getDocRef();
    if (!docRef) return;
    
    getDoc(docRef).then(snap => {
      if (snap.exists()) {
        const data = snap.data() as IncomeConfig;
        const newCategories = (data.categories && data.categories.length > 0) 
          ? data.categories 
          : (localData?.categories && localData.categories.length > 0 ? localData.categories : DEFAULT_CATEGORIES);
        const newExpenses = data.expenses !== undefined ? data.expenses : (localData?.expenses || []);
        const newCompletedIds = data.completedIds !== undefined ? data.completedIds : (localData?.completedIds || []);
        const newDebts = data.debts !== undefined ? data.debts : (localData?.debts || []);
        const newLastIncome = data.lastIncome !== undefined ? data.lastIncome : (localData?.lastIncome || "");
        const newBaseSalary = data.baseSalary || localData?.baseSalary || "";
        const newMonthlyRecords = data.monthlyRecords || localData?.monthlyRecords || {};

        const mergedConfig: IncomeConfig = {
          categories: newCategories,
          expenses: newExpenses,
          completedIds: newCompletedIds,
          debts: newDebts,
          lastIncome: newLastIncome,
          baseSalary: newBaseSalary,
          monthlyRecords: newMonthlyRecords,
        };

        setConfig(mergedConfig);
        const activeMonthRec = newMonthlyRecords[selectedMonthKey];
        if (activeMonthRec?.income !== undefined) setTotalIncome(activeMonthRec.income);
        else if (newLastIncome) setTotalIncome(newLastIncome);
        if (newBaseSalary) setSalaryAmount(newBaseSalary);

        try {
          localStorage.setItem(storageKey, JSON.stringify(mergedConfig));
        } catch {}
      } else if (localData) {
        setDoc(docRef, { ...localData, lastIncome: localData.lastIncome || totalIncome }, { merge: true }).catch(console.error);
      }
      setIsDataLoaded(true);
    }).catch(err => {
      console.error("Error loading income config from Firestore:", err);
      if (localData) setIsDataLoaded(true);
    });
  }, [user]); // eslint-disable-line

  useEffect(() => {
    if (!isClient || !user || !isDataLoaded) return;
    const docRef = getDocRef();
    if (!docRef) return;

    // Respaldo inmediato en localStorage
    const storageKey = `boveda_income_${user.uid}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...config, lastIncome: totalIncome }));
    } catch (e) {
      console.warn("Error saving local income cache:", e);
    }

    const id = setTimeout(() => {
      setDoc(docRef, { ...config, lastIncome: totalIncome }, { merge: true }).catch(err => {
        console.error("Error saving income config to Firestore:", err);
      });
    }, 800);

    return () => clearTimeout(id);
  }, [config, totalIncome, isClient, user, isDataLoaded]); // eslint-disable-line

  const activeExpenses = useMemo(() => {
    const mRec = config.monthlyRecords?.[selectedMonthKey];
    if (mRec?.expenses !== undefined) return mRec.expenses;
    return config.expenses || [];
  }, [config.monthlyRecords, config.expenses, selectedMonthKey]);

  const activeCategories = useMemo(() => {
    const mRec = config.monthlyRecords?.[selectedMonthKey];
    if (mRec?.categories !== undefined && mRec.categories.length > 0) return mRec.categories;
    return config.categories && config.categories.length > 0 ? config.categories : DEFAULT_CATEGORIES;
  }, [config.monthlyRecords, config.categories, selectedMonthKey]);

  const activeCompletedIds = useMemo(() => {
    const mRec = config.monthlyRecords?.[selectedMonthKey];
    if (mRec?.completedIds !== undefined) return mRec.completedIds;
    return [];
  }, [config.monthlyRecords, selectedMonthKey]);

  const otherConfiguredMonths = useMemo(() => {
    const keys = Object.keys(config.monthlyRecords || {}).filter(k => k !== selectedMonthKey);
    return keys.sort().reverse();
  }, [config.monthlyRecords, selectedMonthKey]);

  const updateCurrentMonthRecord = (
    updater: (current: {
      income: string;
      expenses: Expense[];
      categories: Category[];
      completedIds: string[];
    }) => Partial<MonthlyRecord>
  ) => {
    setConfig(prev => {
      const currentRec = prev.monthlyRecords?.[selectedMonthKey] || {};
      const current = {
        income: currentRec.income !== undefined ? currentRec.income : (prev.lastIncome ?? totalIncome ?? ""),
        expenses: currentRec.expenses !== undefined ? currentRec.expenses : (prev.expenses || []),
        categories: (currentRec.categories && currentRec.categories.length > 0) ? currentRec.categories : (prev.categories && prev.categories.length > 0 ? prev.categories : DEFAULT_CATEGORIES),
        completedIds: currentRec.completedIds !== undefined ? currentRec.completedIds : [],
      };

      const updates = updater(current);
      const updatedMonth: MonthlyRecord = {
        ...current,
        ...updates,
      };

      return {
        ...prev,
        monthlyRecords: {
          ...(prev.monthlyRecords || {}),
          [selectedMonthKey]: updatedMonth,
        }
      };
    });
  };

  const handleSelectMonth = (newMonth: { year: number; month: number }) => {
    setSelectedMonth(newMonth);
    const mKey = `${newMonth.year}-${String(newMonth.month + 1).padStart(2, "0")}`;
    const rec = config.monthlyRecords?.[mKey];
    if (rec?.income !== undefined) {
      setTotalIncome(rec.income);
    } else {
      setTotalIncome("");
    }
  };

  const handleIncomeChange = (val: string) => {
    setTotalIncome(val);
    updateCurrentMonthRecord(() => ({ income: val }));
  };

  const income = parseFloat(totalIncome) || 0;

  const result = useMemo(() => {
    if (usdRate <= 0) return null;

    const totalExpensesARS = activeExpenses.reduce((acc, e) => {
      return acc + (e.currency === "USD" ? e.amount * usdRate : e.amount);
    }, 0);

    const fixedAllocations = activeCategories
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

    const percentageCategories = activeCategories.filter(c => c.type === "percentage");
    const totalPercentDefined = percentageCategories.reduce((acc, c) => acc + c.value, 0);

    const allocations = activeCategories.map(cat => {
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
  }, [income, activeExpenses, activeCategories, usdRate]);

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

  const removeCategory = (id: string) => updateCurrentMonthRecord(curr => ({ categories: curr.categories.filter(c => c.id !== id) }));
  const updateCategory = (id: string, updates: Partial<Category>) => updateCurrentMonthRecord(curr => ({ categories: curr.categories.map(c => c.id === id ? { ...c, ...updates } : c) }));
  const removeExpense = (id: string) => updateCurrentMonthRecord(curr => ({ expenses: curr.expenses.filter(e => e.id !== id) }));
  const updateExpense = (id: string, updates: Partial<Expense>) => updateCurrentMonthRecord(curr => ({ expenses: curr.expenses.map(e => e.id === id ? { ...e, ...updates } : e) }));

  const reorderCategories = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= activeCategories.length || toIndex >= activeCategories.length) return;
    const updated = [...activeCategories];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    updateCurrentMonthRecord(() => ({ categories: updated }));
  };

  const moveCategory = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    reorderCategories(index, targetIndex);
  };

  const reorderExpenses = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= activeExpenses.length || toIndex >= activeExpenses.length) return;
    const updated = [...activeExpenses];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    updateCurrentMonthRecord(() => ({ expenses: updated }));
  };

  const moveExpense = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    reorderExpenses(index, targetIndex);
  };

  const toggleCompleted = (id: string) => {
    const isCompleted = activeCompletedIds.includes(id);
    const updatedList = isCompleted ? activeCompletedIds.filter(i => i !== id) : [...activeCompletedIds, id];
    updateCurrentMonthRecord(() => ({ completedIds: updatedList }));
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
    const cat = activeCategories.find(c => c.id === absorbCategory);
    if (!cat) return;
    
    let amountToAdd = result.unallocated;
    if (cat.type === "fixed_usd") amountToAdd = amountToAdd / (usdRate || 1);
    
    updateCurrentMonthRecord(curr => ({
      categories: curr.categories.map(c => 
        c.id === absorbCategory ? { ...c, value: Math.round((c.value + amountToAdd) * 100) / 100 } : c
      )
    }));
    setAbsorbCategory("");
  };

  const copySalidasFromMonth = (sourceMonthKey: string) => {
    const sourceRec = config.monthlyRecords?.[sourceMonthKey];
    const sourceExpenses = sourceRec?.expenses !== undefined ? sourceRec.expenses : (config.expenses || []);
    const sourceCategories = sourceRec?.categories !== undefined ? sourceRec.categories : (config.categories || DEFAULT_CATEGORIES);
    
    updateCurrentMonthRecord(() => ({
      expenses: JSON.parse(JSON.stringify(sourceExpenses)),
      categories: JSON.parse(JSON.stringify(sourceCategories)),
    }));
  };

  const calcMonthKey = `${calcMonth.year}-${String(calcMonth.month + 1).padStart(2, "0")}`;
  const calcMonthClasses = tutorClasses.filter(c => c.dateTime?.startsWith(calcMonthKey));
  const calcClassesTotalARS = calcMonthClasses.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const calcClassesHours = calcMonthClasses.reduce((acc, c) => acc + (Number(c.duration) || 60), 0) / 60;
  const calcSalaryNum = parseFloat(salaryAmount) || 0;
  const calcExtraNum = parseFloat(extraAmount) || 0;
  const computedCombinedIncome = calcSalaryNum + calcClassesTotalARS + calcExtraNum;

  const handleApplySalaryClasses = () => {
    handleIncomeChange(String(Math.round(computedCombinedIncome)));
    setConfig(prev => ({
      ...prev,
      baseSalary: salaryAmount,
    }));
    setIsSalaryClassesModalOpen(false);
  };

  if (!isClient) return null;

  return (
    <div className="space-y-6">
      {/* 0. NAVEGADOR DE MES */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/40 border border-white/10 p-3 sm:px-4 rounded-2xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSelectMonth(selectedMonth.month === 0 ? { year: selectedMonth.year - 1, month: 11 } : { year: selectedMonth.year, month: selectedMonth.month - 1 })}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
            title="Mes anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 px-1">
            <Calendar className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-bold text-white capitalize min-w-[130px] text-center">
              {getMonthName(selectedMonth.month, selectedMonth.year)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleSelectMonth(selectedMonth.month === 11 ? { year: selectedMonth.year + 1, month: 0 } : { year: selectedMonth.year, month: selectedMonth.month + 1 })}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
            title="Mes siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {(selectedMonth.year !== new Date().getFullYear() || selectedMonth.month !== new Date().getMonth()) && (
            <button
              type="button"
              onClick={() => handleSelectMonth({ year: new Date().getFullYear(), month: new Date().getMonth() })}
              className="text-xs text-violet-400 hover:text-violet-300 bg-violet-500/10 px-3 py-1.5 rounded-xl border border-violet-500/20 font-bold transition-all cursor-pointer"
            >
              Ir a Mes Actual
            </button>
          )}
          {(() => {
            const activeSalidas = [
              ...activeExpenses.map(e => ({ id: e.id, name: e.name })),
              ...(result?.allocations 
                ? result.allocations.map(a => ({ id: a.id, name: a.name })) 
                : activeCategories.map(c => ({ id: c.id, name: c.name })))
            ];
            const totalSalidas = activeSalidas.length;
            const completedCount = activeSalidas.filter(s => activeCompletedIds.includes(s.id)).length;
            const pendingSalidas = Math.max(0, totalSalidas - completedCount);
            return (
              <span className="text-xs text-gray-400">
                {totalSalidas === 0 ? (
                  <span className="text-gray-500">Sin salidas</span>
                ) : pendingSalidas === 0 ? (
                  <span className="text-emerald-400 font-medium">✓ Salidas al día</span>
                ) : (
                  <span>
                    <strong className="text-amber-400 font-bold">{pendingSalidas}</strong> {pendingSalidas === 1 ? "salida pendiente" : "salidas pendientes"}
                  </span>
                )}
              </span>
            );
          })()}
        </div>
      </div>

      {/* 1. INPUT DE INGRESO */}
      <div className="glass-panel p-6 rounded-2xl border-violet-500/20 shadow-lg shadow-violet-500/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-violet-400" />
              Ingreso de {getMonthName(selectedMonth.month, selectedMonth.year)}
            </h2>
            <p className="text-sm text-gray-400">¿Cuánta plata entra para este mes?</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleManualSave}
              disabled={saveStatus === "saving"}
              className={clsx(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer h-fit",
                saveStatus === "saved" 
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                  : saveStatus === "error"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border border-violet-400/30"
              )}
            >
              {saveStatus === "saving" ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : saveStatus === "saved" ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>¡Guardado en Firebase!</span>
                </>
              ) : saveStatus === "error" ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Guardado localmente</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Guardar Cambios</span>
                </>
              )}
            </button>

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
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative max-w-md flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-500">$</span>
            <input
              type="number"
              placeholder="Ej: 2.500.000"
              value={totalIncome}
              onChange={e => handleIncomeChange(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl pl-10 pr-4 py-4 text-3xl font-bold text-white focus:outline-none focus:border-violet-500 transition-colors shadow-inner"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setSalaryAmount(config.baseSalary || "");
              setCalcMonth(selectedMonth);
              setIsSalaryClassesModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 text-emerald-300 border border-emerald-500/30 font-bold text-xs shadow-lg shadow-emerald-500/5 active:scale-95 transition-all cursor-pointer shrink-0"
            title="Calcular ingreso sumando Clases y Sueldo"
          >
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Autocompletar</span>
          </button>
        </div>

        {usdRate > 0 && income > 0 && (
          <p className="text-sm text-gray-500 mt-3 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" />
            Equivale a <strong>USD {(income / usdRate).toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
          </p>
        )}
      </div>

      {/* Modal Autocompletar Sueldo + Clases */}
      {isSalaryClassesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="bg-zinc-950 border border-emerald-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl shadow-black space-y-5"
            style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.8), 0 0 35px rgba(16, 185, 129, 0.15)" }}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Sparkles className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Calcular Ingreso (Clases + Sueldo)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSalaryClassesModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selector de Mes de Clases */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 uppercase font-medium">Mes de Clases a Sumar</label>
              <div className="flex items-center justify-between bg-black/40 border border-white/10 p-2 rounded-xl">
                <button
                  type="button"
                  onClick={() => setCalcMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 })}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-emerald-300 capitalize">
                  {getMonthName(calcMonth.month, calcMonth.year)}
                </span>
                <button
                  type="button"
                  onClick={() => setCalcMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 })}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs px-1 text-gray-400">
                <span className="flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5 text-emerald-400" />
                  {calcMonthClasses.length} clases ({calcClassesHours.toFixed(1)} hs)
                </span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  ${calcClassesTotalARS.toLocaleString("es-AR")}
                </span>
              </div>
            </div>

            {/* Sueldo Base */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 uppercase font-medium flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-violet-400" />
                Sueldo Fijo / Salario (ARS)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                <input
                  type="number"
                  value={salaryAmount}
                  onChange={(e) => setSalaryAmount(e.target.value)}
                  placeholder="Ej: 1800000"
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>

            {/* Extras */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 uppercase font-medium">Otros ingresos / Extras (Opcional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                <input
                  type="number"
                  value={extraAmount}
                  onChange={(e) => setExtraAmount(e.target.value)}
                  placeholder="Ej: 50000"
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>

            {/* Total Preview */}
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Sueldo Base:</span>
                <span className="font-mono text-white">${calcSalaryNum.toLocaleString("es-AR")}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>Clases ({getMonthName(calcMonth.month, calcMonth.year)}):</span>
                <span className="font-mono text-emerald-300">+${calcClassesTotalARS.toLocaleString("es-AR")}</span>
              </div>
              {calcExtraNum > 0 && (
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Extras:</span>
                  <span className="font-mono text-white">+${calcExtraNum.toLocaleString("es-AR")}</span>
                </div>
              )}
              <div className="pt-2 border-t border-white/10 flex justify-between items-center text-sm font-bold">
                <span className="text-white">Total a Aplicar:</span>
                <span className="text-lg font-mono text-emerald-400">
                  ${Math.round(computedCombinedIncome).toLocaleString("es-AR")}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsSalaryClassesModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplySalaryClasses}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
              >
                Aplicar como Ingreso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. HOJA DE RUTA (SALIDAS) */}
      {result && (income > 0 || result.isNeededMode) && (
        <div className="space-y-6 w-full">
          <div className="glass-panel overflow-hidden rounded-2xl border-emerald-500/20">
              <div className="bg-emerald-500/10 px-6 py-4 border-b border-emerald-500/10 flex justify-between items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-emerald-400 flex items-center gap-2">
                    <ListChecks className="w-5 h-5" /> {result.isNeededMode ? "Salidas Fijas (Ingreso Necesario)" : "Salidas Programadas"}
                  </h3>
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-medium capitalize">
                    {getMonthName(selectedMonth.month, selectedMonth.year)}
                  </span>
                </div>
                <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-full font-mono uppercase">Resumen en Pesos</span>
              </div>
              
              <div className="divide-y divide-white/5">
                {/* Gastos Fijos (Como parte de las Salidas) */}
                {activeExpenses.map(e => {
                  const amount = e.currency === "USD" ? e.amount * usdRate : e.amount;
                  const isCompleted = activeCompletedIds.includes(e.id);
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
                  const isCompleted = activeCompletedIds.includes(a.id);
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
                          {activeCategories.filter(c => c.type !== "percentage").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-400" />
              Configurar Salidas
            </h3>
            <span className="text-xs bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2.5 py-0.5 rounded-full font-medium capitalize">
              {getMonthName(selectedMonth.month, selectedMonth.year)}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {otherConfiguredMonths.length > 0 && (
              <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 px-2.5 py-1.5 rounded-xl text-xs">
                <span className="text-gray-400">Copiar de:</span>
                <select
                  onChange={e => {
                    if (e.target.value) {
                      const optText = e.target.options[e.target.selectedIndex].text;
                      if (confirm(`¿Copiar las salidas de ${optText} a ${getMonthName(selectedMonth.month, selectedMonth.year)}?`)) {
                        copySalidasFromMonth(e.target.value);
                      }
                      e.target.value = "";
                    }
                  }}
                  defaultValue=""
                  className="bg-transparent text-violet-300 font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="" disabled className="bg-[#09090b]">Seleccionar mes...</option>
                  {otherConfiguredMonths.map(k => {
                    const [y, m] = k.split("-");
                    return (
                      <option key={k} value={k} className="bg-[#09090b] capitalize">
                        {getMonthName(parseInt(m) - 1, parseInt(y))}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            <button
              onClick={handleManualSave}
              disabled={saveStatus === "saving"}
              className={clsx(
                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer",
                saveStatus === "saved" 
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                  : saveStatus === "error"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10"
              )}
            >
              {saveStatus === "saving" ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : saveStatus === "saved" ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>¡Guardado!</span>
                </>
              ) : saveStatus === "error" ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Guardado local</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 text-amber-400" />
                  <span>Guardar Salidas</span>
                </>
              )}
            </button>
          </div>
        </div>
        
        <div className="glass-panel p-6 rounded-2xl border-white/5 w-full">
          <div className="space-y-3 mb-6">
            {activeExpenses.length === 0 && activeCategories.length === 0 && (
              <p className="text-gray-500 text-xs py-4 text-center">No hay salidas configuradas para este mes.</p>
            )}
            
            {/* Gastos Fijos */}
            {activeExpenses.map((e, idx) => {
              const isDragging = draggedExpenseIdx === idx;
              const isOver = dragOverExpenseIdx === idx && draggedExpenseIdx !== idx;
              return (
                <div
                  key={e.id}
                  draggable={canDragExpenseIdx === idx}
                  onDragStart={(ev) => {
                    setDraggedExpenseIdx(idx);
                    ev.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; if (dragOverExpenseIdx !== idx) setDragOverExpenseIdx(idx); }}
                  onDragLeave={() => { if (dragOverExpenseIdx === idx) setDragOverExpenseIdx(null); }}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    if (draggedExpenseIdx !== null) reorderExpenses(draggedExpenseIdx, idx);
                    setDraggedExpenseIdx(null);
                    setDragOverExpenseIdx(null);
                    setCanDragExpenseIdx(null);
                  }}
                  onDragEnd={() => {
                    setDraggedExpenseIdx(null);
                    setDragOverExpenseIdx(null);
                    setCanDragExpenseIdx(null);
                  }}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 text-sm bg-black/20 p-3 rounded-xl border transition-all duration-200 group ${
                    isDragging ? "opacity-40 border-dashed border-red-500/50 scale-[0.98]" :
                    isOver ? "border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20 ring-1 ring-red-500/50" :
                    "border-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex items-center gap-0.5 shrink-0">
                      <div
                        className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-white transition-colors p-1 select-none"
                        title="Arrastrar para reordenar"
                        onMouseDown={() => setCanDragExpenseIdx(idx)}
                        onMouseUp={() => setCanDragExpenseIdx(null)}
                        onTouchStart={() => setCanDragExpenseIdx(idx)}
                        onTouchEnd={() => setCanDragExpenseIdx(null)}
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col opacity-40 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveExpense(idx, "up")}
                          className="text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed p-0.5"
                          title="Mover arriba"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === activeExpenses.length - 1}
                          onClick={() => moveExpense(idx, "down")}
                          className="text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed p-0.5"
                          title="Mover abajo"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="w-8 h-8 flex items-center justify-center bg-red-500/10 rounded-lg text-red-400 shrink-0">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={e.name}
                        onChange={ev => updateExpense(e.id, { name: ev.target.value })}
                        className="bg-transparent text-gray-200 font-bold focus:outline-none focus:border-b focus:border-red-500/50 w-full"
                      />
                      <div className="text-[10px] text-gray-500 uppercase">Gasto Fijo</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                    <div className="flex items-center bg-white/5 border border-white/10 rounded-lg px-2 flex-1 sm:flex-initial sm:w-40">
                      <span className="text-gray-500 font-bold mr-1">$</span>
                      <input
                        type="number"
                        value={e.amount || ""}
                        onChange={ev => updateExpense(e.id, { amount: parseFloat(ev.target.value) || 0 })}
                        className="w-full bg-transparent py-1.5 text-red-400 text-right font-mono font-bold text-xs focus:outline-none select-text cursor-text"
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
                    <button 
                      onClick={() => removeExpense(e.id)} 
                      className="text-gray-500 hover:text-red-400 transition-colors p-2 rounded-lg bg-white/5 sm:bg-transparent sm:p-1 sm:opacity-0 group-hover:opacity-100 shrink-0 cursor-pointer" 
                      title="Eliminar gasto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Categorías */}
            {activeCategories.map((c, idx) => {
              const isDragging = draggedCategoryIdx === idx;
              const isOver = dragOverCategoryIdx === idx && draggedCategoryIdx !== idx;
              return (
                <div
                  key={c.id}
                  draggable={canDragCategoryIdx === idx}
                  onDragStart={(ev) => {
                    setDraggedCategoryIdx(idx);
                    ev.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; if (dragOverCategoryIdx !== idx) setDragOverCategoryIdx(idx); }}
                  onDragLeave={() => { if (dragOverCategoryIdx === idx) setDragOverCategoryIdx(null); }}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    if (draggedCategoryIdx !== null) reorderCategories(draggedCategoryIdx, idx);
                    setDraggedCategoryIdx(null);
                    setDragOverCategoryIdx(null);
                    setCanDragCategoryIdx(null);
                  }}
                  onDragEnd={() => {
                    setDraggedCategoryIdx(null);
                    setDragOverCategoryIdx(null);
                    setCanDragCategoryIdx(null);
                  }}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 text-sm bg-black/20 p-3 rounded-xl border transition-all duration-200 group ${
                    isDragging ? "opacity-40 border-dashed border-violet-500/50 scale-[0.98]" :
                    isOver ? "border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/20 ring-1 ring-violet-500/50" :
                    "border-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex items-center gap-0.5 shrink-0">
                      <div
                        className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-white transition-colors p-1 select-none"
                        title="Arrastrar para reordenar"
                        onMouseDown={() => setCanDragCategoryIdx(idx)}
                        onMouseUp={() => setCanDragCategoryIdx(null)}
                        onTouchStart={() => setCanDragCategoryIdx(idx)}
                        onTouchEnd={() => setCanDragCategoryIdx(null)}
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col opacity-40 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveCategory(idx, "up")}
                          className="text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed p-0.5"
                          title="Mover arriba"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === activeCategories.length - 1}
                          onClick={() => moveCategory(idx, "down")}
                          className="text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed p-0.5"
                          title="Mover abajo"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg text-lg shrink-0">
                      {c.icon}
                    </div>
                    <div className="flex-1 min-w-0">
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
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                    <div className="flex items-center bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 flex-1 sm:flex-initial sm:w-44">
                      <input
                        type="number"
                        value={c.value || ""}
                        onChange={e => updateCategory(c.id, { value: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-transparent text-white text-center font-bold text-xs focus:outline-none focus:border-violet-500 select-text cursor-text"
                      />
                      <span className="text-[10px] text-gray-500 font-bold ml-1 uppercase">
                        {c.type === "percentage" ? "%" : c.type === "fixed_usd" ? "USD" : "ARS"}
                      </span>
                    </div>
                    <button 
                      onClick={() => removeCategory(c.id)} 
                      className="text-gray-500 hover:text-red-400 transition-colors p-2 rounded-lg bg-white/5 sm:bg-transparent sm:p-1 sm:opacity-0 group-hover:opacity-100 shrink-0 cursor-pointer" 
                      title="Eliminar salida"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:grid sm:grid-cols-6 gap-2 bg-black/40 p-3 rounded-xl border border-white/5">
            <input 
              type="text" 
              placeholder="Nombre" 
              value={newCatName} 
              onChange={e => setNewCatName(e.target.value)} 
              className="bg-transparent text-white text-sm focus:outline-none px-2 py-1.5 sm:col-span-2" 
            />
            <select 
              value={newCatType} 
              onChange={e => setNewCatType(e.target.value)} 
              className="bg-transparent text-white text-xs focus:outline-none cursor-pointer px-2 py-1.5 sm:col-span-2"
            >
              <option value="fixed_ars" className="bg-[#09090b]">ARS FIJO</option>
              <option value="fixed_usd" className="bg-[#09090b]">USD FIJO</option>
              <option value="percentage" className="bg-[#09090b]">% DEL REMANENTE</option>
            </select>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input 
                type="number" 
                placeholder="Monto / %" 
                value={newCatValue} 
                onChange={e => setNewCatValue(e.target.value)} 
                className="flex-1 bg-transparent text-white text-sm focus:outline-none px-2 py-1.5 text-center sm:text-left" 
              />
              <button 
                onClick={() => {
                  if (!newCatName || !newCatValue) return;
                  const idx = activeCategories.length;
                  const newCat: Category = {
                    id: uid(),
                    name: newCatName,
                    type: newCatType as CategoryType,
                    value: parseFloat(newCatValue) || 0,
                    color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
                    icon: "💰"
                  };
                  updateCurrentMonthRecord(curr => ({
                    categories: [...curr.categories, newCat]
                  }));
                  setNewCatName("");
                  setNewCatValue("");
                }} 
                className="bg-violet-600/20 hover:bg-violet-600 text-violet-400 hover:text-white rounded-lg flex items-center justify-center transition-all p-2 w-8 h-8 shrink-0 cursor-pointer"
                title="Añadir salida"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
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
              <div key={d.id} className={`flex flex-col sm:grid sm:grid-cols-12 gap-3 sm:items-center text-sm bg-black/20 p-3 rounded-xl border border-white/5 group transition-all duration-300 ${d.isPaid ? 'opacity-40 grayscale' : ''}`}>
                {/* Checkbox + Deudor + Concepto */}
                <div className="flex items-center gap-3 flex-1 min-w-0 sm:col-span-8 sm:grid sm:grid-cols-8 sm:gap-3">
                  {/* Checkbox */}
                  <div className="shrink-0 sm:col-span-1 flex justify-start sm:justify-center">
                    <button 
                      onClick={() => toggleDebtPaid(d.id)} 
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${d.isPaid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-500 hover:text-white hover:bg-white/10'}`} 
                      title={d.isPaid ? "Marcar como no cobrado" : "Marcar como cobrado"}
                    >
                      <CheckCircleIcon />
                    </button>
                  </div>
                  {/* Deudor */}
                  <div className="flex-1 sm:col-span-2 min-w-0">
                    <input
                      type="text"
                      value={d.debtorName}
                      onChange={ev => updateDebt(d.id, { debtorName: ev.target.value })}
                      className={`bg-transparent text-gray-200 font-bold focus:outline-none focus:border-b focus:border-indigo-500/50 w-full ${d.isPaid ? 'line-through' : ''}`}
                      placeholder="Deudor"
                    />
                    <div className="text-[10px] text-gray-500 uppercase">Deudor</div>
                  </div>
                  {/* Concepto */}
                  <div className="flex-1 sm:col-span-5 min-w-0">
                    <input
                      type="text"
                      value={d.description || ""}
                      onChange={ev => updateDebt(d.id, { description: ev.target.value })}
                      className={`bg-transparent text-gray-300 focus:outline-none focus:border-b focus:border-indigo-500/50 w-full ${d.isPaid ? 'line-through' : ''}`}
                      placeholder="Concepto"
                    />
                    <div className="text-[10px] text-gray-500 uppercase">Concepto</div>
                  </div>
                </div>

                {/* Monto + Acciones */}
                <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:col-span-4 sm:grid sm:grid-cols-4 sm:gap-3">
                  <div className="flex items-center bg-white/5 border border-white/10 rounded-lg px-2 flex-1 sm:col-span-3 sm:w-full">
                    <span className="text-gray-500 font-bold mr-1">$</span>
                    <input
                      type="number"
                      value={d.amount || ""}
                      onChange={ev => updateDebt(d.id, { amount: parseFloat(ev.target.value) || 0 })}
                      className="w-full bg-transparent py-1.5 text-indigo-400 text-right font-mono font-bold text-xs focus:outline-none"
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
                  <div className="shrink-0 sm:col-span-1 flex justify-end sm:justify-center">
                    <button onClick={() => removeDebt(d.id)} className="text-gray-500 hover:text-red-400 transition-colors p-2 rounded-lg bg-white/5 sm:bg-transparent sm:p-1" title="Eliminar deuda"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Formulario de carga rápida para nuevas deudas */}
          <div className="flex flex-col sm:grid sm:grid-cols-12 gap-3 sm:items-center bg-black/40 p-3 rounded-xl border border-white/5">
            <div className="hidden sm:block sm:col-span-1" />
            <div className="flex-1 sm:col-span-2 min-w-0">
              <input 
                type="text" 
                placeholder="Deudor" 
                value={newDebtName} 
                onChange={e => setNewDebtName(e.target.value)} 
                className="bg-transparent text-white text-sm focus:outline-none w-full px-2 py-1.5" 
              />
              <div className="text-[10px] text-gray-500 uppercase sm:hidden px-2 mt-0.5">Deudor</div>
            </div>
            <div className="flex-1 sm:col-span-5 min-w-0">
              <input 
                type="text" 
                placeholder="Concepto (ej: Cena, Alquiler)" 
                value={newDebtDescription} 
                onChange={e => setNewDebtDescription(e.target.value)} 
                className="bg-transparent text-white text-sm focus:outline-none w-full px-2 py-1.5" 
              />
              <div className="text-[10px] text-gray-500 uppercase sm:hidden px-2 mt-0.5">Concepto</div>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:col-span-4 sm:grid sm:grid-cols-4 sm:gap-3">
              <div className="flex items-center bg-white/5 border border-white/10 rounded-lg px-2 flex-1 sm:col-span-3 sm:w-full">
                <span className="text-gray-500 font-bold mr-1">$</span>
                <input 
                  type="number" 
                  placeholder="Monto" 
                  value={newDebtAmount} 
                  onChange={e => setNewDebtAmount(e.target.value)} 
                  className="w-full bg-transparent py-1.5 text-white text-right font-mono font-bold text-xs focus:outline-none" 
                />
                <select 
                  value={newDebtCurrency} 
                  onChange={e => setNewDebtCurrency(e.target.value as "ARS"|"USD")} 
                  className="ml-1 bg-transparent text-white text-xs font-mono font-bold focus:outline-none cursor-pointer"
                >
                  <option value="ARS" className="bg-[#09090b]">ARS</option>
                  <option value="USD" className="bg-[#09090b]">USD</option>
                </select>
              </div>
              <div className="shrink-0 sm:col-span-1 flex justify-end sm:justify-center">
                <button 
                  onClick={() => {
                    if (!newDebtName || !newDebtAmount) return;
                    addDebt(newDebtName, newDebtDescription, parseFloat(newDebtAmount), newDebtCurrency);
                    setNewDebtName(""); 
                    setNewDebtDescription("");
                    setNewDebtAmount("");
                  }} 
                  className="bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-lg flex items-center justify-center transition-all p-2 w-8 h-8 shrink-0"
                  title="Añadir deuda"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Calculator */}
      <FloatingCalculator
        isOpen={isCalculatorOpen}
        onToggle={setIsCalculatorOpen}
      />
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
