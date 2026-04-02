"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Lock, Mail, Loader2, ArrowRight } from "lucide-react";
import { clsx } from "clsx";

const VaultWheel = ({ loading }: { loading: boolean }) => (
  <div className={clsx(
    "relative w-24 h-24 flex items-center justify-center transition-all duration-700",
    loading ? "scale-110" : "scale-100"
  )}>
    {/* Fondo con brillo suave */}
    <div className={clsx(
      "absolute inset-0 rounded-full border-4 border-emerald-500/10 transition-shadow duration-500",
      loading ? "shadow-[0_0_30px_rgba(16,185,129,0.3)]" : "shadow-none"
    )} />
    
    {/* Rayos exteriores estáticos (marco de la puerta) */}
    <div className="absolute inset-0 opacity-20">
       <svg viewBox="0 0 100 100" className="w-full h-full text-emerald-500">
         <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="1" fill="none" strokeDasharray="4 4" />
       </svg>
    </div>

    {/* La rueda central que gira */}
    <div className={clsx(
      "relative w-20 h-20 transition-transform duration-[2000ms] ease-in-out",
      loading ? "rotate-[360deg]" : "rotate-0"
    )}>
      <svg viewBox="0 0 100 100" className="w-full h-full text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.4)]">
        {/* Aro dentado principal */}
        <circle cx="50" cy="50" r="32" stroke="currentColor" strokeWidth="6" fill="none" />
        <circle cx="50" cy="50" r="24" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.5" />
        
        {/* Centro de la rueda */}
        <circle cx="50" cy="50" r="10" fill="currentColor" />
        <circle cx="50" cy="50" r="4" fill="black" opacity="0.3" />
        
        {/* Manijas de la boveda (8 brazos) */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <g key={angle} transform={`rotate(${angle}, 50, 50)`}>
            {/* Brazo */}
            <rect x="47" y="5" width="6" height="20" rx="3" fill="currentColor" />
            {/* Pomo de la punta */}
            <circle cx="50" cy="8" r="4" fill="currentColor" />
          </g>
        ))}
      </svg>
    </div>
  </div>
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();
  const supabase = createClient();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        alert("¡Cuenta creada! Ya podés inicar sesión (si no te llegó mail de confirmación, entrá directo).");
        setIsLogin(true);
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh(); // Refresca el estado de sesión global
    } catch (err: any) {
      setError(err.message || "Error al autenticar");
    } finally {
      // Dejamos el loading un poco más para que se vea el giro si es muy rápido
      setTimeout(() => setLoading(false), 800);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md glass-panel p-8 rounded-3xl border-emerald-500/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="text-center mb-8 relative z-10 flex flex-col items-center">
          <div className="mb-6">
            <VaultWheel loading={loading} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Bóveda de Inversiones
          </h1>
          <p className="text-gray-400 text-sm">
            {isLogin ? "Iniciá sesión para sincronizar tus portafolios." : "Creá tu cuenta maestra para guardar tus activos."}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4 relative z-10">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
              {error === "Invalid login credentials" ? "Credenciales inválidas. Revisa tu correo o contraseña." : error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 ml-1 uppercase tracking-wider">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="inversor@wallstreet.com"
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 ml-1 uppercase tracking-wider">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed mt-4 group"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {isLogin ? "Desbloquear Bóveda" : "Crear Bóveda Segura"}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm relative z-10">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            type="button"
            className="text-gray-400 hover:text-emerald-400 transition-colors"
          >
            {isLogin ? "¿No tenés cuenta? Creá una gratis." : "Ya tengo una bóveda registrada."}
          </button>
        </div>
      </div>
    </div>
  );
}
