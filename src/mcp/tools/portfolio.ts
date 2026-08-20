/**
 * Portfolio and Financial Calculation Tools for MCP Server
 */

import { getFinancialQuote, getDollarRates } from "./market";

// ─── 1. Income Distribution ──────────────────────────────────────────────────

export interface IncomeCategoryInput {
  name: string;
  type: "fixed_usd" | "fixed_ars" | "percentage";
  value: number;
}

export interface IncomeExpenseInput {
  name: string;
  amount: number;
  currency: "ARS" | "USD";
}

export interface IncomeDebtInput {
  debtorName: string;
  amount: number;
  currency: "ARS" | "USD";
  isPaid?: boolean;
}

export function distributeIncome(params: {
  totalIncomeArs: number;
  usdRate?: number;
  categories: IncomeCategoryInput[];
  expenses?: IncomeExpenseInput[];
  debts?: IncomeDebtInput[];
}) {
  const { totalIncomeArs, categories, expenses = [], debts = [] } = params;
  const rate = params.usdRate || 1350; // fallback if not supplied

  // 1. Calculate Expenses
  let totalExpensesArs = 0;
  for (const exp of expenses) {
    const inArs = exp.currency === "USD" ? exp.amount * rate : exp.amount;
    totalExpensesArs += inArs;
  }

  // 2. Calculate Debts
  let totalPendingDebtsArs = 0;
  let totalCollectedDebtsArs = 0;
  for (const debt of debts) {
    const inArs = debt.currency === "USD" ? debt.amount * rate : debt.amount;
    if (debt.isPaid) {
      totalCollectedDebtsArs += inArs;
    } else {
      totalPendingDebtsArs += inArs;
    }
  }

  // Net distributable income = totalIncome - expenses + collected debts (if added)
  const netIncomeArs = Math.max(0, totalIncomeArs - totalExpensesArs);

  // 3. Fixed allocations first
  let fixedSumArs = 0;
  const categoryResults: Array<{
    name: string;
    type: string;
    configuredValue: number;
    amountArs: number;
    amountUsd: number;
    percentageOfNet: number;
  }> = [];

  for (const cat of categories) {
    let amountArs = 0;
    if (cat.type === "fixed_usd") {
      amountArs = cat.value * rate;
      fixedSumArs += amountArs;
    } else if (cat.type === "fixed_ars") {
      amountArs = cat.value;
      fixedSumArs += amountArs;
    }
    if (cat.type !== "percentage") {
      categoryResults.push({
        name: cat.name,
        type: cat.type,
        configuredValue: cat.value,
        amountArs: Math.round(amountArs),
        amountUsd: parseFloat((amountArs / rate).toFixed(2)),
        percentageOfNet: netIncomeArs > 0 ? parseFloat(((amountArs / netIncomeArs) * 100).toFixed(1)) : 0,
      });
    }
  }

  // Remaining pool for percentage categories
  const poolAfterFixed = Math.max(0, netIncomeArs - fixedSumArs);
  const totalPercentageAllocated = categories
    .filter((c) => c.type === "percentage")
    .reduce((acc, c) => acc + c.value, 0);

  for (const cat of categories) {
    if (cat.type === "percentage") {
      // Scale percentage relative to the remaining pool
      const factor = totalPercentageAllocated > 0 ? cat.value / 100 : 0;
      const amountArs = poolAfterFixed * factor;
      categoryResults.push({
        name: cat.name,
        type: "percentage",
        configuredValue: cat.value,
        amountArs: Math.round(amountArs),
        amountUsd: parseFloat((amountArs / rate).toFixed(2)),
        percentageOfNet: netIncomeArs > 0 ? parseFloat(((amountArs / netIncomeArs) * 100).toFixed(1)) : 0,
      });
    }
  }

  const totalAllocatedArs = categoryResults.reduce((acc, c) => acc + c.amountArs, 0);
  const unassignedArs = Math.max(0, netIncomeArs - totalAllocatedArs);

  return {
    summary: {
      grossIncomeArs: totalIncomeArs,
      grossIncomeUsd: parseFloat((totalIncomeArs / rate).toFixed(2)),
      totalExpensesArs,
      totalExpensesUsd: parseFloat((totalExpensesArs / rate).toFixed(2)),
      netDistributableArs: netIncomeArs,
      netDistributableUsd: parseFloat((netIncomeArs / rate).toFixed(2)),
      totalAllocatedArs,
      unassignedArs,
      exchangeRateUsed: rate,
    },
    categories: categoryResults,
    debtsSummary: {
      pendingArs: totalPendingDebtsArs,
      collectedArs: totalCollectedDebtsArs,
    },
  };
}

// ─── 2. CEDEARs & Portfolio Analytics ────────────────────────────────────────

export interface CedearPurchaseInput {
  ticker: string;
  quantity: number;
  purchasePrice: number;
  currency: string;
  date?: string;
}

export async function analyzeCedearsPortfolio(params: {
  purchases: CedearPurchaseInput[];
  usdRate?: number;
}) {
  const { purchases } = params;
  if (!purchases || purchases.length === 0) {
    return { error: "No se enviaron compras para analizar." };
  }

  let rate = params.usdRate;
  if (!rate) {
    try {
      const dollarData = await getDollarRates();
      rate = dollarData.uala?.venta || dollarData.mep?.venta || 1350;
    } catch {
      rate = 1350;
    }
  }

  // Aggregate by ticker
  const holdingsMap = new Map<
    string,
    {
      ticker: string;
      totalQuantity: number;
      totalCostArs: number;
      totalCostUsd: number;
    }
  >();

  for (const p of purchases) {
    const t = p.ticker.toUpperCase();
    const qty = p.quantity;
    const price = p.purchasePrice;
    const isUsd = p.currency === "USD";
    const costArs = isUsd ? qty * price * rate : qty * price;
    const costUsd = isUsd ? qty * price : (qty * price) / rate;

    const existing = holdingsMap.get(t) || {
      ticker: t,
      totalQuantity: 0,
      totalCostArs: 0,
      totalCostUsd: 0,
    };

    existing.totalQuantity += qty;
    existing.totalCostArs += costArs;
    existing.totalCostUsd += costUsd;
    holdingsMap.set(t, existing);
  }

  // Fetch current prices
  const positions = [];
  let grandTotalInvestedArs = 0;
  let grandTotalValueArs = 0;

  for (const [ticker, item] of holdingsMap.entries()) {
    if (item.totalQuantity <= 0) continue;

    let currentPrice = 0;
    let quoteCurrency = "ARS";
    try {
      const q = await getFinancialQuote(ticker);
      currentPrice = q.price;
      quoteCurrency = q.currency;
    } catch {
      // if not found, use avg purchase price as fallback
      currentPrice = item.totalCostArs / item.totalQuantity;
    }

    const isQuoteUsd = quoteCurrency === "USD";
    const currentValueArs = isQuoteUsd
      ? item.totalQuantity * currentPrice * rate
      : item.totalQuantity * currentPrice;
    const currentValueUsd = isQuoteUsd
      ? item.totalQuantity * currentPrice
      : (item.totalQuantity * currentPrice) / rate;

    const pnlArs = currentValueArs - item.totalCostArs;
    const pnlUsd = currentValueUsd - item.totalCostUsd;
    const roiPct = item.totalCostArs > 0 ? (pnlArs / item.totalCostArs) * 100 : 0;
    const avgPriceArs = item.totalCostArs / item.totalQuantity;

    grandTotalInvestedArs += item.totalCostArs;
    grandTotalValueArs += currentValueArs;

    positions.push({
      ticker,
      quantity: item.totalQuantity,
      avgPurchasePriceArs: parseFloat(avgPriceArs.toFixed(2)),
      currentPrice,
      quoteCurrency,
      totalCostArs: Math.round(item.totalCostArs),
      totalCostUsd: parseFloat(item.totalCostUsd.toFixed(2)),
      currentValueArs: Math.round(currentValueArs),
      currentValueUsd: parseFloat(currentValueUsd.toFixed(2)),
      pnlArs: Math.round(pnlArs),
      pnlUsd: parseFloat(pnlUsd.toFixed(2)),
      roiPct: parseFloat(roiPct.toFixed(2)),
    });
  }

  const grandTotalPnlArs = grandTotalValueArs - grandTotalInvestedArs;
  const grandTotalRoiPct =
    grandTotalInvestedArs > 0 ? (grandTotalPnlArs / grandTotalInvestedArs) * 100 : 0;

  // Add allocation percentage to each position
  const formattedPositions = positions.map((pos) => ({
    ...pos,
    portfolioWeightPct:
      grandTotalValueArs > 0
        ? parseFloat(((pos.currentValueArs / grandTotalValueArs) * 100).toFixed(1))
        : 0,
  }));

  return {
    summary: {
      totalInvestedArs: Math.round(grandTotalInvestedArs),
      totalInvestedUsd: parseFloat((grandTotalInvestedArs / rate).toFixed(2)),
      currentValueArs: Math.round(grandTotalValueArs),
      currentValueUsd: parseFloat((grandTotalValueArs / rate).toFixed(2)),
      totalPnlArs: Math.round(grandTotalPnlArs),
      totalPnlUsd: parseFloat((grandTotalPnlArs / rate).toFixed(2)),
      totalRoiPct: parseFloat(grandTotalRoiPct.toFixed(2)),
      exchangeRateUsed: rate,
      totalPositions: formattedPositions.length,
    },
    positions: formattedPositions,
  };
}

// ─── 3. Crypto DCA / Bullet Strategy ─────────────────────────────────────────

export function calculateCryptoDcaStrategy(params: {
  strategyName: "AV_BTC" | "AV_ETH" | string;
  currentPrice: number;
  firstEntryPrice: number;
  totalBullets: number;
  usedBullets: number;
  stepDropPct?: number; // default e.g. 5% drop per bullet
  targetProfitPct?: number; // default e.g. 8%
}) {
  const {
    strategyName,
    currentPrice,
    firstEntryPrice,
    totalBullets,
    usedBullets,
    stepDropPct = 5,
    targetProfitPct = 8,
  } = params;

  const remainingBullets = Math.max(0, totalBullets - usedBullets);
  const bulletLevels = [];

  for (let i = 1; i <= totalBullets; i++) {
    const drop = ((i - 1) * stepDropPct) / 100;
    const targetLevel = firstEntryPrice * (1 - drop);
    bulletLevels.push({
      bulletNumber: i,
      triggerPrice: parseFloat(targetLevel.toFixed(2)),
      isUsed: i <= usedBullets,
      isTriggeredAtCurrent: currentPrice <= targetLevel,
    });
  }

  // Estimated Avg Entry Price assuming equal weight bullets
  let sumPrices = 0;
  for (let i = 1; i <= Math.max(1, usedBullets); i++) {
    const drop = ((i - 1) * stepDropPct) / 100;
    sumPrices += firstEntryPrice * (1 - drop);
  }
  const estimatedAvgPrice = sumPrices / Math.max(1, usedBullets);
  const takeProfitPrice = estimatedAvgPrice * (1 + targetProfitPct / 100);
  const currentPnlPct = ((currentPrice - estimatedAvgPrice) / estimatedAvgPrice) * 100;

  return {
    strategy: strategyName,
    currentPrice,
    firstEntryPrice,
    usedBullets,
    remainingBullets,
    totalBullets,
    estimatedAvgPrice: parseFloat(estimatedAvgPrice.toFixed(2)),
    takeProfitTargetPrice: parseFloat(takeProfitPrice.toFixed(2)),
    targetProfitPct,
    currentPnlPct: parseFloat(currentPnlPct.toFixed(2)),
    levels: bulletLevels,
    recommendation:
      currentPrice >= takeProfitPrice
        ? `¡OBJETIVO ALCANZADO! Precio actual ($${currentPrice}) superó el Take Profit ($${takeProfitPrice.toFixed(2)}). Considerar cerrar operación y tomar ganancias.`
        : remainingBullets > 0 && currentPrice <= (bulletLevels[usedBullets]?.triggerPrice || 0)
        ? `SEÑAL DE COMPRA: El precio tocó el nivel de la bala #${usedBullets + 1} ($${bulletLevels[usedBullets]?.triggerPrice.toFixed(2)}).`
        : `En seguimiento. Esperando rebote a $${takeProfitPrice.toFixed(2)} o siguiente nivel de compra.`,
  };
}
