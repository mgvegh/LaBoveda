"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
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
        <circle cx="50" cy="50" r="32" stroke="currentColor" strokeWidth="6" fill="none" />
        <circle cx="50" cy="50" r="24" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.5" />
        <circle cx="50" cy="50" r="10" fill="currentColor" />
        <circle cx="50" cy="50" r="4" fill="black" opacity="0.3" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <g key={angle} transform={`rotate(${angle}, 50, 50)`}>
            <rect x="47" y="5" width="6" height="20" rx="3" fill="currentColor" />
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const router = useRouter();

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.push("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al iniciar sesión con Google";
      if (!message.includes("auth/popup-closed-by-user")) {
        setError(message);
      }
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        if (password !== confirmPassword) {
          setError("Las contraseñas no coinciden.");
          setLoading(false);
          return;
        }
        await signUp(email, password);
        alert("¡Cuenta creada! Ya podés iniciar sesión.");
        setIsLogin(true);
        setLoading(false);
        return;
      }
      router.push("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al autenticar";
      // Mensajes de Firebase en español
      if (message.includes("invalid-credential") || message.includes("wrong-password") || message.includes("user-not-found")) {
        setError("Credenciales inválidas. Revisa tu correo o contraseña.");
      } else if (message.includes("email-already-in-use")) {
        setError("Ya existe una cuenta con ese correo.");
      } else if (message.includes("weak-password")) {
        setError("La contraseña debe tener al menos 6 caracteres.");
      } else {
        setError(message);
      }
    } finally {
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
            {isLogin ? "Iniciá sesión para sincronizar tus portafolios." : "Creá tu cuenta para guardar tus activos."}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4 relative z-10">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
              {error}
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

          {!isLogin && (
            <div className="animate-in slide-in-from-top-2 duration-300">
              <label className="block text-xs font-medium text-gray-400 mb-1 ml-1 uppercase tracking-wider">
                Confirmar Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  minLength={6}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed mt-4 group"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {isLogin ? "Abrir Bóveda" : "Crear Bóveda"}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="relative my-5 z-10">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#09090b] px-2 text-gray-500 font-semibold tracking-wider">O continuar con</span>
          </div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          type="button"
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 font-medium py-3 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed z-10 relative"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>Acceder con Google</span>
            </>
          )}
        </button>

        <div className="mt-6 text-center text-sm relative z-10">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
              setConfirmPassword("");
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
