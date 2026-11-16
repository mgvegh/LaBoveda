"use client";
import { useState, useEffect } from "react";
import { RotateCcw, Crosshair, AlertTriangle, CheckCircle2, Save, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

type TradeLog = { id: string; date: string; timestamp: number; pnl: number; bulletsUsed: number; type: string; };
type PastOperation = { id: string; name: string; strategy: "MS_BTC" | "AV_ETH"; date: string; startDateTs: number; endDateTs: number; invested: number; profit: number; logs: TradeLog[]; };

export default function CriptoTracker() {
  const [isClient, setIsClient] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<"MS_BTC" | "AV_ETH">("MS_BTC");
  const [baseInvestment, setBaseInvestment] = useState(0);
  const [availableBullets, setAvailableBullets] = useState(30);
  const [pnlInput, setPnlInput] = useState<string>("");
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [pastOperations, setPastOperations] = useState<PastOperation[]>([]);
  const [operationProfitInput, setOperationProfitInput] = useState<string>("");
  const [expandedOpId, setExpandedOpId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { user } = useAuth();

  const getDocRef = () => user ? doc(db, "users", user.uid, "cripto_strategies", "state") : null;

  useEffect(() => {
    setIsClient(true);
    if (!user) return;
    const docRef = getDocRef();
    if (!docRef) return;
    getDoc(docRef).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.logs) setLogs(data.logs);
        if (data.past_operations) setPastOperations(data.past_operations);
        if (data.base_investment) setBaseInvestment(Number(data.base_investment));
        if (data.available_bullets) setAvailableBullets(Number(data.available_bullets));
        if (data.active_strategy) setActiveStrategy(data.active_strategy);
      }
    });
  }, [user]); // eslint-disable-line

  useEffect(() => {
    if (!isClient || !user) return;
    const docRef = getDocRef();
    if (!docRef) return;
    const id = setTimeout(() => {
      setDoc(docRef, { base_investment: baseInvestment, available_bullets: availableBullets, active_strategy: activeStrategy, logs, past_operations: pastOperations, updated_at: new Date().toISOString() }, { merge: true });
    }, 1000);
    return () => clearTimeout(id);
  }, [logs, pastOperations, baseInvestment, availableBullets, activeStrategy, isClient, user]); // eslint-disable-line

  const bulletSize = baseInvestment / 30;
  const usedBullets = 30 - availableBullets;
  const pnl = parseFloat(pnlInput) || 0;

  const getRuleSuggestion = (currentPnl: number, strategy: "MS_BTC" | "AV_ETH") => {
    if (strategy === "MS_BTC") {
      if (currentPnl > 20) return { bullets: 0, msg: "Cierre Obligatorio (>20%)", color: "text-emerald-500" };
      if (currentPnl > 15) return { bullets: 1, msg: "Cierre Sugerido (15-20%): 1 bala opcional", color: "text-emerald-400" };
      if (currentPnl > 0) return { bullets: 1, msg: "Positivo: 1 bala a posición", color: "text-orange-400" };
      if (currentPnl === 0) return { bullets: 2, msg: "Inicio / Break Even (0%): 2 balas a posición", color: "text-blue-400" };
      if (currentPnl >= -5) return { bullets: 2, msg: "Negativo hasta 5%: 2 balas", color: "text-amber-400" };
      if (currentPnl >= -10) return { bullets: 3, msg: "Negativo hasta 10%: 3 balas", color: "text-amber-500" };
      if (currentPnl >= -15) return { bullets: 4, msg: "Negativo hasta 15%: 4 balas", color: "text-orange-500" };
      if (currentPnl >= -40) return { bullets: 5, msg: "Negativo 15% a 40%: 5 balas", color: "text-red-400" };
      return { bullets: 6, msg: "Negativo >40%: 3 balas a posición + 3 a margen", color: "text-red-600" };
    } else {
      if (currentPnl > 20) return { bullets: 0, msg: "Cierre Obligatorio (>20%)", color: "text-emerald-500" };
      if (currentPnl > 15) return { bullets: 1, msg: "Cierre Sugerido (15-20%): 1 bala opcional", color: "text-emerald-400" };
      if (currentPnl > 5) return { bullets: 1, msg: "Positivo > 5%: 1 bala a posición", color: "text-purple-400" };
      if (currentPnl > 0) return { bullets: 2, msg: "Positivo hasta 5%: 2 balas a posición", color: "text-purple-500" };
      if (currentPnl === 0) return { bullets: 3, msg: "Inicio / Break Even (0%): 3 balas a posición", color: "text-blue-400" };
      if (currentPnl >= -5) return { bullets: 3, msg: "Negativo hasta 5%: 3 balas a posición", color: "text-amber-400" };
      if (currentPnl >= -10) return { bullets: 4, msg: "Negativo hasta 10%: 4 balas a posición", color: "text-orange-400" };
      if (currentPnl >= -15) return { bullets: 5, msg: "Negativo hasta 15%: 5 balas a posición", color: "text-orange-500" };
      if (currentPnl >= -40) return { bullets: 6, msg: "Negativo > 15%: 6 balas a posición", color: "text-red-400" };
      if (currentPnl >= -60) return { bullets: 6, msg: "Crítico > 40%: 3 a posición + 3 a margen", color: "text-red-600" };
      return { bullets: 6, msg: "Terminal (>60%): 6 balas a margen", color: "text-red-700" };
    }
  };

  const suggestion = getRuleSuggestion(pnl, activeStrategy);

  const handleFireBullets = () => {
    if (suggestion.bullets === 0) return;
    if (availableBullets < suggestion.bullets) { alert("No tienes suficientes balas en el pozo."); return; }
    setAvailableBullets(prev => prev - suggestion.bullets);
    setLogs(prev => [{ id: Date.now().toString(), date: new Date().toLocaleString(), timestamp: Date.now(), pnl, bulletsUsed: suggestion.bullets, type: suggestion.msg }, ...prev]);
    setPnlInput("");
  };

  const handleCloseOperation = () => {
    const profit = parseFloat(operationProfitInput) || 0;
    const sameStrategyOps = pastOperations.filter(o => o.strategy === activeStrategy);
    const opNumber = sameStrategyOps.length + 1;
    const prefix = activeStrategy === "MS_BTC" ? "MS" : "AV";
    const name = `${prefix}${opNumber.toString().padStart(2, '0')}`;
    const endTs = Date.now();
    const startTs = logs.length > 0 ? logs[logs.length - 1].timestamp : endTs;
    const invested = usedBullets * bulletSize;
    setPastOperations(prev => [{ id: Date.now().toString(), name, strategy: activeStrategy, date: new Date().toLocaleDateString(), startDateTs: startTs, endDateTs: endTs, invested: invested > 0 ? invested : 1, profit, logs: [...logs] }, ...prev]);
    setAvailableBullets(30); setLogs([]); setOperationProfitInput("");
    alert(`Operación ${name} cerrada. Balas reseteadas a 30.`);
  };

  const handleLiquidation = () => {
    const invested = usedBullets * bulletSize;
    if (invested === 0) { alert("No hay balas invertidas en la operación actual."); return; }
    const sameStrategyOps = pastOperations.filter(o => o.strategy === activeStrategy);
    const opNumber = sameStrategyOps.length + 1;
    const prefix = activeStrategy === "MS_BTC" ? "MS" : "AV";
    const name = `${prefix}${opNumber.toString().padStart(2, '0')} [LIQ]`;
    const endTs = Date.now();
    const startTs = logs.length > 0 ? logs[logs.length - 1].timestamp : endTs;
    setPastOperations(prev => [{ id: Date.now().toString(), name, strategy: activeStrategy, date: new Date().toLocaleDateString(), startDateTs: startTs, endDateTs: endTs, invested, profit: -invested, logs: [...logs] }, ...prev]);
    setAvailableBullets(30); setLogs([]); setOperationProfitInput("");
  };

  const toggleOp = (id: string) => setExpandedOpId(prev => prev === id ? null : id);
  const isAV = activeStrategy === "AV_ETH";
  const sameStrategyOpsForCalc = pastOperations.filter(op => op.strategy === activeStrategy);
  const totalInvCripto = sameStrategyOpsForCalc.reduce((acc, op) => acc + (op.invested || 0), 0);
  const totalProfCripto = sameStrategyOpsForCalc.reduce((acc, op) => acc + (op.profit || 0), 0);
  const globalRoiCripto = totalInvCripto > 0 ? (totalProfCripto / totalInvCripto) * 100 : 0;

  if (!isClient) return null;

  return (
    <div className="space-y-6">
      <div className="w-full">
        <div className="inline-flex flex-col sm:flex-row gap-1 p-1 bg-[#19191b] border border-[rgba(237,237,237,0.08)] rounded-xl w-full sm:w-fit">
          <button
            onClick={() => setActiveStrategy("MS_BTC")}
            className={clsx(
              "px-4 h-9 rounded-lg text-sm font-medium transition-colors duration-150 whitespace-nowrap w-full sm:w-auto text-center cursor-pointer",
              !isAV ? "bg-[#232325] text-[#ededed] border border-[rgba(237,237,237,0.12)]" : "text-[#85858b] hover:text-[#ededed] border border-transparent"
            )}
          >
            Estrategia MS BTC (Long)
          </button>
          <button
            onClick={() => setActiveStrategy("AV_ETH")}
            className={clsx(
              "px-4 h-9 rounded-lg text-sm font-medium transition-colors duration-150 whitespace-nowrap w-full sm:w-auto text-center cursor-pointer",
              isAV ? "bg-[#232325] text-[#ededed] border border-[rgba(237,237,237,0.12)]" : "text-[#85858b] hover:text-[#ededed] border border-transparent"
            )}
          >
            Estrategia Anti-Vitalik (Short)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl md:col-span-2 space-y-4">
          <h2 className="text-base font-medium text-[#ededed] flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
            Parámetros ({isAV ? "Anti-Vitalik" : "MS BTC"})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#232325] border border-[rgba(237,237,237,0.06)] p-4 rounded-lg">
              <div className="text-xs text-[#85858b] mb-1">Monto total</div>
              <input
                type="number"
                value={baseInvestment}
                onChange={e => setBaseInvestment(Number(e.target.value))}
                className="w-full bg-transparent text-xl font-mono font-medium text-[#ededed] tabular focus:outline-none focus:text-[#d99b43] transition-colors"
              />
            </div>
            <div className="bg-[#232325] border border-[rgba(237,237,237,0.06)] p-4 rounded-lg">
              <div className="text-xs text-[#85858b] mb-1">1 bala</div>
              <div className="text-xl font-mono font-medium text-[#d99b43] tabular">${bulletSize.toFixed(2)}</div>
            </div>
            <div className="bg-[#232325] border border-[rgba(237,237,237,0.06)] p-4 rounded-lg">
              <div className="text-xs text-[#85858b] mb-1">Balas restantes</div>
              <div className={clsx("text-xl font-mono font-medium tabular", availableBullets <= 5 ? "text-[#e5484d]" : "text-[#ededed]")}>
                {availableBullets} / 30
              </div>
            </div>
            <div className="bg-[#232325] border border-[rgba(237,237,237,0.06)] p-4 rounded-lg">
              <div className="text-xs text-[#85858b] mb-1">Inv. actual</div>
              <div className="text-xl font-mono font-medium text-[#ededed] tabular">${(usedBullets * bulletSize).toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl flex flex-col justify-between space-y-4">
          <h3 className="text-base font-medium text-[#ededed]">Cerrar operación actual</h3>
          <div className="space-y-2.5">
            <input
              type="number"
              placeholder="Profit final ($)"
              value={operationProfitInput}
              onChange={e => setOperationProfitInput(e.target.value)}
              className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg px-3 text-sm font-mono text-[#ededed] placeholder:text-[#85858b] focus:outline-none focus:border-[#d99b43] transition-colors"
            />
            <button
              onClick={handleCloseOperation}
              className="w-full h-9 flex items-center justify-center gap-2 bg-[#232325] hover:bg-[#2c2c2f] text-[#4cc38a] border border-[rgba(237,237,237,0.08)] rounded-lg transition-colors text-xs font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
              Guardar profit y resetear
            </button>
            <button
              onClick={handleLiquidation}
              className="w-full h-9 flex items-center justify-center gap-2 bg-[#e5484d]/10 hover:bg-[#e5484d]/20 text-[#e5484d] border border-[#e5484d]/20 rounded-lg transition-colors text-xs font-medium cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />
              Operación liquidada
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl space-y-4">
        <h2 className="text-base font-medium text-[#ededed]">
          Ejecutor de reglas ({isAV ? "ETH Short" : "BTC Long"})
        </h2>
        <form
          className="flex flex-col md:flex-row gap-4 items-stretch md:items-end"
          onSubmit={e => {
            e.preventDefault();
            if (pnlInput !== "" && suggestion.bullets > 0 && availableBullets >= suggestion.bullets) handleFireBullets();
          }}
        >
          <div className="w-full md:w-1/3 space-y-1.5">
            <label className="block text-xs text-[#a1a1a6]">PNL actual de la posición (%)</label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                placeholder={isAV ? "0.00" : "-5.5"}
                value={pnlInput}
                onChange={e => setPnlInput(e.target.value)}
                className="w-full h-11 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg pl-3.5 pr-9 text-base font-mono text-[#ededed] focus:outline-none focus:border-[#d99b43] transition-colors"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-mono text-[#85858b]">%</span>
            </div>
          </div>

          <div className="w-full md:w-2/3 p-3.5 rounded-lg border border-[rgba(237,237,237,0.08)] bg-[#141415] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs text-[#85858b] mb-0.5">Acción sugerida</div>
              {pnlInput === "" ? (
                <div className="text-sm text-[#85858b]">Ingresá el PNL actual</div>
              ) : (
                <div className="text-sm font-medium text-[#ededed] flex items-center gap-2">
                  {pnl > 15 ? (
                    <CheckCircle2 className="w-4 h-4 text-[#4cc38a] shrink-0" strokeWidth={1.5} />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-[#d99b43] shrink-0" strokeWidth={1.5} />
                  )}
                  <span>{suggestion.msg}</span>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={pnlInput === "" || suggestion.bullets === 0 || availableBullets < suggestion.bullets}
              className="h-9 whitespace-nowrap bg-[#d99b43] hover:bg-[#e3a852] disabled:bg-[#232325] disabled:text-[#85858b] text-[#141415] px-4 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" strokeWidth={1.5} />
              Ejecutar y guardar
            </button>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl space-y-4">
          <h2 className="text-base font-medium text-[#ededed]">Balas posición actual</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-[#85858b]">No se han disparado balas en esta operación.</p>
          ) : (
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="bg-[#141415] border border-[rgba(237,237,237,0.06)] p-3 rounded-lg flex justify-between items-center">
                  <div>
                    <div className="text-sm text-[#ededed] font-medium">{log.type}</div>
                    <div className="text-xs font-mono text-[#85858b]">{log.date}</div>
                  </div>
                  <div className="text-right font-mono tabular">
                    <div className={clsx("text-sm font-medium", log.pnl > 0 ? "text-[#4cc38a]" : log.pnl < 0 ? "text-[#e5484d]" : "text-[#a1a1a6]")}>
                      {log.pnl > 0 ? "+" : ""}{log.pnl}%
                    </div>
                    <div className="text-xs text-[#d99b43]">{log.bulletsUsed} balas</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 rounded-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline border-b border-[rgba(237,237,237,0.08)] pb-3 gap-2">
            <h2 className="text-base font-medium text-[#ededed]">Historial de operaciones</h2>
            <div className="text-xs font-mono tabular">
              <span className="text-[#85858b]">Acumulado: </span>
              <span className={clsx("font-medium", totalProfCripto >= 0 ? "text-[#4cc38a]" : "text-[#e5484d]")}>
                {totalProfCripto >= 0 ? "+" : "-"}${Math.abs(totalProfCripto).toFixed(2)} ({globalRoiCripto > 0 ? "+" : ""}{globalRoiCripto.toFixed(1)}%)
              </span>
            </div>
          </div>

          {sameStrategyOpsForCalc.length === 0 ? (
            <p className="text-sm text-[#85858b]">Aún no hay operaciones cerradas para esta estrategia.</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {sameStrategyOpsForCalc.map(op => {
                const isExpanded = expandedOpId === op.id;
                const roi = (op.profit / (op.invested || 1)) * 100;
                return (
                  <div key={op.id} className="bg-[#141415] border border-[rgba(237,237,237,0.06)] rounded-lg overflow-hidden">
                    <div className="w-full flex items-center p-3 hover:bg-[#232325]/50 transition-colors">
                      <div onClick={() => toggleOp(op.id)} className="flex-1 flex justify-between items-center cursor-pointer pr-3">
                        <div className="flex flex-col items-start text-left">
                          <span className="font-mono font-medium text-sm text-[#ededed]">{op.name}</span>
                          <div className="text-xs font-mono text-[#85858b] mt-0.5">{op.date}</div>
                        </div>
                        <div className="flex flex-col items-end font-mono tabular">
                          <div className={clsx("font-medium text-sm", op.profit >= 0 ? "text-[#4cc38a]" : "text-[#e5484d]")}>
                            {op.profit >= 0 ? "+" : "-"}${Math.abs(op.profit).toFixed(2)}
                          </div>
                          <div className="text-xs text-[#85858b]">ROI {roi > 0 ? "+" : ""}{roi.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 pl-3 border-l border-[rgba(237,237,237,0.08)] shrink-0">
                        {confirmDeleteId === op.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setPastOperations(prev => prev.filter(o => o.id !== op.id)); setConfirmDeleteId(null); }} className="text-[#ededed] text-xs font-medium px-2 py-1 bg-[#e5484d] rounded cursor-pointer">Borrar</button>
                            <button onClick={() => setConfirmDeleteId(null)} className="text-[#85858b] text-xs px-1.5 py-1 hover:text-[#ededed] cursor-pointer">No</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setConfirmDeleteId(op.id)} className="p-1.5 text-[#85858b] hover:text-[#e5484d] rounded transition-colors cursor-pointer"><Trash2 className="w-4 h-4" strokeWidth={1.5} /></button>
                        )}
                        <button onClick={() => toggleOp(op.id)} className="p-1 text-[#85858b] hover:text-[#ededed] transition-colors cursor-pointer">
                          {isExpanded ? <ChevronUp className="w-4 h-4" strokeWidth={1.5} /> : <ChevronDown className="w-4 h-4" strokeWidth={1.5} />}
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="p-3 bg-[#0f0f10] border-t border-[rgba(237,237,237,0.06)] space-y-2">
                        <div className="flex justify-between items-center text-xs text-[#85858b]">
                          <span>Registro de compras</span>
                          <span className="font-mono tabular">Capital usado: ${op.invested?.toFixed(2)}</span>
                        </div>
                        {op.logs.length === 0 ? (
                          <div className="text-xs text-[#85858b]">Sin compras registradas.</div>
                        ) : (
                          op.logs.map(log => (
                            <div key={log.id} className="flex justify-between items-center text-xs font-mono border-b border-[rgba(237,237,237,0.06)] py-1.5 last:border-0 tabular">
                              <div className="text-[#85858b]">{log.date}</div>
                              <div className={clsx(log.pnl > 0 ? "text-[#4cc38a]" : log.pnl < 0 ? "text-[#e5484d]" : "text-[#a1a1a6]")}>
                                PNL {log.pnl > 0 ? "+" : ""}{log.pnl}%
                              </div>
                              <div className="text-[#d99b43]">{log.bulletsUsed} balas</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
