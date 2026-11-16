"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { Lock, Mail, Loader2, ArrowRight } from "lucide-react";
import { clsx } from "clsx";

const VaultWheel = ({ loading }: { loading: boolean }) => (
  <div className="relative w-16 h-16 flex items-center justify-center">
    <div
      className={clsx(
        "relative w-16 h-16 transition-transform duration-1000 ease-out",
        loading ? "rotate-180" : "rotate-0"
      )}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full text-[#d99b43]">
        <circle cx="50" cy="50" r="36" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
        <circle cx="50" cy="50" r="24" stroke="currentColor" strokeWidth="2.5" fill="none" />
        <circle cx="50" cy="50" r="8" fill="currentColor" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <g key={angle} transform={`rotate(${angle}, 50, 50)`}>
            <rect x="48" y="10" width="4" height="16" rx="2" fill="currentColor" />
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
      setTimeout(() => setLoading(false), 600);
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
          setError("Las contraseñas no coinciden");
          setLoading(false);
          return;
        }
        await signUp(email, password);
        alert("Cuenta creada. Ya podés iniciar sesión.");
        setIsLogin(true);
        setLoading(false);
        return;
      }
      router.push("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al autenticar";
      if (message.includes("invalid-credential") || message.includes("wrong-password") || message.includes("user-not-found")) {
        setError("Credenciales inválidas. Revisá tu correo o contraseña.");
      } else if (message.includes("email-already-in-use")) {
        setError("Ya existe una cuenta con ese correo.");
      } else if (message.includes("weak-password")) {
        setError("La contraseña debe tener al menos 6 caracteres.");
      } else {
        setError(message);
      }
    } finally {
      setTimeout(() => setLoading(false), 600);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[#19191b] border border-[rgba(237,237,237,0.08)] p-6 sm:p-8 rounded-2xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <VaultWheel loading={loading} />
          <div className="space-y-1">
            <h1 className="text-xl font-medium text-[#ededed]">
              La Bóveda
            </h1>
            <p className="text-sm text-[#a1a1a6]">
              {isLogin ? "Iniciá sesión para sincronizar tus registros" : "Creá tu cuenta para guardar tus activos"}
            </p>
          </div>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {error && (
            <div className="bg-[#e5484d]/10 border border-[#e5484d]/25 text-[#e5484d] text-sm px-3 py-2.5 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#a1a1a6]">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#85858b]" strokeWidth={1.5} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@correo.com"
                className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg pl-9 pr-3 text-sm text-[#ededed] placeholder:text-[#85858b] focus:outline-none focus:border-[#d99b43] transition-colors duration-150"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#a1a1a6]">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#85858b]" strokeWidth={1.5} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg pl-9 pr-3 text-sm text-[#ededed] placeholder:text-[#85858b] focus:outline-none focus:border-[#d99b43] transition-colors duration-150"
                minLength={6}
              />
            </div>
          </div>

          {!isLogin && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#a1a1a6]">
                Confirmar contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#85858b]" strokeWidth={1.5} />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-10 bg-[#232325] border border-[rgba(237,237,237,0.08)] rounded-lg pl-9 pr-3 text-sm text-[#ededed] placeholder:text-[#85858b] focus:outline-none focus:border-[#d99b43] transition-colors duration-150"
                  minLength={6}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 flex items-center justify-center gap-2 bg-[#d99b43] hover:bg-[#e3a852] text-[#141415] text-sm font-medium rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{isLogin ? "Abrir bóveda" : "Crear bóveda"}</span>
                <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
              </>
            )}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-[rgba(237,237,237,0.08)]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[#19191b] px-2 text-[#85858b]">o continuar con</span>
          </div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          type="button"
          disabled={loading}
          className="w-full h-10 flex items-center justify-center gap-2.5 bg-[#232325] hover:bg-[#2a2a2d] border border-[rgba(237,237,237,0.08)] text-[#ededed] text-sm font-medium rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#d99b43]" />
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-4 h-4">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span>Acceder con Google</span>
            </>
          )}
        </button>

        <div className="text-center text-sm">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
              setConfirmPassword("");
            }}
            type="button"
            className="text-[#a1a1a6] hover:text-[#ededed] transition-colors duration-150 cursor-pointer"
          >
            {isLogin ? "¿No tenés cuenta? Creá una" : "Ya tengo una cuenta registrada"}
          </button>
        </div>
      </div>
    </div>
  );
}
