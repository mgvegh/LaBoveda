"use client";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase";
import { 
  Users, 
  TrendingUp, 
  Wallet, 
  Search, 
  ArrowLeft, 
  ExternalLink, 
  BarChart3,
  Loader2,
  MessageSquare
} from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

type AdminUserData = {
  u_id: string;
  u_email: string;
  u_joined_at: string;
  total_invested: number;
  total_profit: number;
};

type UserRequest = {
  id: string;
  email: string;
  type: string;
  message: string;
  created_at: string;
};

export default function AdminPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AdminUserData[]>([]);
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequestsLoading, setIsRequestsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const supabase = createClient();

  useEffect(() => {
    if (!user || user.email !== "vm.admin@laboveda.com") return;
    
    const fetchAdminData = async () => {
      setIsLoading(true);
      const { data: rpcData, error } = await supabase.rpc('get_admin_dashboard_data');
      
      if (error) {
        console.error("Error fetching admin data:", error);
      } else if (rpcData) {
        setData(rpcData);
      }
      setIsLoading(false);
    };

    const fetchRequests = async () => {
      setIsRequestsLoading(true);
      const { data: reqData, error } = await supabase
        .from('user_requests')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error("Error fetching user requests:", error);
      } else if (reqData) {
        setRequests(reqData);
      }
      setIsRequestsLoading(false);
    };

    fetchAdminData();
    fetchRequests();
  }, [user]);

  const filteredUsers = useMemo(() => {
    return data.filter(u => 
      u.u_email.toLowerCase().includes(search.toLowerCase()) ||
      u.u_email.split('@')[0].toLowerCase().includes(search.toLowerCase())
    ).sort((a, b) => b.total_invested - a.total_invested);
  }, [data, search]);

  const stats = useMemo(() => {
    const totalUsers = data.length;
    const totalAUM = data.reduce((acc, u) => acc + Number(u.total_invested), 0);
    const totalProfit = data.reduce((acc, u) => acc + Number(u.total_profit), 0);
    const avgProfitPercent = totalAUM > 0 ? (totalProfit / totalAUM) * 100 : 0;

    return { totalUsers, totalAUM, totalProfit, avgProfitPercent };
  }, [data]);

  if (!user || user.email !== "vm.admin@laboveda.com") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-4">
        <h1 className="text-2xl font-bold text-red-500">Acceso Restringido</h1>
        <p className="text-gray-400 text-center max-w-sm">
          No tienes permisos para acceder a esta área de la Bóveda.
        </p>
        <Link href="/" className="text-orange-400 hover:underline">Volver al inicio</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-orange-400 transition-colors mb-2">
            <ArrowLeft className="w-4 h-4" /> Volver
          </Link>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
             <BarChart3 className="w-8 h-8 text-amber-500" /> Panel de Control Administrativo
          </h1>
          <p className="text-gray-400 mt-1">Supervisión global de rendimientos y capital.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-3xl border-amber-500/10 shadow-lg shadow-amber-500/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-400">
              <Users className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-gray-400">Usuarios Totales</span>
          </div>
          <div className="text-4xl font-bold text-white">{stats.totalUsers}</div>
          <div className="mt-2 text-xs text-amber-400 font-medium">+100% de crecimiento real</div>
        </div>

        <div className="glass-panel p-6 rounded-3xl border-blue-500/10 shadow-lg shadow-blue-500/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400">
              <Wallet className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-gray-400">Capital Administrado (Sumatoria)</span>
          </div>
          <div className="text-3xl font-bold text-white">
            ${stats.totalAUM.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-2 text-xs text-blue-400 font-medium">Bajo custodia descentralizada</div>
        </div>

        <div className="glass-panel p-6 rounded-3xl border-emerald-500/10 shadow-lg shadow-emerald-500/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400">
              <TrendingUp className="w-6 h-6" />
            </div>
            <span className="text-sm font-medium text-gray-400">Profit Neto Global</span>
          </div>
          <div className={clsx("text-3xl font-bold", stats.totalProfit >= 0 ? "text-emerald-400" : "text-red-400")}>
            ${stats.totalProfit.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            <span className="text-lg ml-2 opacity-70">({stats.avgProfitPercent.toFixed(1)}%)</span>
          </div>
          <div className="mt-2 text-xs text-emerald-400 font-medium">Resultado consolidado</div>
        </div>
      </div>

      {/* Explorer Table */}
      <div className="glass-panel rounded-3xl overflow-hidden border-white/5">
        <div className="p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-gray-200">Explorador de Usuarios</h2>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              placeholder="Buscar por email o usuario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
             <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
                <p className="text-gray-500 font-medium">Consultando registros históricos...</p>
             </div>
          ) : filteredUsers.length === 0 ? (
             <div className="text-center py-20 text-gray-500">No se encontraron usuarios con ese criterio.</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-white/5">
                  <th className="px-6 py-4 font-semibold">Nombre/Email</th>
                  <th className="px-6 py-4 font-semibold">Registro</th>
                  <th className="px-6 py-4 font-semibold text-right">Inversión Total</th>
                  <th className="px-6 py-4 font-semibold text-right">Profit Neto</th>
                  <th className="px-6 py-4 font-semibold text-right">% Perf.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.map(u => {
                  const profitPercent = u.total_invested > 0 ? (u.total_profit / u.total_invested) * 100 : 0;
                  return (
                    <tr key={u.u_id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-200">{u.u_email.split('@')[0]}</div>
                        <div className="text-xs text-gray-500">{u.u_email}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {new Date(u.u_joined_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-semibold text-gray-200">
                          ${Number(u.total_invested).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </div>
                      </td>
                      <td className={clsx("px-6 py-4 text-right font-bold", u.total_profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {u.total_profit >= 0 ? "+" : "-"}${Math.abs(u.total_profit).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-6 py-4 text-right">
                         <div className={clsx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold", 
                            u.total_profit >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")
                         }>
                           {profitPercent > 0 ? "+" : ""}{profitPercent.toFixed(1)}%
                         </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="p-4 bg-white/[0.01] border-t border-white/5 text-center">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Respetando privacidad: Activos específicos no visibles para administración</p>
        </div>
      </div>

      {/* User Requests Section */}
      <div className="glass-panel rounded-3xl overflow-hidden border-orange-500/10 shadow-lg shadow-orange-500/5">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-200">Buzón de Solicitudes</h2>
            <p className="text-sm text-gray-500 mt-1">Bugs reportados y sugerencias de adiciones de los usuarios.</p>
          </div>
          <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-400">
            <MessageSquare className="w-6 h-6" />
          </div>
        </div>

        <div className="overflow-x-auto">
          {isRequestsLoading ? (
             <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
             </div>
          ) : requests.length === 0 ? (
             <div className="text-center py-12 text-gray-500">No hay solicitudes pendientes en el buzón.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-white/5">
                  <th className="px-6 py-4 font-semibold w-64">De / Email</th>
                  <th className="px-6 py-4 font-semibold w-32">Tipo</th>
                  <th className="px-6 py-4 font-semibold">Mensaje / Detalle</th>
                  <th className="px-6 py-4 font-semibold text-right w-32">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {requests.map(req => (
                  <tr key={req.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4 align-top">
                      <div className="font-bold text-gray-200">{req.email.split('@')[0]}</div>
                      <div className="text-xs text-gray-500">{req.email}</div>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <span className={clsx(
                        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest",
                        req.type === 'bug' ? "bg-red-500/20 text-red-400" : 
                        req.type === 'solicitud' ? "bg-blue-500/20 text-blue-400" : 
                        "bg-gray-500/20 text-gray-400"
                      )}>
                        {req.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <p className="text-sm text-gray-300 leading-relaxed max-w-2xl">
                        {req.message}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right align-top text-xs text-gray-500 tabular-nums">
                      {new Date(req.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}
