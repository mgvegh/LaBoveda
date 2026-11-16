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
  paidAmounts?: Record<string, number>;
};

type IncomeConfig = {
  categories: Category[];
  expenses: Expense[];
  lastIncome?: string;
  completedIds?: string[];
  paidAmounts?: Record<string, number>;
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
      paidAmounts: activePaidAmounts,
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
            paidAmounts: localData.paidAmounts || {},
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
        const newPaidAmounts = data.paidAmounts !== undefined ? data.paidAmounts : (localData?.paidAmounts || {});
        const newDebts = data.debts !== undefined ? data.debts : (localData?.debts || []);
        const newLastIncome = data.lastIncome !== undefined ? data.lastIncome : (localData?.lastIncome || "");
        const newBaseSalary = data.baseSalary || localData?.baseSalary || "";
        const newMonthlyRecords = data.monthlyRecords || localData?.monthlyRecords || {};

        const mergedConfig: IncomeConfig = {
          categories: newCategories,
          expenses: newExpenses,
          completedIds: newCompletedIds,
          paidAmounts: newPaidAmounts,
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
    return config.completedIds || [];
  }, [config.monthlyRecords, config.completedIds, selectedMonthKey]);

  const activePaidAmounts = useMemo<Record<string, number>>(() => {
    const mRec = config.monthlyRecords?.[selectedMonthKey];
    if (mRec?.paidAmounts !== undefined) return mRec.paidAmounts;
    return config.paidAmounts || {};
  }, [config.monthlyRecords, config.paidAmounts, selectedMonthKey]);

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
      paidAmounts: Record<string, number>;
    }) => Partial<MonthlyRecord>
  ) => {
    setConfig(prev => {
      const currentRec = prev.monthlyRecords?.[selectedMonthKey] || {};
      const current = {
        income: currentRec.income !== undefined ? currentRec.income : (prev.lastIncome ?? totalIncome ?? ""),
        expenses: currentRec.expenses !== undefined ? currentRec.expenses : (prev.expenses || []),
        categories: (currentRec.categories && currentRec.categories.length > 0) ? currentRec.categories : (prev.categories && prev.categories.length > 0 ? prev.categories : DEFAULT_CATEGORIES),
        completedIds: currentRec.completedIds !== undefined ? currentRec.completedIds : (prev.completedIds || []),
        paidAmounts: currentRec.paidAmounts !== undefined ? currentRec.paidAmounts : (prev.paidAmounts || {}),
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

    // 1. Gastos (expenses): si están pagados usan el monto congelado en ARS, si no varían con el dólar si son USD
    const expensesWithAmounts = activeExpenses.map(e => {
      const isCompleted = activeCompletedIds.includes(e.id);
      const isFrozen = isCompleted && activePaidAmounts[e.id] !== undefined;
      const amountARS = isFrozen 
        ? activePaidAmounts[e.id] 
        : (e.currency === "USD" ? e.amount * usdRate : e.amount);
      return {
        ...e,
        amountARS,
        isFrozen,
        isCompleted
      };
    });

    const totalExpensesARS = expensesWithAmounts.reduce((acc, e) => acc + e.amountARS, 0);

    // 2. Asignaciones fijas (fixed_usd, fixed_ars): si están pagadas quedan fijas en ARS, si no varían con el dólar
    const fixedAllocations = activeCategories
      .filter(c => c.type !== "percentage")
      .map(c => {
        const isCompleted = activeCompletedIds.includes(c.id);
        const isFrozen = isCompleted && activePaidAmounts[c.id] !== undefined;
        const amountARS = isFrozen
          ? activePaidAmounts[c.id]
          : (c.type === "fixed_usd" ? c.value * usdRate : c.value);
        return {
          ...c,
          amountARS,
          isFrozen,
          isCompleted
        };
      });

    const totalFixedAllocations = fixedAllocations.reduce((acc, c) => acc + c.amountARS, 0);

    const isNeededMode = income <= 0;

    if (isNeededMode) {
      const paidExpensesARS = expensesWithAmounts
        .filter(e => e.isCompleted)
        .reduce((acc, e) => acc + e.amountARS, 0);
      const paidAllocationsARS = fixedAllocations
        .filter(a => a.isCompleted)
        .reduce((acc, a) => acc + a.amountARS, 0);
      const totalPaidARS = paidExpensesARS + paidAllocationsARS;

      return {
        isNeededMode,
        totalNeededARS: totalExpensesARS + totalFixedAllocations,
        totalExpensesARS,
        expensesWithAmounts,
        allocations: fixedAllocations.map(a => ({ ...a, pctOfTotal: 0, isFrozen: a.isFrozen, isCompleted: a.isCompleted })),
        unallocated: 0,
        afterExpenses: 0,
        totalPaidARS,
        remainingIncome: 0,
      };
    }

    const afterExpenses = Math.max(0, income - totalExpensesARS);
    const afterFixed = Math.max(0, afterExpenses - totalFixedAllocations);

    // 3. Categorías porcentuales:
    // Las que ya se pagaron quedan fijas con su monto congelado; el resto del remanente se distribuye entre las pendientes
    const percentageCategories = activeCategories.filter(c => c.type === "percentage");

    let paidPercentageTotalARS = 0;
    const frozenPercentageAllocations: Record<string, number> = {};

    percentageCategories.forEach(cat => {
      const isCompleted = activeCompletedIds.includes(cat.id);
      if (isCompleted && activePaidAmounts[cat.id] !== undefined) {
        frozenPercentageAllocations[cat.id] = activePaidAmounts[cat.id];
        paidPercentageTotalARS += activePaidAmounts[cat.id];
      }
    });

    const remainingForUnpaidPercentages = Math.max(0, afterFixed - paidPercentageTotalARS);
    const unpaidPercentageCategories = percentageCategories.filter(c => frozenPercentageAllocations[c.id] === undefined);
    const unpaidPercentDefined = unpaidPercentageCategories.reduce((acc, c) => acc + c.value, 0);

    const allocations = activeCategories.map(cat => {
      const isCompleted = activeCompletedIds.includes(cat.id);
      if (cat.type === "percentage") {
        let amount = 0;
        const isFrozen = frozenPercentageAllocations[cat.id] !== undefined;
        if (isFrozen) {
          amount = frozenPercentageAllocations[cat.id];
        } else {
          const weight = unpaidPercentDefined > 0 ? (cat.value / unpaidPercentDefined) : 0;
          amount = weight * remainingForUnpaidPercentages;
        }
        return {
          ...cat,
          amountARS: amount,
          pctOfTotal: income > 0 ? (amount / income) * 100 : 0,
          isFrozen,
          isCompleted,
        };
      } else {
        const fixed = fixedAllocations.find(f => f.id === cat.id);
        const amount = fixed?.amountARS ?? 0;
        return {
          ...cat,
          amountARS: amount,
          pctOfTotal: income > 0 ? (amount / income) * 100 : 0,
          isFrozen: fixed?.isFrozen ?? false,
          isCompleted,
        };
      }
    });

    const totalAllocated = allocations.reduce((a, c) => a + c.amountARS, 0);
    const unallocated = income - totalExpensesARS - totalAllocated;

    // Métricas de pagos y saldo restante del ingreso
    const paidExpensesARS = expensesWithAmounts
      .filter(e => e.isCompleted)
      .reduce((acc, e) => acc + e.amountARS, 0);
    const paidAllocationsARS = allocations
      .filter(a => a.isCompleted)
      .reduce((acc, a) => acc + a.amountARS, 0);
    const totalPaidARS = paidExpensesARS + paidAllocationsARS;
    const remainingIncome = Math.max(0, income - totalPaidARS);

    return {
      isNeededMode,
      totalNeededARS: 0,
      allocations,
      expensesWithAmounts,
      totalExpensesARS,
      unallocated,
      afterExpenses,
      totalPaidARS,
      remainingIncome,
    };
  }, [income, activeExpenses, activeCategories, usdRate, activeCompletedIds, activePaidAmounts]);

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

  const toggleCompleted = (id: string, currentAmountARS?: number) => {
    const isCompleted = activeCompletedIds.includes(id);
    const updatedList = isCompleted ? activeCompletedIds.filter(i => i !== id) : [...activeCompletedIds, id];
    const updatedPaidAmounts = { ...activePaidAmounts };

    if (isCompleted) {
      delete updatedPaidAmounts[id];
    } else {
      let freezeAmount = currentAmountARS;
      if (freezeAmount === undefined) {
        const exp = result?.expensesWithAmounts?.find(e => e.id === id);
        if (exp) {
          freezeAmount = exp.amountARS;
        } else {
          const alloc = result?.allocations?.find(a => a.id === id);
          if (alloc) {
            freezeAmount = alloc.amountARS;
          } else {
            const cat = activeCategories.find(c => c.id === id);
            if (cat) {
              freezeAmount = cat.type === "fixed_usd" ? cat.value * (usdRate || 0) : cat.value;
            }
          }
        }
      }
      updatedPaidAmounts[id] = Math.round((freezeAmount || 0) * 100) / 100;
    }

    updateCurrentMonthRecord(() => ({
      completedIds: updatedList,
      paidAmounts: updatedPaidAmounts,
    }));
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
      <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-medium text-[#ededed] mb-1 flex items-center gap-2">
              <Landmark className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
              Ingreso de {getMonthName(selectedMonth.month, selectedMonth.year)}
            </h2>
            <p className="text-sm text-[#a1a1a6]">Monto disponible para planificar el mes</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleManualSave}
              disabled={saveStatus === "saving"}
              className={clsx(
                "flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                saveStatus === "saved"
                  ? "bg-[#4cc38a]/15 text-[#4cc38a] border border-[#4cc38a]/30"
                  : saveStatus === "error"
                  ? "bg-[#d99b43]/15 text-[#d99b43] border border-[#d99b43]/30"
                  : "bg-[#d99b43] hover:bg-[#e3a852] text-[#141415]"
              )}
            >
              {saveStatus === "saving" ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                  <span>Guardando...</span>
                </>
              ) : saveStatus === "saved" ? (
                <>
                  <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Guardado</span>
                </>
              ) : saveStatus === "error" ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Guardado local</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Guardar cambios</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 h-9">
              <span className="text-xs text-[#85858b]">USD</span>
              <div className="flex items-center gap-1 font-mono tabular">
                <span className="text-[#85858b] text-xs">$</span>
                <input
                  type="number"
                  value={usdRate || ""}
                  onChange={(e) => setUsdRate(Number(e.target.value))}
                  className="w-16 bg-transparent text-sm text-[#ededed] font-mono focus:outline-none"
                />
              </div>
              <button onClick={fetchUsdRate} className={`text-[#85858b] hover:text-[#ededed] transition-colors ${isFetchingRate ? "animate-spin text-[#d99b43]" : ""}`} title="Actualizar cotización">
                <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative max-w-md flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-mono text-[#85858b]">$</span>
            <input
              type="number"
              placeholder="2500000"
              value={totalIncome}
              onChange={e => handleIncomeChange(e.target.value)}
              className="w-full bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-xl pl-10 pr-4 py-3.5 text-2xl sm:text-3xl font-mono font-medium text-[#ededed] tabular focus:outline-none focus:border-[#d99b43] transition-colors"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setSalaryAmount(config.baseSalary || "");
              setCalcMonth(selectedMonth);
              setIsSalaryClassesModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-[#232325] hover:bg-[#2c2c2f] text-[#ededed] border border-[rgba(237,237,237,0.08)] font-medium text-xs transition-colors cursor-pointer shrink-0"
            title="Calcular ingreso sumando clases y sueldo"
          >
            <Calculator className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
            <span>Autocompletar</span>
          </button>
        </div>

        {usdRate > 0 && income > 0 && (
          <p className="text-xs font-mono text-[#85858b] mt-3 flex items-center gap-2 tabular">
            <ArrowRightLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>Equivale a USD {(income / usdRate).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
          </p>
        )}

        {/* Panel de Saldo Restante y Progreso de Pagos */}
        {income > 0 && result && (
          <div className="mt-5 pt-5 border-t border-[rgba(237,237,237,0.08)] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-[#141415] border border-[rgba(237,237,237,0.06)] rounded-xl p-4">
                <span className="text-xs text-[#85858b] block mb-1">Ingreso planificado</span>
                <div className="text-xl font-mono font-medium text-[#ededed] tabular">
                  ${income.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-[#85858b] mt-0.5">Base para el mes</div>
              </div>

              <div className="bg-[#141415] border border-[rgba(237,237,237,0.06)] rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#85858b]">Salidas pagadas</span>
                  <span className="text-xs font-mono text-[#85858b] tabular">
                    {activeCompletedIds.length} pagada{activeCompletedIds.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="text-xl font-mono font-medium text-[#e5484d] tabular">
                  -${result.totalPaidARS.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs font-mono text-[#85858b] mt-0.5 tabular">
                  {((result.totalPaidARS / (income || 1)) * 100).toFixed(1)}% abonado
                </div>
              </div>

              <div className="bg-[#141415] border border-[rgba(237,237,237,0.06)] rounded-xl p-4">
                <span className="text-xs text-[#85858b] block mb-1">Saldo restante en mano</span>
                <div className="text-xl font-mono font-medium text-[#4cc38a] tabular">
                  ${result.remainingIncome.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                {usdRate > 0 && (
                  <div className="text-xs font-mono text-[#85858b] mt-0.5 tabular">
                    USD {(result.remainingIncome / usdRate).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[#141415] border border-[rgba(237,237,237,0.06)] rounded-lg p-2.5 flex items-center gap-3">
              <div className="flex-1 bg-[#232325] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#d99b43] h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, (result.totalPaidARS / (income || 1)) * 100))}%` }}
                />
              </div>
              <span className="text-xs font-mono text-[#a1a1a6] shrink-0 tabular">
                {Math.round((result.totalPaidARS / (income || 1)) * 100)}% pagado
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Modal Autocompletar Sueldo + Clases */}
      {isSalaryClassesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="bg-[#19191b] border border-[rgba(237,237,237,0.12)] rounded-2xl p-6 max-w-md w-full space-y-5">
            <div className="flex items-center justify-between border-b border-[rgba(237,237,237,0.08)] pb-3">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
                <h3 className="text-base font-medium text-[#ededed]">Calcular ingreso (clases y sueldo)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSalaryClassesModalOpen(false)}
                className="text-[#85858b] hover:text-[#ededed] p-1 rounded-md hover:bg-[#232325] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
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
                className="flex-1 h-9 rounded-lg border border-[rgba(237,237,237,0.08)] bg-[#232325] text-[#a1a1a6] hover:text-[#ededed] text-xs font-medium transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplySalaryClasses}
                className="flex-1 h-9 rounded-lg bg-[#d99b43] hover:bg-[#e3a852] text-[#141415] text-xs font-medium transition-colors cursor-pointer"
              >
                Aplicar como ingreso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. HOJA DE RUTA (SALIDAS) */}
      {result && (income > 0 || result.isNeededMode) && (
        <div className="space-y-4 w-full">
          <div className="bg-[#19191b] overflow-hidden rounded-xl border border-[rgba(237,237,237,0.08)]">
              <div className="bg-[#141415] px-5 py-4 border-b border-[rgba(237,237,237,0.08)] flex justify-between items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-base font-medium text-[#ededed] flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
                    {result.isNeededMode ? "Salidas fijas (ingreso necesario)" : "Salidas programadas"}
                  </h3>
                  <span className="text-xs font-mono text-[#85858b] capitalize">
                    {getMonthName(selectedMonth.month, selectedMonth.year)}
                  </span>
                </div>
                <span className="text-xs font-mono text-[#85858b]">Resumen en pesos</span>
              </div>
              
              <div className="divide-y divide-white/5">
                {/* Gastos Fijos (Como parte de las Salidas) */}
                {result.expensesWithAmounts.map(e => {
                  const isCompleted = e.isCompleted;
                  return (
                    <div key={e.id} className={`p-4 flex justify-between items-center hover:bg-white/5 transition-colors ${isCompleted ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleCompleted(e.id, e.amountARS)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${isCompleted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-500 hover:text-white hover:bg-white/10'}`}
                          title={isCompleted ? "Marcar como pendiente" : "Marcar como pagado (fijar monto)"}
                        >
                          <CheckCircleIcon />
                        </button>
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 shrink-0">
                          <DollarSign className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-gray-300 text-sm font-medium ${isCompleted ? 'line-through text-gray-400' : ''}`}>
                              {e.name}
                            </span>
                            {e.isFrozen && (
                              <span className="text-[10px] text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/20 font-semibold">
                                ✓ Pagado (Fijo)
                              </span>
                            )}
                          </div>
                          {e.currency === "USD" && (
                            <div className="text-[10px] text-gray-500 font-mono">
                              {e.amount} USD {e.isFrozen ? '(fijado en ARS al pagar)' : `(al cambio actual: $${usdRate})`}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`font-mono font-bold ${isCompleted ? 'text-gray-400 line-through' : 'text-red-400'}`}>
                          ${e.amountARS.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Distribución (Como parte de las Salidas) */}
                {result.allocations.map(a => {
                  const isCompleted = a.isCompleted;
                  return (
                    <div key={a.id} className={`p-4 flex justify-between items-center hover:bg-white/5 transition-colors ${isCompleted ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleCompleted(a.id, a.amountARS)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${isCompleted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-500 hover:text-white hover:bg-white/10'}`}
                          title={isCompleted ? "Marcar como pendiente" : "Marcar como pagado (fijar monto)"}
                        >
                          <CheckCircleIcon />
                        </button>
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-lg shrink-0">{a.icon}</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold text-white ${isCompleted ? 'line-through text-gray-400' : ''}`}>{a.name}</span>
                            {a.isFrozen && (
                              <span className="text-[10px] text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/20 font-semibold">
                                ✓ Pagado (Fijo)
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-500 uppercase tracking-tighter">
                            {a.type === "fixed_usd" 
                              ? `${a.value} USD fijo ${a.isFrozen ? '(fijado en ARS al pagar)' : `(al cambio actual: $${usdRate})`}` 
                              : a.type === "fixed_ars" 
                              ? `${a.value} ARS fijo` 
                              : `${a.value}% del resto ${a.isFrozen ? '(fijado al pagar)' : ''}`}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-mono font-black ${isCompleted ? 'text-gray-400 line-through' : 'text-white'}`}>
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
              <div className="p-5 bg-[#141415] border-t border-[rgba(237,237,237,0.08)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[#85858b] text-xs block">
                    {result.isNeededMode ? "Total necesario" : "Total salidas planificadas"}
                  </span>
                  {!result.isNeededMode && (
                    <div className="flex items-center gap-3 text-xs font-mono mt-1.5 tabular">
                      <span className="text-[#4cc38a]">
                        Pagado: ${result.totalPaidARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-[#85858b]">·</span>
                      <span className="text-[#d99b43]">
                        Pendiente: ${Math.max(0, (result.totalExpensesARS + result.allocations.reduce((a,c) => a + c.amountARS, 0)) - result.totalPaidARS).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-left sm:text-right font-mono tabular">
                  <span className="text-xl font-medium text-[#ededed] block">
                    ${(result.isNeededMode ? result.totalNeededARS : result.totalExpensesARS + result.allocations.reduce((a,c) => a + c.amountARS, 0)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {!result.isNeededMode && (
                    <span className="text-xs text-[#4cc38a] block mt-0.5">
                      Saldo disponible: ${result.remainingIncome.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Sobras / Déficit / Distribuido */}
            {!result.isNeededMode && result.unallocated > 100 ? (
              <div className="bg-[#19191b] p-5 rounded-xl border border-[#d99b43]/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 bg-[#232325] rounded-lg flex items-center justify-center text-[#d99b43] shrink-0">
                      <TrendingUp className="w-4 h-4" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <h4 className="text-sm font-medium text-[#ededed]">Saldo sin asignar</h4>
                      <p className="text-xs text-[#a1a1a6] font-mono tabular">
                        Tenés ${result.unallocated.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} disponibles
                        {usdRate > 0 && ` (USD ${(result.unallocated / usdRate).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })})`}.
                      </p>

                      <div className="pt-2 flex flex-wrap items-center gap-2">
                        <select value={absorbCategory} onChange={e => setAbsorbCategory(e.target.value)} className="h-8 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-2.5 text-[#ededed] text-xs focus:outline-none max-w-full cursor-pointer">
                          <option value="">Sumar a una salida</option>
                          {activeCategories.filter(c => c.type !== "percentage").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button onClick={handleAbsorbRemainder} disabled={!absorbCategory} className="h-8 bg-[#d99b43] disabled:opacity-50 hover:bg-[#e3a852] text-[#141415] px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer">
                          Asignar resto
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="text-xl font-medium text-[#d99b43] self-end sm:self-center shrink-0 font-mono tabular">
                    +${result.unallocated.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ) : !result.isNeededMode && result.unallocated < -100 ? (
              <div className="bg-[#19191b] p-5 rounded-xl border border-[#e5484d]/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 bg-[#e5484d]/15 rounded-lg flex items-center justify-center text-[#e5484d] shrink-0">
                      <AlertCircle className="w-4 h-4" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <h4 className="font-medium text-[#e5484d] text-sm">Déficit mensual</h4>
                      <p className="text-xs text-[#a1a1a6] font-mono tabular">
                        Faltan ${Math.abs(result.unallocated).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} para cubrir las salidas
                        {usdRate > 0 && ` (USD ${(Math.abs(result.unallocated) / usdRate).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })})`}.
                      </p>
                    </div>
                  </div>
                  <div className="text-xl font-medium text-[#e5484d] self-end sm:self-center shrink-0 font-mono tabular">
                    -${Math.abs(result.unallocated).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ) : !result.isNeededMode && (
              <div className="bg-[#19191b] p-3.5 rounded-xl border border-[rgba(237,237,237,0.08)] text-center text-xs text-[#4cc38a]">
                Ingreso 100% distribuido
              </div>
            )}
        </div>
      )}

      {/* 3. GESTIÓN DE SALIDAS */}
      <div className="pt-8 border-t border-[rgba(237,237,237,0.08)]">
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-lg font-medium text-[#ededed] flex items-center gap-2">
              <Coins className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
              Configurar salidas
            </h3>
            <span className="text-xs font-mono text-[#85858b] capitalize">
              {getMonthName(selectedMonth.month, selectedMonth.year)}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {otherConfiguredMonths.length > 0 && (
              <div className="flex items-center gap-1.5 bg-[#19191b] border border-[rgba(237,237,237,0.08)] px-2.5 h-8 rounded-lg text-xs">
                <span className="text-[#85858b]">Copiar de</span>
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
                  className="bg-transparent text-[#d99b43] font-medium focus:outline-none cursor-pointer"
                >
                  <option value="" disabled>Seleccionar mes</option>
                  {otherConfiguredMonths.map(k => {
                    const [y, m] = k.split("-");
                    return (
                      <option key={k} value={k} className="capitalize">
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
                "flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                saveStatus === "saved"
                  ? "bg-[#4cc38a]/15 text-[#4cc38a] border border-[#4cc38a]/30"
                  : saveStatus === "error"
                  ? "bg-[#d99b43]/15 text-[#d99b43] border border-[#d99b43]/30"
                  : "bg-[#232325] hover:bg-[#2c2c2f] text-[#ededed] border border-[rgba(237,237,237,0.08)]"
              )}
            >
              {saveStatus === "saving" ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                  <span>Guardando...</span>
                </>
              ) : saveStatus === "saved" ? (
                <>
                  <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Guardado</span>
                </>
              ) : saveStatus === "error" ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Guardado local</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 text-[#d99b43]" strokeWidth={1.5} />
                  <span>Guardar salidas</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-5 rounded-xl w-full">
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
                className="bg-[#232325] hover:bg-[#d99b43] text-[#d99b43] hover:text-[#141415] rounded-lg flex items-center justify-center transition-colors w-8 h-8 shrink-0 cursor-pointer"
                title="Añadir salida"
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. DEUDAS A MI FAVOR */}
      <div className="pt-8 border-t border-[rgba(237,237,237,0.08)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-medium text-[#ededed] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
              Deudas a mi favor
            </h3>
            <p className="text-sm text-[#a1a1a6]">Registrá los montos pendientes de cobro.</p>
          </div>
          {debtTotals.totalARS > 0 && (
            <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl px-4 py-2.5 flex flex-col items-end font-mono tabular">
              <span className="text-xs text-[#85858b]">Total pendiente</span>
              <div className="text-lg font-medium text-[#ededed]">
                ${debtTotals.totalARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS
              </div>
              {usdRate > 0 && (
                <div className="text-xs text-[#85858b] mt-0.5">
                  USD {debtTotals.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-5 rounded-xl w-full space-y-4">
          {/* Filtro por deudor */}
          {uniqueDebtors.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-[#141415] p-3 rounded-lg border border-[rgba(237,237,237,0.06)]">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#85858b]">Filtrar por deudor</span>
                <select
                  value={debtorFilter}
                  onChange={e => setDebtorFilter(e.target.value)}
                  className="h-8 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-2.5 text-[#ededed] text-xs focus:outline-none cursor-pointer"
                >
                  <option value="">Todos los deudores</option>
                  {uniqueDebtors.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              {debtorFilter && (
                <div className="text-xs font-mono text-[#d99b43] sm:ml-auto tabular">
                  Pendiente de {debtorFilter}: ${filteredDebtTotals.totalARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS
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
