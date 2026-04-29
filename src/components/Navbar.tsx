"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bitcoin, Wallet, Briefcase, PiggyBank } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";

import Image from "next/image";
import ProfileButton from "@/components/ProfileButton";

export default function Navbar() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <nav className="sticky top-0 z-50 bg-[#09090b] border-b border-white/5 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 drop-shadow-md hover:opacity-80 transition-opacity">
            <Image 
              src="/logo.png" 
              alt="La Bóveda Logo" 
              width={56} 
              height={56} 
              className="rounded-lg object-contain"
            />
            <span className="font-bold tracking-wide text-gray-100 hidden sm:inline text-lg">La Bóveda</span>
          </Link>
          <div className="flex items-center space-x-1 sm:space-x-2">
            {pathname !== "/login" && (
              <>
                <Link 
                  href="/cedears" 
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all",
                    pathname === "/cedears" 
                      ? "bg-blue-500/15 text-blue-400 border border-blue-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                  )}
                >
                  <Briefcase className="w-5 h-5 sm:w-4 sm:h-4" />
                  <span className="hidden lg:inline">Portfolio CEDEARs</span>
                </Link>
                
                <Link 
                  href="/portfolio-cripto" 
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all",
                    pathname === "/portfolio-cripto" 
                      ? "bg-teal-500/15 text-teal-400 border border-teal-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                  )}
                >
                  <Wallet className="w-5 h-5 sm:w-4 sm:h-4" />
                  <span className="hidden lg:inline">Portfolio Cripto</span>
                </Link>

                <Link 
                  href="/cripto" 
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all",
                    pathname === "/cripto" 
                      ? "bg-orange-500/15 text-orange-400 border border-orange-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                  )}
                >
                  <div className="flex -space-x-1 items-center">
                    <Bitcoin className="w-5 h-5 sm:w-4 sm:h-4 relative z-10" />
                    <svg viewBox="0 0 32 32" className="w-5 h-5 sm:w-4 sm:h-4 fill-current text-purple-400"><path d="M15.925 23.969l-9.819-5.794L16 32l9.894-13.825-9.969 5.794zM16.075 0L6.181 16.481l9.819 5.806 9.894-5.806L16.075 0z"/></svg>
                  </div>
                  <span className="hidden lg:inline">Estrategias Cripto</span>
                </Link>

                <Link 
                  href="/ingresos" 
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all",
                    pathname === "/ingresos" 
                      ? "bg-violet-500/15 text-violet-400 border border-violet-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                  )}
                >
                  <PiggyBank className="w-5 h-5 sm:w-4 sm:h-4" />
                  <span className="hidden lg:inline">Ingresos</span>
                </Link>

                {user && (
                  <ProfileButton />
                )}
              </>
            )}
            
          </div>
        </div>
      </div>
    </nav>
  );
}
