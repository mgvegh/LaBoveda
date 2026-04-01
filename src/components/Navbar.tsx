"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bitcoin, LineChart, Wallet, Briefcase, LogOut } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";

export default function Navbar() {
  const pathname = usePathname();
  const { session, signOut } = useAuth();

  return (
    <nav className="sticky top-0 z-50 glass border-b border-white/5 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 drop-shadow-md hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-500 to-blue-400 p-[2px] shadow-lg shadow-orange-500/20">
              <div className="w-full h-full bg-[#09090b] rounded-[6px] flex items-center justify-center">
                <span className="text-transparent bg-clip-text bg-gradient-to-tr from-orange-400 to-blue-400 font-bold leading-none">I</span>
              </div>
            </div>
            <span className="font-semibold tracking-wide text-gray-100 hidden sm:inline">Inversiones</span>
          </Link>
          <div className="flex items-center space-x-1 sm:space-x-2">
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
              <span className="hidden lg:inline">Estr. Cripto</span>
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
              <span className="hidden lg:inline">Port. Cripto</span>
            </Link>
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
              <span className="hidden lg:inline">Port. CEDEARs</span>
            </Link>
            
            {session && (
               <>
                 <div className="w-px h-6 bg-white/10 mx-2 hidden sm:block"></div>
                 <button 
                   onClick={signOut}
                   className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                   title="Cerrar Bóveda"
                 >
                   <LogOut className="w-5 h-5 sm:w-4 sm:h-4" />
                 </button>
               </>
            )}
            
          </div>
        </div>
      </div>
    </nav>
  );
}
