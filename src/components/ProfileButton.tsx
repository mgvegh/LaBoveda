"use client";
import { useState, useEffect, useRef } from "react";
import { User, LogOut, ChevronDown, Activity, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase";

type TickerData = {
  price: number;
};

export default function ProfileButton() {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  
  const [cedearsStats, setCedearsStats] = useState({ invested: 0, current: 0 });
  const [criptoSpotStats, setCriptoSpotStats] = useState({ invested: 0, current: 0 });
  const [strategiesStats, setStrategiesStats] = useState({ invested: 0, profit: 0 });

  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchGlobalStats = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // 1. Fetch Cedears
      const { data: cedears } = await supabase.from('cedears_purchases').select('*').eq('user_id', user.id);
      let cInv = 0, cCurr = 0;
      if (cedears && cedears.length > 0) {
        const uniqueCTickers = [...new Set(cedears.map(p => p.ticker.toUpperCase()))];
        const cPrices: Record<string, number> = {};
        
        await Promise.all(uniqueCTickers.map(async (t) => {
          try {
            const res = await fetch(`/api/yahoo?ticker=${t}`);
            if (res.ok) {
              const data = await res.json();
              cPrices[t] = data.price;
            }
          } catch (e) {}
        }));

        cedears.forEach(p => {
          const cost = Number(p.quantity) * Number(p.purchase_price);
          cInv += cost;
          cCurr += Number(p.quantity) * (cPrices[p.ticker.toUpperCase()] || Number(p.purchase_price));
        });
      }
      setCedearsStats({ invested: cInv, current: cCurr });

      // 2. Fetch Cripto Spot
      const { data: cripto } = await supabase.from('cripto_portfolio').select('*').eq('user_id', user.id);
      let crInv = 0, crCurr = 0;
      if (cripto && cripto.length > 0) {
        const uniqueCrTickers = [...new Set(cripto.map(p => p.ticker.toUpperCase()))];
        const crPrices: Record<string, number> = {};
        
        await Promise.all(uniqueCrTickers.map(async (t) => {
          try {
            const res = await fetch(`/api/yahoo?ticker=${t}`);
            if (res.ok) {
              const data = await res.json();
              crPrices[t] = data.price;
            }
          } catch (e) {}
        }));

        cripto.forEach(p => {
          const cost = Number(p.quantity) * Number(p.purchase_price);
          crInv += cost;
          crCurr += Number(p.quantity) * (crPrices[p.ticker.toUpperCase()] || Number(p.purchase_price));
        });
      }
      setCriptoSpotStats({ invested: crInv, current: crCurr });

      // 3. Fetch Strategies
      const { data: strat } = await supabase.from('cripto_strategies').select('*').eq('user_id', user.id).single();
      let sInv = 0, sProf = 0;
      if (strat) {
        if (strat.past_operations) {
          strat.past_operations.forEach((op: any) => {
            sInv += Number(op.invested || 0);
            sProf += Number(op.profit || 0);
          });
        }
        // Count active pool invested if any? We will track just historical ROI for strategies.
      }
      setStrategiesStats({ invested: sInv, profit: sProf });
      setHasLoaded(true);

    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDropdown = () => {
    if (!isOpen && !hasLoaded) {
      fetchGlobalStats();
    }
    setIsOpen(!isOpen);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={toggleDropdown}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10"
      >
        <User className="w-5 h-5 sm:w-4 sm:h-4" />
        <span className="hidden lg:inline font-mono text-xs">{user.email?.split('@')[0]}</span>
        <ChevronDown className="w-4 h-4 hidden sm:block opacity-50" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-[#0f0f13] border border-white/10 rounded-2xl shadow-xl shadow-black/50 overflow-hidden z-50 text-left flex flex-col">
          <div className="p-4 border-b border-white/5 bg-white/[0.02]">
            <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">Bóveda Privada</p>
            <p className="text-sm font-bold text-gray-200 truncate" title={user.email}>{user.email}</p>
          </div>
          
          <div className="p-4 flex-1">
            <div className="flex items-center justify-between mb-4">
               <h3 className="text-sm font-bold text-gray-300">Rendimiento Global</h3>
               <button 
                 onClick={fetchGlobalStats} 
                 disabled={isLoading}
                 className="text-gray-500 hover:text-white transition-colors"
               >
                 <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin")} />
               </button>
            </div>

            {isLoading && !hasLoaded ? (
              <div className="py-8 flex justify-center items-center">
                <RefreshCw className="w-6 h-6 text-orange-500 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* CEDEARS (ARS) */}
                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                  <div className="text-xs text-blue-400 font-semibold mb-1">Portfolio CEDEARs (ARS)</div>
                  <div className="flex justify-between items-end">
                    <div className="text-lg font-bold text-gray-200">
                      ${cedearsStats.current.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </div>
                    {cedearsStats.invested > 0 && (
                      <div className={clsx("text-xs font-bold", cedearsStats.current >= cedearsStats.invested ? "text-emerald-400" : "text-red-400")}>
                        {cedearsStats.current >= cedearsStats.invested ? "+" : ""}
                        {(((cedearsStats.current - cedearsStats.invested) / cedearsStats.invested) * 100).toFixed(2)}%
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">Inv: ${cedearsStats.invested.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
                </div>

                {/* CRIPTO SPOT (USD) */}
                <div className="p-3 rounded-xl bg-teal-500/5 border border-teal-500/10">
                  <div className="text-xs text-teal-400 font-semibold mb-1">Portfolio Cripto (USD)</div>
                  <div className="flex justify-between items-end">
                    <div className="text-lg font-bold text-gray-200">
                      ${criptoSpotStats.current.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    {criptoSpotStats.invested > 0 && (
                      <div className={clsx("text-xs font-bold", criptoSpotStats.current >= criptoSpotStats.invested ? "text-emerald-400" : "text-red-400")}>
                        {criptoSpotStats.current >= criptoSpotStats.invested ? "+" : ""}
                        {(((criptoSpotStats.current - criptoSpotStats.invested) / criptoSpotStats.invested) * 100).toFixed(2)}%
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">Inv: ${criptoSpotStats.invested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>

                {/* ESTRATEGIAS (USD) */}
                <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/10">
                  <div className="text-xs text-orange-400 font-semibold mb-1">Estrategias Cripto (USD)</div>
                  <div className="flex justify-between items-end">
                    <div className="text-lg font-bold text-gray-200">
                      Ganancia Neta
                    </div>
                    <div className={clsx("text-sm font-bold", strategiesStats.profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {strategiesStats.profit >= 0 ? "+" : "-"}${Math.abs(strategiesStats.profit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                     <span className="text-[10px] text-gray-500">Histórico Inv: ${strategiesStats.invested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                     {strategiesStats.invested > 0 && (
                        <span className={clsx("text-[10px] font-bold", strategiesStats.profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                           ROI: {strategiesStats.profit >= 0 ? "+" : ""}{((strategiesStats.profit / strategiesStats.invested) * 100).toFixed(1)}%
                        </span>
                     )}
                  </div>
                </div>

              </div>
            )}
          </div>
          
          <div className="p-2 border-t border-white/5 bg-black/40 space-y-1">
            {user.email === "vm.admin@laboveda.com" && (
              <Link 
                href="/admin"
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" /> Panel Admin
              </Link>
            )}
            <button 
              onClick={signOut}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Cerrar Bóveda
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
