"use client";
import { useState, useEffect } from "react";
import { RotateCcw, Crosshair, AlertTriangle, CheckCircle2, Save, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase";

type TradeLog = {
  id: string;
  date: string;       
  timestamp: number;  
  pnl: number;
  bulletsUsed: number;
  type: string;
};

type PastOperation = {
  id: string;
  name: string;
  strategy: "MS_BTC" | "AV_ETH";
  date: string;
  startDateTs: number;
  endDateTs: number;
  invested: number;
  profit: number;
  logs: TradeLog[];
};

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
  const supabase = createClient();

  useEffect(() => {
    setIsClient(true);
    if (!user) return;
    
    const fetchState = async () => {
      const { data, error } = await supabase.from('cripto_strategies').select('*').eq('user_id', user.id).single();
      if (data && !error) {
        if (data.logs) setLogs(data.logs);
        if (data.past_operations) setPastOperations(data.past_operations);
        if (data.base_investment) setBaseInvestment(Number(data.base_investment));
        if (data.available_bullets) setAvailableBullets(Number(data.available_bullets));
        if (data.active_strategy) setActiveStrategy(data.active_strategy);
      }
    };
    fetchState();
  }, [user]);

  useEffect(() => {
    if (isClient && user) {
      const saveState = async () => {
        await supabase.from('cripto_strategies').upsert({
          user_id: user.id,
          base_investment: baseInvestment,
          available_bullets: availableBullets,
          active_strategy: activeStrategy,
          logs: logs,
          past_operations: pastOperations,
          updated_at: new Date().toISOString()
        });
      };
      
      const timeoutId = setTimeout(() => saveState(), 1000); // Debounce de 1 segundo
      return () => clearTimeout(timeoutId);
    }
  }, [logs, pastOperations, baseInvestment, availableBullets, activeStrategy, isClient, user]);

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
      // AV ETH (SHORT) - Reglas aportadas
      // PNL always references Profitability. Si PNL > 0, es Positivo (el trade va ganancioso)
      if (currentPnl > 20) return { bullets: 0, msg: "Cierre Obligatorio (>20%)", color: "text-emerald-500" };
      if (currentPnl > 15) return { bullets: 1, msg: "Cierre Sugerido (15-20%): 1 bala opcional", color: "text-emerald-400" };
      if (currentPnl > 5) return { bullets: 1, msg: "Positivo > 5%: 1 bala a posición", color: "text-purple-400" };
      if (currentPnl > 0) return { bullets: 2, msg: "Positivo hasta 5%: 2 balas a posición", color: "text-purple-500" };
      
      // Zero / Entry
      // Comparing strictly with 0 for "Inicio".
      if (currentPnl === 0) return { bullets: 3, msg: "Inicio / Break Even (0%): 3 balas a posición", color: "text-blue-400" };
      
      // Negatives. PNL < 0 means loss.
      if (currentPnl >= -5) return { bullets: 3, msg: "Negativo hasta 5%: 3 balas a posición", color: "text-amber-400" };
      if (currentPnl >= -10) return { bullets: 4, msg: "Negativo hasta 10%: 4 balas a posición", color: "text-orange-400" };
      if (currentPnl >= -15) return { bullets: 5, msg: "Negativo hasta 15%: 5 balas a posición", color: "text-orange-500" };
      if (currentPnl >= -40) return { bullets: 6, msg: "Negativo > 15%: 6 balas a posición", color: "text-red-400" };
      if (currentPnl >= -60) return { bullets: 6, msg: "Crítico > 40%: 3 a posición + 3 a margen", color: "text-red-600" };
      
      // We interpret < -60% as terminal
      return { bullets: 6, msg: "Terminal (>60%): 6 balas a margen", color: "text-red-700" };
    }
  };

  const suggestion = getRuleSuggestion(pnl, activeStrategy);

  const handleFireBullets = () => {
    if (suggestion.bullets === 0) return;
    if (availableBullets < suggestion.bullets) {
       alert("No tienes suficientes balas en el pozo.");
       return;
    }

    setAvailableBullets(prev => prev - suggestion.bullets);
    const newLog: TradeLog = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      timestamp: Date.now(),
      pnl: pnl,
      bulletsUsed: suggestion.bullets,
      type: suggestion.msg
    };
    setLogs(prev => [newLog, ...prev]);
    setPnlInput("");
  };

  const handeCloseOperation = () => {
    const profit = parseFloat(operationProfitInput) || 0;
    const sameStrategyOps = pastOperations.filter(o => o.strategy === activeStrategy);
    const opNumber = sameStrategyOps.length + 1;
    const prefix = activeStrategy === "MS_BTC" ? "MS" : "AV";
    const name = `${prefix}${opNumber.toString().padStart(2, '0')}`;
    
    const endTs = Date.now();
    const startTs = logs.length > 0 ? logs[logs.length - 1].timestamp : endTs;
    const invested = usedBullets * bulletSize;

    const newOp: PastOperation = {
      id: Date.now().toString(),
      name: name,
      strategy: activeStrategy,
      date: new Date().toLocaleDateString(),
      startDateTs: startTs,
      endDateTs: endTs,
      invested: invested > 0 ? invested : 1,
      profit: profit,
      logs: [...logs]
    };
    setPastOperations(prev => [newOp, ...prev]);
    
    // Reset pool
    setAvailableBullets(30);
    setLogs([]);
    setOperationProfitInput("");
    alert(`Operación ${name} cerrada. Balas reseteadas a 30.`);
  };

  const handleLiquidation = () => {
    const invested = usedBullets * bulletSize;
    if (invested === 0) {
      alert("No hay balas invertidas en la operación actual.");
      return;
    }

    const sameStrategyOps = pastOperations.filter(o => o.strategy === activeStrategy);
    const opNumber = sameStrategyOps.length + 1;
    const prefix = activeStrategy === "MS_BTC" ? "MS" : "AV";
    const name = `${prefix}${opNumber.toString().padStart(2, '0')} [LIQ]`;
    
    const endTs = Date.now();
    const startTs = logs.length > 0 ? logs[logs.length - 1].timestamp : endTs;

    const newOp: PastOperation = {
      id: Date.now().toString(),
      name: name,
      strategy: activeStrategy,
      date: new Date().toLocaleDateString(),
      startDateTs: startTs,
      endDateTs: endTs,
      invested: invested,
      profit: -invested,
      logs: [...logs]
    };
    
    setPastOperations(prev => [newOp, ...prev]);
    setAvailableBullets(30);
    setLogs([]);
    setOperationProfitInput("");
  };

  const toggleOp = (id: string) => {
     setExpandedOpId(prev => prev === id ? null : id);
  };

  const deleteOp = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("¿Seguro que querés eliminar esta operación del historial permanentemente?")) {
      setPastOperations(prev => prev.filter(o => o.id !== id));
    }
  };

  const isAV = activeStrategy === "AV_ETH";
  
  // -- CÁLCULOS GLOBALES ROI --
  const sameStrategyOpsForCalc = pastOperations.filter(op => op.strategy === activeStrategy);
  const totalInvCripto = sameStrategyOpsForCalc.reduce((acc, op) => acc + (op.invested || 0), 0);
  const totalProfCripto = sameStrategyOpsForCalc.reduce((acc, op) => acc + (op.profit || 0), 0);
  const globalRoiCripto = totalInvCripto > 0 ? (totalProfCripto / totalInvCripto) * 100 : 0;
  
  if (!isClient) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 p-2 bg-white/5 rounded-2xl w-fit mb-6 shadow-inner">
        <button 
          onClick={() => setActiveStrategy("MS_BTC")}
          className={clsx("px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap", !isAV ? "bg-orange-500/20 text-orange-400 shadow-sm" : "text-gray-400 hover:text-white")}
        >
          Estrategia MS BTC (Long)
        </button>
        <button 
          onClick={() => setActiveStrategy("AV_ETH")}
          className={clsx("px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap", isAV ? "bg-purple-500/20 text-purple-400 shadow-sm" : "text-gray-400 hover:text-white")}
        >
          Estrategia Anti-Vitalik (Short)
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={clsx("glass-panel p-6 rounded-2xl md:col-span-2 shadow-lg", isAV ? "border-purple-500/10 shadow-purple-500/5" : "border-orange-500/10 shadow-orange-500/5")}>
           <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
             <Crosshair className={clsx("w-5 h-5", isAV ? "text-purple-400" : "text-orange-400")} /> 
             Parámetros ({isAV ? "Anti-Vitalik" : "MS BTC"})
           </h2>
           <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className={clsx("glass p-4 rounded-xl text-center", isAV ? "border-purple-500/10" : "border-orange-500/10")}>
                <div className="text-sm text-gray-400 mb-1">Monto Total</div>
                <input 
                  type="number" 
                  value={baseInvestment}
                  onChange={(e) => setBaseInvestment(Number(e.target.value))}
                  className={clsx("w-full bg-transparent text-center text-2xl font-bold text-white focus:outline-none focus:border-b transition-colors", isAV ? "focus:border-purple-500" : "focus:border-orange-500")}
                />
              </div>
              <div className={clsx("glass p-4 rounded-xl text-center", isAV ? "border-purple-500/10" : "border-orange-500/10")}>
                <div className="text-sm text-gray-400 mb-1">1 Bala =</div>
                <div className={clsx("text-2xl font-bold", isAV ? "text-purple-400" : "text-orange-400")}>${bulletSize.toFixed(2)}</div>
              </div>
              <div className={clsx("glass p-4 rounded-xl text-center", isAV ? "border-purple-500/10" : "border-orange-500/10")}>
                <div className="text-sm text-gray-400 mb-1">Balas Restantes</div>
                <div className={clsx("text-2xl font-bold", availableBullets <= 5 ? "text-red-400" : "text-white")}>
                  {availableBullets} / 30
                </div>
              </div>
              <div className={clsx("glass p-4 rounded-xl text-center", isAV ? "border-purple-500/10" : "border-orange-500/10")}>
                <div className="text-sm text-gray-400 mb-1">Inv. Actual</div>
                <div className="text-2xl font-bold text-gray-200">
                  ${(usedBullets * bulletSize).toFixed(2)}
                </div>
              </div>
           </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-center border-emerald-500/10 relative overflow-hidden">
           <h3 className="text-lg font-medium text-gray-300 mb-3 relative z-10">Cerrar Operación Actual</h3>
           <div className="flex gap-2 mb-3 relative z-10">
             <input 
                type="number"
                placeholder="Profit Final ($)"
                value={operationProfitInput}
                onChange={(e) => setOperationProfitInput(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
             />
           </div>
           
           <div className="flex flex-col gap-2 relative z-10 mt-1">
             <button 
               onClick={handeCloseOperation}
               className="w-full flex items-center justify-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 py-2.5 rounded-lg transition-colors font-medium border border-emerald-500/30"
             >
               <RotateCcw className="w-4 h-4" /> Guardar Profit y Resetear
             </button>
             
             <button 
               onClick={handleLiquidation}
               className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 py-2.5 rounded-lg transition-colors text-sm font-medium border border-red-500/20 group relative overflow-hidden"
             >
               <div className="absolute inset-0 bg-red-500/20 -translate-x-full group-hover:block hidden animate-[shimmer_1.5s_infinite]" />
               <AlertTriangle className="w-4 h-4" /> Operación Liquidada
             </button>
           </div>
        </div>
      </div>

      <div className="glass p-6 rounded-2xl relative overflow-hidden">
        <div className={clsx("absolute top-0 left-0 w-1 h-full", isAV ? "bg-purple-500" : "bg-orange-500")}></div>
        <h2 className="text-xl font-semibold mb-6">Ejecutor de Reglas ({isAV ? "ETH SHORT" : "BTC LONG"})</h2>
        
        <form 
          className="flex flex-col md:flex-row gap-6 items-center"
          onSubmit={(e) => {
            e.preventDefault();
            if (pnlInput !== "" && suggestion.bullets > 0 && availableBullets >= suggestion.bullets) {
              handleFireBullets();
            }
          }}
        >
          <div className="w-full md:w-1/3">
            <label className="block text-sm text-gray-400 mb-2">PNL Actual de la Posición (%)</label>
            <div className="relative">
              <input 
                type="number" 
                step="0.01"
                placeholder={isAV ? "0.00" : "-5.5"}
                value={pnlInput}
                onChange={(e) => setPnlInput(e.target.value)}
                className={clsx("w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-10 py-4 text-xl text-white focus:outline-none transition-colors", isAV ? "focus:border-purple-500" : "focus:border-orange-500")}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
            </div>
            <span className="text-xs text-gray-500 mt-2 block">
              Tip: Escribe "0" exacto para aplicar regla de Inicio en nueva campaña.
            </span>
          </div>

          <div className="w-full md:w-2/3 p-4 rounded-xl border border-white/5 bg-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-sm text-gray-400 mb-1">Acción Sugerida:</div>
              {pnlInput === "" ? (
                <div className="text-lg text-gray-500">Ingresa el PNL actual...</div>
              ) : (
                <div className={clsx("text-lg sm:text-xl font-bold flex items-center gap-2", suggestion.color)}>
                  {pnl > 15 ? <CheckCircle2 className="w-5 h-5"/> : <AlertTriangle className="w-5 h-5" />}
                  {suggestion.msg}
                </div>
              )}
            </div>
            
            <button 
              type="submit"
              disabled={pnlInput === "" || suggestion.bullets === 0 || availableBullets < suggestion.bullets}
              className={clsx(
                "whitespace-nowrap disabled:bg-gray-800 disabled:text-gray-500 disabled:shadow-none text-white px-6 py-3 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed flex items-center gap-2 shadow-lg",
                isAV ? "bg-purple-600 hover:bg-purple-500 shadow-purple-500/20" : "bg-orange-600 hover:bg-orange-500 shadow-orange-500/20"
              )}
            >
              <Save className="w-4 h-4" /> Ejecutar y Guardar
            </button>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl">
          <h2 className={clsx("text-lg font-semibold mb-4", isAV ? "text-purple-400" : "text-orange-400")}>Balas Posición Actual</h2>
          {logs.length === 0 ? (
            <p className="text-gray-500 text-sm">No se han disparado balas en esta operación.</p>
          ) : (
            <div className="space-y-3">
              {logs.map(log => (
                <div key={log.id} className="bg-black/40 border border-white/5 p-3 rounded-lg flex justify-between items-center">
                  <div>
                    <div className="text-sm text-white font-medium">{log.type}</div>
                    <div className="text-xs text-gray-500">{log.date}</div>
                  </div>
                  <div className="text-right">
                    <div className={clsx("font-bold", log.pnl > 0 ? "text-emerald-400" : (log.pnl < 0 ? "text-red-400" : "text-gray-400"))}>
                      {log.pnl > 0 ? "+" : ""}{log.pnl}%
                    </div>
                    <div className={clsx("text-xs mr-1", isAV ? "text-purple-400" : "text-orange-400")}>{log.bulletsUsed} balas</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-4 border-b border-white/10 pb-4 gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">Historial de Operaciones</h2>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                 <div>
                   <span className="text-gray-400">Rendimiento Histórico: </span>
                   <span className={clsx("font-bold", totalProfCripto >= 0 ? "text-emerald-400" : "text-red-400")}>
                     {totalProfCripto >= 0 ? "+" : "-"}${Math.abs(totalProfCripto).toFixed(2)} ({globalRoiCripto > 0 ? "+" : ""}{globalRoiCripto.toFixed(1)}%)
                   </span>
                 </div>
              </div>
            </div>
          </div>
          
          {sameStrategyOpsForCalc.length === 0 ? (
            <p className="text-gray-500 text-sm">Aún no hay operaciones cerradas para esta estrategia.</p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {sameStrategyOpsForCalc.map(op => {
                const isExpanded = expandedOpId === op.id;
                const roi = (op.profit / (op.invested || 1)) * 100;
                const isOpAV = op.strategy === "AV_ETH";
                
                return (
                  <div key={op.id} className="bg-black/40 border border-white/5 rounded-lg overflow-hidden transition-all flex flex-col">
                    <div className="w-full flex items-center p-3 hover:bg-white/5 transition-colors">
                      
                      {/* Área clicleable Principal (Acordeón) */}
                      <div 
                        onClick={() => toggleOp(op.id)}
                        className="flex-1 flex justify-between items-center cursor-pointer pr-4"
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className={clsx("font-bold text-lg", isOpAV ? "text-purple-400" : "text-orange-400")}>{op.name}</span>
                          <div className="text-xs text-gray-400 flex items-center gap-2 mt-1">
                            <span>{op.date}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                           <div className={clsx("font-bold text-base", op.profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                             {op.profit >= 0 ? "+" : "-"}${Math.abs(op.profit).toFixed(2)}
                           </div>
                           <div className="text-xs text-gray-500 font-medium">
                             ROI: {roi > 0 ? "+" : ""}{roi.toFixed(1)}%
                           </div>
                        </div>
                      </div>

                      {/* Botones de Acción (Separados) */}
                      <div className="flex items-center gap-2 pl-4 border-l border-white/10 shrink-0">
                        {confirmDeleteId === op.id ? (
                          <div className="flex items-center gap-1 bg-red-500/10 p-1 rounded">
                            <button 
                              onClick={() => {
                                setPastOperations(prev => prev.filter(o => o.id !== op.id));
                                setConfirmDeleteId(null);
                              }}
                              className="text-white text-xs font-bold px-2 py-1 bg-red-600 rounded hover:bg-red-500 transition-colors shadow-lg"
                            >
                              BORRAR
                            </button>
                            <button 
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-gray-300 text-xs px-2 py-1 hover:text-white transition-colors"
                            >
                              x
                            </button>
                          </div>
                        ) : (
                          <button 
                            type="button"
                            onClick={() => setConfirmDeleteId(op.id)}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            title="Eliminar operación"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => toggleOp(op.id)} className="p-1 text-gray-400 hover:text-white transition-colors">
                          {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400"/> : <ChevronDown className="w-5 h-5 text-gray-400"/>}
                        </button>
                      </div>
                    </div>
                    
                    {isExpanded && (
                       <div className="p-3 bg-black/60 border-t border-white/5 space-y-2">
                         <div className="flex justify-between items-center mb-3">
                           <div className="text-xs text-gray-400 uppercase tracking-wide">Registro de Compras:</div>
                           <div className={clsx("text-xs opacity-60", isOpAV?"text-purple-200":"text-orange-200")}>Capital Usado: ~${op.invested?.toFixed(2)}</div>
                         </div>
                         {op.logs.length === 0 ? (
                           <div className="text-xs text-gray-500">Sin compras registradas durante la operación.</div>
                         ) : (
                           op.logs.map(log => (
                             <div key={log.id} className="flex justify-between items-center text-xs border-b border-white/5 pb-2 pt-2 first:pt-0 last:border-0 last:pb-0">
                               <div className="text-gray-400">{log.date}</div>
                               <div className={clsx("font-medium", log.pnl > 0 ? "text-emerald-400" : (log.pnl < 0 ? "text-red-400" : "text-gray-400"))}>
                                 PNL: {log.pnl > 0 ? "+" : ""}{log.pnl}%
                               </div>
                               <div className={clsx("font-semibold px-2 py-0.5 rounded", isOpAV?"text-purple-300 bg-purple-500/10":"text-orange-300 bg-orange-500/10")}>{log.bulletsUsed} balas</div>
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
