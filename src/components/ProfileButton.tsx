"use client";
import { useState, useEffect, useRef } from "react";
import { User, LogOut, ChevronDown, RefreshCw, ShieldCheck, Download, Upload, Lock, Copy, Check } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, addDoc } from "firebase/firestore";

export default function ProfileButton() {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);
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
      // Fetch dollar rate first
      let usdUala = 1450;
      try {
        const res = await fetch("/api/dolar/uala");
        if (res.ok) {
          const data = await res.json();
          if (data.compra) usdUala = Math.round(data.compra);
        }
      } catch (err) {
        console.error("Error fetching dollar rate in ProfileButton:", err);
      }

      // 1. CEDEARs - Replicate correct positions math
      const cedearsSnap = await getDocs(collection(db, "users", user.uid, "cedears_purchases"));
      const cedears = cedearsSnap.docs.map(d => d.data());
      
      let cInv = 0, cCurr = 0;
      if (cedears.length > 0) {
        const posMap: Record<string, { totalQty: number; totalCost: number }> = {};
        const sorted = [...cedears].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        sorted.forEach(p => {
          const t = (p.ticker as string).toUpperCase();
          if (!posMap[t]) posMap[t] = { totalQty: 0, totalCost: 0 };
          
          const isUsd = p.currency === "USD" || p.currency === "EXT" || p.currency === "MEP";
          let actualPrice = Number(p.purchasePrice);
          
          if (isUsd) {
            if (p.date === "2025-11-28" || p.date === "2024-11-28") {
              actualPrice = Number(p.purchasePrice) * 1482;
            } 
            else if (p.date === "2026-01-28" || p.date === "2026-01-29") {
              actualPrice = Number(p.purchasePrice) * 1472;
            } else {
              actualPrice = Number(p.purchasePrice) * usdUala;
            }
          }

          const qty = Number(p.quantity);
          if (qty > 0) {
            const cost = qty * actualPrice;
            posMap[t].totalQty += qty;
            posMap[t].totalCost += cost;
          } else {
            const qtyToSubtract = Math.abs(qty);
            if (posMap[t].totalQty > 0) {
              const currentPPC = posMap[t].totalCost / posMap[t].totalQty;
              posMap[t].totalQty -= qtyToSubtract;
              posMap[t].totalCost = Math.max(0, posMap[t].totalQty * currentPPC);
            } else {
              posMap[t].totalQty -= qtyToSubtract;
            }
          }
        });

        const activePositions = Object.entries(posMap).filter(([_, data]) => Math.abs(data.totalQty) > 0.001);
        if (activePositions.length > 0) {
          const uniqueTickers = activePositions.map(([t]) => t);
          const cPrices: Record<string, number> = {};
          await Promise.all(uniqueTickers.map(async t => {
            try { const r = await fetch(`/api/yahoo?ticker=${t}`); if (r.ok) { const d = await r.json(); cPrices[t] = d.price; } } catch { /* skip */ }
          }));

          activePositions.forEach(([ticker, data]) => {
            cInv += data.totalCost;
            cCurr += data.totalQty * (cPrices[ticker] || (data.totalQty > 0 ? data.totalCost / data.totalQty : 0));
          });
        }
      }
      setCedearsStats({ invested: cInv, current: cCurr });

      // 2. Cripto Spot - Replicate correct positions math
      const criptoSnap = await getDocs(collection(db, "users", user.uid, "cripto_portfolio"));
      const cripto = criptoSnap.docs.map(d => d.data());
      
      let crInv = 0, crCurr = 0;
      if (cripto.length > 0) {
        const posMap: Record<string, { totalQty: number; invested: number }> = {};
        const sorted = [...cripto].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        sorted.forEach(p => {
          const t = (p.ticker as string).toUpperCase();
          if (!posMap[t]) posMap[t] = { totalQty: 0, invested: 0 };
          
          const qty = Number(p.quantity);
          const price = Number(p.purchasePrice);
          if (qty > 0) {
            const cost = qty * price;
            posMap[t].totalQty += qty;
            posMap[t].invested += cost;
          } else {
            const qtyToSubtract = Math.abs(qty);
            if (posMap[t].totalQty > 0) {
              const currentPPC = posMap[t].invested / posMap[t].totalQty;
              posMap[t].totalQty -= qtyToSubtract;
              posMap[t].invested = Math.max(0, posMap[t].totalQty * currentPPC);
            } else {
              posMap[t].totalQty -= qtyToSubtract;
            }
          }
        });

        const activeCripto = Object.entries(posMap).filter(([_, data]) => Math.abs(data.totalQty) > 0.0001);
        if (activeCripto.length > 0) {
          const uniqueCrTickers = activeCripto.map(([t]) => t);
          const crPrices: Record<string, number> = {};
          await Promise.all(uniqueCrTickers.map(async t => {
            try { const r = await fetch(`/api/yahoo?ticker=${t}`); if (r.ok) { const d = await r.json(); crPrices[t] = d.price; } } catch { /* skip */ }
          }));

          activeCripto.forEach(([ticker, data]) => {
            crInv += data.invested;
            crCurr += data.totalQty * (crPrices[ticker] || (data.totalQty > 0 ? data.invested / data.totalQty : 0));
          });
        }
      }
      setCriptoSpotStats({ invested: crInv, current: crCurr });

      // 3. Strategies (from Firestore doc)
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

  const handleExportData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // 1. Fetch Income Config
      const incomeConfigSnap = await getDoc(doc(db, "users", user.uid, "income_config", "data"));
      const incomeConfig = incomeConfigSnap.exists() ? incomeConfigSnap.data() : null;

      // 2. Fetch Cedears Purchases
      const cedearsSnap = await getDocs(collection(db, "users", user.uid, "cedears_purchases"));
      const cedearsPurchases = cedearsSnap.docs.map(d => d.data());

      // 3. Fetch Cedears CSV Imports
      const cedearsImportsSnap = await getDocs(collection(db, "users", user.uid, "cedears_csv_imports"));
      const cedearsCsvImports = cedearsImportsSnap.docs.map(d => d.data());

      // 4. Fetch Cripto Portfolio
      const criptoSnap = await getDocs(collection(db, "users", user.uid, "cripto_portfolio"));
      const criptoPortfolio = criptoSnap.docs.map(d => d.data());

      // 5. Fetch Cripto Strategies State
      const stratSnap = await getDoc(doc(db, "users", user.uid, "cripto_strategies", "state"));
      const criptoStrategies = stratSnap.exists() ? stratSnap.data() : null;

      // 6. Fetch Fuel Records
      const fuelSnap = await getDocs(collection(db, "users", user.uid, "fuel_records"));
      const fuelRecords = fuelSnap.docs.map(d => d.data());

      // 7. Fetch Vehicles
      const vehiclesSnap = await getDocs(collection(db, "users", user.uid, "vehicles"));
      const vehicles = vehiclesSnap.docs.map(d => d.data());

      // 8. Fetch Tutor Classes & Settings
      const tutorClassesSnap = await getDocs(collection(db, "users", user.uid, "tutorClasses"));
      const tutorClasses = tutorClassesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const tutorSettingsSnap = await getDoc(doc(db, "users", user.uid, "settings", "tutor"));
      const tutorSettings = tutorSettingsSnap.exists() ? tutorSettingsSnap.data() : null;

      const backupData = {
        version: "3.0",
        exportedAt: new Date().toISOString(),
        userEmail: user.email,
        incomeConfig,
        cedearsPurchases,
        cedearsCsvImports,
        criptoPortfolio,
        criptoStrategies,
        fuelRecords,
        vehicles,
        tutorClasses,
        tutorSettings
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `Boveda_Backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      console.error(e);
      alert("Error al exportar los datos.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const confirmImport = confirm("¿Estás seguro de que deseas importar estos datos? Esto actualizará tus registros con la información del backup.");
    if (!confirmImport) {
      e.target.value = "";
      return;
    }

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const backup = JSON.parse(text);

        if (!backup.version) {
          alert("El archivo de backup no es válido.");
          setIsLoading(false);
          return;
        }

        // 1. Import Income Config (overwrite document)
        if (backup.incomeConfig) {
          await setDoc(doc(db, "users", user.uid, "income_config", "data"), backup.incomeConfig);
        }

        // 2. Overwrite CEDEARs Purchases
        const existingCedears = await getDocs(collection(db, "users", user.uid, "cedears_purchases"));
        for (const docObj of existingCedears.docs) {
          await deleteDoc(doc(db, "users", user.uid, "cedears_purchases", docObj.id));
        }
        if (backup.cedearsPurchases) {
          for (const item of backup.cedearsPurchases) {
            await addDoc(collection(db, "users", user.uid, "cedears_purchases"), item);
          }
        }

        // 3. Overwrite CEDEARs CSV Imports
        const existingImports = await getDocs(collection(db, "users", user.uid, "cedears_csv_imports"));
        for (const docObj of existingImports.docs) {
          await deleteDoc(doc(db, "users", user.uid, "cedears_csv_imports", docObj.id));
        }
        if (backup.cedearsCsvImports) {
          for (const item of backup.cedearsCsvImports) {
            await addDoc(collection(db, "users", user.uid, "cedears_csv_imports"), item);
          }
        }

        // 4. Overwrite Cripto Portfolio
        const existingCripto = await getDocs(collection(db, "users", user.uid, "cripto_portfolio"));
        for (const docObj of existingCripto.docs) {
          await deleteDoc(doc(db, "users", user.uid, "cripto_portfolio", docObj.id));
        }
        if (backup.criptoPortfolio) {
          for (const item of backup.criptoPortfolio) {
            await addDoc(collection(db, "users", user.uid, "cripto_portfolio"), item);
          }
        }

        // 5. Import Cripto Strategies State (overwrite document)
        if (backup.criptoStrategies) {
          await setDoc(doc(db, "users", user.uid, "cripto_strategies", "state"), backup.criptoStrategies);
        }

        // 6. Overwrite Fuel Records
        const existingFuel = await getDocs(collection(db, "users", user.uid, "fuel_records"));
        for (const docObj of existingFuel.docs) {
          await deleteDoc(doc(db, "users", user.uid, "fuel_records", docObj.id));
        }
        if (backup.fuelRecords) {
          for (const item of backup.fuelRecords) {
            await addDoc(collection(db, "users", user.uid, "fuel_records"), item);
          }
        }

        // 7. Overwrite Vehicles
        const existingVehicles = await getDocs(collection(db, "users", user.uid, "vehicles"));
        for (const docObj of existingVehicles.docs) {
          await deleteDoc(doc(db, "users", user.uid, "vehicles", docObj.id));
        }
        if (backup.vehicles) {
          for (const item of backup.vehicles) {
            await addDoc(collection(db, "users", user.uid, "vehicles"), item);
          }
        }

        // 8. Overwrite Tutor Classes & Settings
        if (backup.tutorClasses) {
          const existingClasses = await getDocs(collection(db, "users", user.uid, "tutorClasses"));
          for (const docObj of existingClasses.docs) {
            await deleteDoc(doc(db, "users", user.uid, "tutorClasses", docObj.id));
          }
          for (const item of backup.tutorClasses) {
            const { id: _id, ...cleanItem } = item;
            await addDoc(collection(db, "users", user.uid, "tutorClasses"), cleanItem);
          }
        }
        if (backup.tutorSettings) {
          await setDoc(doc(db, "users", user.uid, "settings", "tutor"), backup.tutorSettings);
        }

        alert("¡Datos importados con éxito! Recargando para aplicar los cambios.");
        window.location.reload();
      } catch (e) {
        console.error(e);
        const errMsg = e instanceof Error ? e.message : String(e);
        alert(`Error al parsear o guardar el archivo de backup: ${errMsg}`);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const toggleDropdown = () => {
    if (!isOpen && !hasLoaded) fetchGlobalStats();
    setIsOpen(!isOpen);
  };

  if (!user) return null;

  const isAdmin = user.email === "vm.admin@laboveda.com";

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={toggleDropdown}
          className="flex items-center gap-2 h-9 px-2.5 text-sm font-medium rounded-lg transition-colors duration-150 text-[#a1a1a6] hover:text-[#ededed] hover:bg-[#19191b] border border-[rgba(237,237,237,0.08)] cursor-pointer"
          title={`Sesión iniciada como ${user.email}`}
        >
          <div className="w-5 h-5 rounded-md bg-[#232325] border border-[rgba(237,237,237,0.1)] flex items-center justify-center text-[#d99b43] font-mono text-xs uppercase shrink-0">
            {user.email ? user.email.charAt(0) : <User className="w-3.5 h-3.5" />}
          </div>
          <span className="hidden md:inline font-mono text-xs max-w-[120px] truncate">{user.email?.split('@')[0]}</span>
          <ChevronDown className={clsx("w-3.5 h-3.5 text-[#85858b] transition-transform duration-150", isOpen && "rotate-180")} strokeWidth={1.5} />
        </button>

        {isOpen && (
          <div
            data-profile-dropdown
            className="absolute right-0 mt-2 w-[calc(100vw-24px)] max-w-[340px] sm:w-80 rounded-xl bg-[#19191b] border border-[rgba(237,237,237,0.12)] overflow-hidden z-50 text-left flex flex-col max-h-[85vh] overflow-y-auto"
          >
            <div className="p-4 border-b border-[rgba(237,237,237,0.08)] bg-[#141415]">
              <p className="text-xs text-[#85858b]">Cuenta</p>
              <p className="text-sm font-medium text-[#ededed] truncate mt-0.5" title={user.email ?? ""}>{user.email}</p>
              <div className="flex items-center justify-between mt-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4cc38a]" />
                  <span className="text-xs text-[#a1a1a6]">Sincronizado</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(user.uid);
                    setCopiedUid(true);
                    setTimeout(() => setCopiedUid(false), 2000);
                  }}
                  className="text-xs text-[#a1a1a6] hover:text-[#ededed] flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#232325] border border-[rgba(237,237,237,0.08)] transition-colors duration-150 cursor-pointer"
                  title="Copiar UID para MCP"
                >
                  {copiedUid ? <Check className="w-3 h-3 text-[#4cc38a]" strokeWidth={1.5} /> : <Copy className="w-3 h-3" strokeWidth={1.5} />}
                  <span>{copiedUid ? "Copiado" : "Copiar UID"}</span>
                </button>
              </div>
            </div>

            <div className="p-4 flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-[#a1a1a6]">Resumen de portafolios</h3>
                <button onClick={fetchGlobalStats} disabled={isLoading} className="text-[#85858b] hover:text-[#ededed] transition-colors cursor-pointer" title="Actualizar cotizaciones">
                  <RefreshCw className={clsx("w-3.5 h-3.5", isLoading && "animate-spin")} strokeWidth={1.5} />
                </button>
              </div>
              {isLoading && !hasLoaded ? (
                <div className="py-6 flex justify-center"><RefreshCw className="w-4 h-4 text-[#d99b43] animate-spin" /></div>
              ) : (
                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-[#232325] border border-[rgba(237,237,237,0.08)]">
                    <div className="text-xs text-[#a1a1a6] mb-1">Portfolio CEDEARs (ARS)</div>
                    <div className="flex justify-between items-baseline">
                      <div className="text-sm font-mono font-medium text-[#ededed] tabular">${cedearsStats.current.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
                      {cedearsStats.invested > 0 && (
                        <div className={clsx("text-xs font-mono tabular", cedearsStats.current >= cedearsStats.invested ? "text-[#4cc38a]" : "text-[#e5484d]")}>
                          {cedearsStats.current >= cedearsStats.invested ? "+" : ""}{(((cedearsStats.current - cedearsStats.invested) / cedearsStats.invested) * 100).toFixed(2)}%
                        </div>
                      )}
                    </div>
                    <div className="text-xs font-mono text-[#85858b] mt-0.5 tabular">Inv: ${cedearsStats.invested.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
                  </div>

                  <div className="p-3 rounded-lg bg-[#232325] border border-[rgba(237,237,237,0.08)]">
                    <div className="text-xs text-[#a1a1a6] mb-1">Portfolio Cripto (USD)</div>
                    <div className="flex justify-between items-baseline">
                      <div className="text-sm font-mono font-medium text-[#ededed] tabular">${criptoSpotStats.current.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      {criptoSpotStats.invested > 0 && (
                        <div className={clsx("text-xs font-mono tabular", criptoSpotStats.current >= criptoSpotStats.invested ? "text-[#4cc38a]" : "text-[#e5484d]")}>
                          {criptoSpotStats.current >= criptoSpotStats.invested ? "+" : ""}{(((criptoSpotStats.current - criptoSpotStats.invested) / criptoSpotStats.invested) * 100).toFixed(2)}%
                        </div>
                      )}
                    </div>
                    <div className="text-xs font-mono text-[#85858b] mt-0.5 tabular">Inv: ${criptoSpotStats.invested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>

                  <div className="p-3 rounded-lg bg-[#232325] border border-[rgba(237,237,237,0.08)]">
                    <div className="text-xs text-[#a1a1a6] mb-1">Estrategias Cripto (USD)</div>
                    <div className="flex justify-between items-baseline">
                      <div className="text-xs text-[#85858b]">Ganancia neta</div>
                      <div className={clsx("text-sm font-mono font-medium tabular", strategiesStats.profit >= 0 ? "text-[#4cc38a]" : "text-[#e5484d]")}>
                        {strategiesStats.profit >= 0 ? "+" : "-"}${Math.abs(strategiesStats.profit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    {strategiesStats.invested > 0 && (
                      <div className="flex justify-between mt-0.5 text-xs font-mono tabular">
                        <span className="text-[#85858b]">Histórico: ${strategiesStats.invested.toFixed(2)}</span>
                        <span className={clsx(strategiesStats.profit >= 0 ? "text-[#4cc38a]" : "text-[#e5484d]")}>
                          ROI {strategiesStats.profit >= 0 ? "+" : ""}{((strategiesStats.profit / strategiesStats.invested) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[rgba(237,237,237,0.08)] bg-[#141415] space-y-2">
              <h4 className="text-xs font-medium text-[#85858b]">Respaldo y migración</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleExportData}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-lg text-[#ededed] bg-[#232325] hover:bg-[#2a2a2d] border border-[rgba(237,237,237,0.08)] transition-colors duration-150 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#85858b]" strokeWidth={1.5} /> Exportar JSON
                </button>
                <label
                  className={clsx(
                    "flex items-center justify-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-lg text-[#ededed] bg-[#232325] hover:bg-[#2a2a2d] border border-[rgba(237,237,237,0.08)] transition-colors duration-150 cursor-pointer text-center",
                    isLoading && "pointer-events-none opacity-50"
                  )}
                >
                  <Upload className="w-3.5 h-3.5 text-[#85858b]" strokeWidth={1.5} /> Importar JSON
                  <input
                    type="file"
                    onChange={handleImportData}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="p-2 border-t border-[rgba(237,237,237,0.08)] bg-[#0f0f10] space-y-1">
              <Link
                href="/privacidad"
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center justify-center gap-2 h-8 px-3 text-xs font-medium rounded-lg text-[#a1a1a6] hover:text-[#ededed] hover:bg-[#19191b] transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" strokeWidth={1.5} /> Seguridad y privacidad
              </Link>
              {isAdmin && (
                <Link href="/admin" onClick={() => setIsOpen(false)} className="w-full flex items-center justify-center gap-2 h-8 px-3 text-xs font-medium rounded-lg text-[#d99b43] hover:bg-[#19191b] transition-colors">
                  <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.5} /> Panel admin
                </Link>
              )}
              <button onClick={signOut} className="w-full flex items-center justify-center gap-2 h-8 px-3 text-xs font-medium rounded-lg text-[#e5484d] hover:bg-[#e5484d]/10 transition-colors cursor-pointer">
                <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} /> Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

