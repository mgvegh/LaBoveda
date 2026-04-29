"use client";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, updateDoc, query, orderBy } from "firebase/firestore";
import { Users, TrendingUp, Wallet, Search, ArrowLeft, BarChart3, Loader2, MessageSquare } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

type UserRequest = {
  id: string;
  email: string;
  type: string;
  message: string;
  created_at: string;
  response?: string;
  status?: string;
};

export default function AdminPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [isRequestsLoading, setIsRequestsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSavingResponse, setIsSavingResponse] = useState(false);

  useEffect(() => {
    if (!user || user.email !== "vm.admin@laboveda.com") return;
    const fetchRequests = async () => {
      setIsRequestsLoading(true);
      try {
        const q = query(collection(db, "user_requests"), orderBy("created_at", "desc"));
        const snap = await getDocs(q);
        setRequests(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<UserRequest, "id">) })));
      } catch (e) { console.error(e); }
      setIsRequestsLoading(false);
    };
    fetchRequests();
  }, [user]);

  const handleSaveResponse = async (id: string) => {
    if (!replyText.trim()) return;
    setIsSavingResponse(true);
    try {
      await updateDoc(doc(db, "user_requests", id), { response: replyText, status: "resuelto" });
      setRequests(prev => prev.map(r => r.id === id ? { ...r, response: replyText, status: "resuelto" } : r));
      setReplyingTo(null); setReplyText("");
    } catch (e) { console.error(e); alert("No se pudo guardar la respuesta."); }
    setIsSavingResponse(false);
  };

  const filteredRequests = useMemo(() => {
    if (!search) return requests;
    return requests.filter(r => r.email?.toLowerCase().includes(search.toLowerCase()) || r.message?.toLowerCase().includes(search.toLowerCase()));
  }, [requests, search]);

  if (!user || user.email !== "vm.admin@laboveda.com") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-4">
        <h1 className="text-2xl font-bold text-red-500">Acceso Restringido</h1>
        <p className="text-gray-400 text-center max-w-sm">No tienes permisos para acceder a esta área de la Bóveda.</p>
        <Link href="/" className="text-orange-400 hover:underline">Volver al inicio</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-orange-400 transition-colors mb-2"><ArrowLeft className="w-4 h-4" />Volver</Link>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3"><BarChart3 className="w-8 h-8 text-amber-500" />Panel de Control Administrativo</h1>
          <p className="text-gray-400 mt-1">Supervisión de solicitudes y comunicaciones.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-3xl border-amber-500/10 shadow-lg shadow-amber-500/5">
          <div className="flex items-center gap-3 mb-4"><div className="p-3 bg-amber-500/10 rounded-2xl text-amber-400"><Users className="w-6 h-6" /></div><span className="text-sm font-medium text-gray-400">Solicitudes Totales</span></div>
          <div className="text-4xl font-bold text-white">{requests.length}</div>
          <div className="mt-2 text-xs text-amber-400 font-medium">{requests.filter(r => !r.response).length} sin responder</div>
        </div>
        <div className="glass-panel p-6 rounded-3xl border-emerald-500/10 shadow-lg shadow-emerald-500/5">
          <div className="flex items-center gap-3 mb-4"><div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400"><TrendingUp className="w-6 h-6" /></div><span className="text-sm font-medium text-gray-400">Resueltas</span></div>
          <div className="text-4xl font-bold text-emerald-400">{requests.filter(r => r.status === "resuelto").length}</div>
          <div className="mt-2 text-xs text-emerald-400 font-medium">de {requests.length} totales</div>
        </div>
        <div className="glass-panel p-6 rounded-3xl border-blue-500/10 shadow-lg shadow-blue-500/5">
          <div className="flex items-center gap-3 mb-4"><div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400"><Wallet className="w-6 h-6" /></div><span className="text-sm font-medium text-gray-400">Backend</span></div>
          <div className="text-xl font-bold text-blue-400">Firebase</div>
          <div className="mt-2 text-xs text-blue-400 font-medium">Firestore + Auth activo</div>
        </div>
      </div>

      <div className="bg-zinc-950 rounded-3xl overflow-hidden border border-orange-500/10 shadow-2xl">
        <div className="p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-200">Buzón de Solicitudes</h2>
            <p className="text-sm text-gray-500 mt-1">Bugs reportados y sugerencias de los usuarios.</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-amber-500 transition-colors" />
          </div>
        </div>

        <div className="overflow-x-auto">
          {isRequestsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-orange-500 animate-spin" /></div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No hay solicitudes en el buzón.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-white/5">
                  <th className="px-6 py-4 font-semibold w-56">Usuario</th>
                  <th className="px-6 py-4 font-semibold w-28">Tipo</th>
                  <th className="px-6 py-4 font-semibold">Mensaje / Respuesta</th>
                  <th className="px-6 py-4 font-semibold text-right w-32">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRequests.map(req => (
                  <tr key={req.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 align-top">
                      <div className="font-bold text-gray-200">{req.email?.split('@')[0]}</div>
                      <div className="text-xs text-gray-500">{req.email}</div>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest",
                        req.type === "bug" ? "bg-red-500/20 text-red-400" : req.type === "solicitud" ? "bg-blue-500/20 text-blue-400" : "bg-gray-500/20 text-gray-400"
                      )}>{req.type}</span>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <p className="text-sm text-gray-300 leading-relaxed max-w-2xl">{req.message}</p>
                      {req.response && (
                        <div className="mt-4 p-4 bg-orange-500/5 border border-orange-500/20 rounded-2xl">
                          <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-1">Tu Respuesta:</p>
                          <p className="text-sm text-gray-400 italic">&ldquo;{req.response}&rdquo;</p>
                        </div>
                      )}
                      {replyingTo === req.id ? (
                        <div className="mt-4 space-y-3">
                          <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Escribe tu respuesta aquí..." className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-orange-500/50 resize-none min-h-[100px]" />
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveResponse(req.id)} disabled={isSavingResponse} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50">{isSavingResponse ? "Guardando..." : "Guardar Respuesta"}</button>
                            <button onClick={() => { setReplyingTo(null); setReplyText(""); }} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 text-xs font-bold rounded-lg transition-all">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        !req.response && (
                          <button onClick={() => { setReplyingTo(req.id); setReplyText(""); }} className="mt-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-orange-400 transition-colors flex items-center gap-1.5">
                            <MessageSquare className="w-3 h-3" />Responder a solicitud
                          </button>
                        )
                      )}
                    </td>
                    <td className="px-6 py-4 text-right align-top text-xs text-gray-500">
                      <div>{new Date(req.created_at).toLocaleDateString()}</div>
                      {req.status === "resuelto" && <div className="mt-2 text-[8px] font-bold text-emerald-400 uppercase px-1.5 py-0.5 bg-emerald-500/10 rounded-full inline-block">Resuelto</div>}
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
