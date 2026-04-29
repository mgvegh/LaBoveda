"use client";
import { useState, useEffect, useRef } from "react";
import { User, LogOut, ChevronDown, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

type TickerData = { price: number; };

export default function ProfileButton() {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [cedearsStats, setCedearsStats] = useState({ invested: 0, current: 0 });
  const [criptoSpotStats, setCriptoSpotStats] = useState({ invested: 0, current: 0 });
  const [strategiesStats, setStrategiesStats] = useState({ invested: 0, profit: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchGlobalStats = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // 1. CEDEARs
      const cedearsSnap = await getDocs(collection(db, "users", user.uid, "cedears_purchases"));
      const cedears = cedearsSnap.docs.map(d => d.data());
      let cInv = 0, cCurr = 0;
      if (cedears.length > 0) {
        const uniqueTickers = [...new Set(cedears.map(p => (p.ticker as string).toUpperCase()))];
        const cPrices: Record<string, number> = {};
        await Promise.all(uniqueTickers.map(async t => {
          try { const r = await fetch(`/api/yahoo?ticker=${t}`); if (r.ok) { const d = await r.json(); cPrices[t] = d.price; } } catch { /* skip */ }
        }));
        cedears.forEach(p => { const cost = Number(p.quantity) * Number(p.purchasePrice); cInv += cost; cCurr += Number(p.quantity) * (cPrices[(p.ticker as string).toUpperCase()] || Number(p.purchasePrice)); });
      }
      setCedearsStats({ invested: cInv, current: cCurr });

      // 2. Cripto Spot
      const criptoSnap = await getDocs(collection(db, "users", user.uid, "cripto_portfolio"));
      const cripto = criptoSnap.docs.map(d => d.data());
      let crInv = 0, crCurr = 0;
      if (cripto.length > 0) {
        const uniqueCrTickers = [...new Set(cripto.map(p => (p.ticker as string).toUpperCase()))];
        const crPrices: Record<string, number> = {};
        await Promise.all(uniqueCrTickers.map(async t => {
          try { const r = await fetch(`/api/yahoo?ticker=${t}`); if (r.ok) { const d = await r.json(); crPrices[t] = d.price; } } catch { /* skip */ }
        }));
        cripto.forEach(p => { const cost = Number(p.quantity) * Number(p.purchasePrice); crInv += cost; crCurr += Number(p.quantity) * (crPrices[(p.ticker as string).toUpperCase()] || Number(p.purchasePrice)); });
      }
      setCriptoSpotStats({ invested: crInv, current: crCurr });

      // 3. Strategies (from Firestore doc)
      const { getDoc, doc } = await import("firebase/firestore");
      const stratSnap = await getDoc(doc(db, "users", user.uid, "cripto_strategies", "state"));
      let sInv = 0, sProf = 0;
      if (stratSnap.exists()) {
        const strat = stratSnap.data();
        if (strat.past_operations) {
          strat.past_operations.forEach((op: { invested?: number; profit?: number }) => {
            sInv += Number(op.invested || 0);
            sProf += Number(op.profit || 0);
          });
        }
      }
      setStrategiesStats({ invested: sInv, profit: sProf });
      setHasLoaded(true);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const toggleDropdown = () => {
    if (!isOpen && !hasLoaded) fetchGlobalStats();
    setIsOpen(!isOpen);
  };

  if (!user) return null;

  // Firebase User has email but no .id — use .uid
  const isAdmin = user.email === "vm.admin@laboveda.com";

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={toggleDropdown} className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all text-gray-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10">
        <User className="w-5 h-5 sm:w-4 sm:h-4" />
        <span className="hidden lg:inline font-mono text-xs">{user.email?.split('@')[0]}</span>
        <ChevronDown className="w-4 h-4 hidden sm:block opacity-50" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-[#0f0f13] border border-white/10 rounded-2xl shadow-xl shadow-black/50 overflow-hidden z-50 text-left flex flex-col">
          <div className="p-4 border-b border-white/5 bg-white/[0.02]">
            <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">Bóveda Privada</p>
            <p className="text-sm font-bold text-gray-200 truncate" title={user.email ?? ""}>{user.email}</p>
          </div>
          <div className="p-4 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-300">Rendimiento Global</h3>
              <button onClick={fetchGlobalStats} disabled={isLoading} className="text-gray-500 hover:text-white transition-colors">
                <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin")} />
              </button>
            </div>
            {isLoading && !hasLoaded ? (
              <div className="py-8 flex justify-center"><RefreshCw className="w-6 h-6 text-orange-500 animate-spin" /></div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                  <div className="text-xs text-blue-400 font-semibold mb-1">Portfolio CEDEARs (ARS)</div>
                  <div className="flex justify-between items-end">
                    <div className="text-lg font-bold text-gray-200">${cedearsStats.current.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
                    {cedearsStats.invested > 0 && (
                      <div className={clsx("text-xs font-bold", cedearsStats.current >= cedearsStats.invested ? "text-emerald-400" : "text-red-400")}>
                        {cedearsStats.current >= cedearsStats.invested ? "+" : ""}{(((cedearsStats.current - cedearsStats.invested) / cedearsStats.invested) * 100).toFixed(2)}%
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">Inv: ${cedearsStats.invested.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
                </div>
                <div className="p-3 rounded-xl bg-teal-500/5 border border-teal-500/10">
                  <div className="text-xs text-teal-400 font-semibold mb-1">Portfolio Cripto (USD)</div>
                  <div className="flex justify-between items-end">
                    <div className="text-lg font-bold text-gray-200">${criptoSpotStats.current.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    {criptoSpotStats.invested > 0 && (
                      <div className={clsx("text-xs font-bold", criptoSpotStats.current >= criptoSpotStats.invested ? "text-emerald-400" : "text-red-400")}>
                        {criptoSpotStats.current >= criptoSpotStats.invested ? "+" : ""}{(((criptoSpotStats.current - criptoSpotStats.invested) / criptoSpotStats.invested) * 100).toFixed(2)}%
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">Inv: ${criptoSpotStats.invested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/10">
                  <div className="text-xs text-orange-400 font-semibold mb-1">Estrategias Cripto (USD)</div>
                  <div className="flex justify-between items-end">
                    <div className="text-lg font-bold text-gray-200">Ganancia Neta</div>
                    <div className={clsx("text-sm font-bold", strategiesStats.profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {strategiesStats.profit >= 0 ? "+" : "-"}${Math.abs(strategiesStats.profit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  {strategiesStats.invested > 0 && (
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-gray-500">Histórico: ${strategiesStats.invested.toFixed(2)}</span>
                      <span className={clsx("text-[10px] font-bold", strategiesStats.profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                        ROI: {strategiesStats.profit >= 0 ? "+" : ""}{((strategiesStats.profit / strategiesStats.invested) * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="p-2 border-t border-white/5 bg-black/40 space-y-1">
            {isAdmin && (
              <Link href="/admin" onClick={() => setIsOpen(false)} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors">
                <ShieldCheck className="w-4 h-4" /> Panel Admin
              </Link>
            )}
            <button onClick={signOut} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors">
              <LogOut className="w-4 h-4" /> Cerrar Sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
