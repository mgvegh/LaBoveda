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
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-3">
        <h1 className="text-xl font-medium text-[#e5484d]">Acceso restringido</h1>
        <p className="text-sm text-[#a1a1a6] text-center max-w-sm">No tenés permisos para acceder a esta sección.</p>
        <Link href="/" className="text-sm text-[#d99b43] hover:underline">Volver al inicio</Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto py-8 space-y-8">
      <header className="space-y-2">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-[#85858b] hover:text-[#ededed] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          Volver al inicio
        </Link>
        <div className="flex items-center gap-2.5">
          <BarChart3 className="w-5 h-5 text-[#d99b43]" strokeWidth={1.5} />
          <h1 className="text-2xl font-medium tracking-[-0.02em] text-[#ededed]">Panel administrativo</h1>
        </div>
        <p className="text-sm text-[#a1a1a6]">Supervisión de solicitudes y comunicaciones.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-5 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-xs text-[#a1a1a6]">
            <Users className="w-4 h-4 text-[#85858b]" strokeWidth={1.5} />
            <span>Solicitudes totales</span>
          </div>
          <div className="text-3xl font-mono font-medium text-[#ededed] tabular">{requests.length}</div>
          <div className="text-xs font-mono text-[#d99b43] tabular">{requests.filter(r => !r.response).length} sin responder</div>
        </div>
        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-5 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-xs text-[#a1a1a6]">
            <TrendingUp className="w-4 h-4 text-[#85858b]" strokeWidth={1.5} />
            <span>Resueltas</span>
          </div>
          <div className="text-3xl font-mono font-medium text-[#4cc38a] tabular">{requests.filter(r => r.status === "resuelto").length}</div>
          <div className="text-xs font-mono text-[#85858b] tabular">de {requests.length} totales</div>
        </div>
        <div className="bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-5 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-xs text-[#a1a1a6]">
            <Wallet className="w-4 h-4 text-[#85858b]" strokeWidth={1.5} />
            <span>Backend</span>
          </div>
          <div className="text-xl font-medium text-[#ededed]">Firebase</div>
          <div className="text-xs text-[#85858b]">Firestore + Auth activo</div>
        </div>
      </div>

      <div className="bg-[#19191b] rounded-xl overflow-hidden border border-[rgba(237,237,237,0.08)]">
        <div className="p-5 border-b border-[rgba(237,237,237,0.08)] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-[#ededed]">Buzón de solicitudes</h2>
            <p className="text-xs text-[#85858b] mt-0.5">Errores reportados y sugerencias de usuarios.</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#85858b]" strokeWidth={1.5} />
            <input
              type="text"
              placeholder="Buscar"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg pl-9 pr-3 text-sm text-[#ededed] placeholder:text-[#85858b] focus:outline-none focus:border-[#d99b43] transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {isRequestsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-[#d99b43] animate-spin" /></div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-sm text-[#85858b]">No hay solicitudes en el buzón.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs text-[#85858b] border-b border-[rgba(237,237,237,0.08)] bg-[#141415]">
                  <th className="px-5 py-3 font-medium w-56">Usuario</th>
                  <th className="px-5 py-3 font-medium w-28">Tipo</th>
                  <th className="px-5 py-3 font-medium">Mensaje / Respuesta</th>
                  <th className="px-5 py-3 font-medium text-right w-32">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(237,237,237,0.06)]">
                {filteredRequests.map(req => (
                  <tr key={req.id} className="hover:bg-[#232325]/50 transition-colors">
                    <td className="px-5 py-4 align-top">
                      <div className="text-sm font-medium text-[#ededed]">{req.email?.split('@')[0]}</div>
                      <div className="text-xs text-[#85858b]">{req.email}</div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-xs font-mono",
                        req.type === "bug" ? "bg-[#e5484d]/15 text-[#e5484d]" : req.type === "solicitud" ? "bg-[#d99b43]/15 text-[#d99b43]" : "bg-[#232325] text-[#a1a1a6]"
                      )}>{req.type}</span>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="text-sm text-[#a1a1a6] leading-relaxed max-w-2xl">{req.message}</p>
                      {req.response && (
                        <div className="mt-3 p-3 bg-[#141415] border border-[rgba(237,237,237,0.08)] rounded-lg">
                          <p className="text-xs text-[#d99b43] mb-1">Respuesta</p>
                          <p className="text-sm text-[#ededed]">{req.response}</p>
                        </div>
                      )}
                      {replyingTo === req.id ? (
                        <div className="mt-3 space-y-2">
                          <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Escribí tu respuesta" className="w-full bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg p-3 text-sm text-[#ededed] focus:outline-none focus:border-[#d99b43] resize-none min-h-[96px]" />
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveResponse(req.id)} disabled={isSavingResponse} className="h-8 px-3 bg-[#d99b43] hover:bg-[#e3a852] text-[#141415] text-xs font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer">{isSavingResponse ? "Guardando..." : "Guardar respuesta"}</button>
                            <button onClick={() => { setReplyingTo(null); setReplyText(""); }} className="h-8 px-3 bg-[#232325] hover:bg-[#2c2c2f] text-[#a1a1a6] text-xs font-medium rounded-lg transition-colors cursor-pointer">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        !req.response && (
                          <button onClick={() => { setReplyingTo(req.id); setReplyText(""); }} className="mt-3 text-xs text-[#a1a1a6] hover:text-[#d99b43] transition-colors flex items-center gap-1.5 cursor-pointer">
                            <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.5} /> Responder
                          </button>
                        )
                      )}
                    </td>
                    <td className="px-5 py-4 text-right align-top text-xs font-mono text-[#85858b] tabular">
                      <div>{new Date(req.created_at).toLocaleDateString()}</div>
                      {req.status === "resuelto" && <div className="mt-1.5 text-xs text-[#4cc38a]">Resuelto</div>}
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
