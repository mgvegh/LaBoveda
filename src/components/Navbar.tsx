"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bitcoin, Wallet, PiggyBank, LayoutGrid, GraduationCap, Sun, Moon } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import Image from "next/image";
import ProfileButton from "@/components/ProfileButton";

const navItems = [
  {
    href: "/ingresos",
    label: "Ingresos",
    icon: PiggyBank,
    color: "violet",
    activeClass: "bg-violet-500/15 text-violet-500 border border-violet-500/25",
    darkActiveClass: "dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-500/20",
  },
  {
    href: "/cedears",
    label: "CEDEARs",
    icon: Wallet,
    color: "blue",
    activeClass: "bg-blue-500/15 text-blue-600 border border-blue-500/25",
    darkActiveClass: "dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/20",
  },
  {
    href: "/portfolio-cripto",
    label: "Cripto",
    icon: null, // custom dual icon
    color: "teal",
    activeClass: "bg-teal-500/15 text-teal-600 border border-teal-500/25",
    darkActiveClass: "dark:bg-teal-500/15 dark:text-teal-400 dark:border-teal-500/20",
  },
  {
    href: "/otras-herramientas/clases",
    label: "Clases",
    icon: GraduationCap,
    color: "emerald",
    activeClass: "bg-emerald-500/15 text-emerald-600 border border-emerald-500/25",
    darkActiveClass: "dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20",
  },
  {
    href: "/otras-herramientas",
    label: "Más",
    icon: LayoutGrid,
    color: "amber",
    activeClass: "bg-amber-500/15 text-amber-600 border border-amber-500/25",
    darkActiveClass: "dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20",
  },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const isActive = (href: string) => {
    // "Más" catches all /otras-herramientas/* EXCEPT /clases
    if (href === "/otras-herramientas") {
      return (
        pathname.startsWith("/otras-herramientas") &&
        !pathname.startsWith("/otras-herramientas/clases")
      );
    }
    if (href === "/otras-herramientas/clases") {
      return pathname.startsWith("/otras-herramientas/clases");
    }
    return pathname === href;
  };

  return (
    <nav
      className="sticky top-0 z-50 w-full backdrop-blur-xl"
      style={{
        background: "var(--navbar-bg)",
        borderBottom: "1px solid var(--navbar-border)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* ── Brand ───────────────────────────────────────────── */}
          <Link
            href="/"
            className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity"
          >
            <Image
              src="/logo.png"
              alt="La Bóveda"
              width={40}
              height={40}
              className="rounded-lg object-contain"
            />
            <div className="hidden sm:block">
              <span className="font-bold tracking-tight text-base" style={{ color: "var(--fg)" }}>
                La Bóveda
              </span>
              <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-violet-500/20 to-blue-500/20 text-blue-400 border border-blue-500/20 align-middle">
                v3.0
              </span>
            </div>
          </Link>

          {/* ── Nav items ────────────────────────────────────────── */}
          {pathname !== "/login" && (
            <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide">
              {navItems.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200 whitespace-nowrap shrink-0",
                      active
                        ? [item.activeClass, item.darkActiveClass]
                        : "hover:bg-black/5 dark:hover:bg-white/5",
                    )}
                    style={
                      active
                        ? undefined
                        : { color: "var(--fg-muted)" }
                    }
                  >
                    {item.href === "/portfolio-cripto" ? (
                      <div className="flex -space-x-1 items-center">
                        <Bitcoin className="w-4 h-4 relative z-10" />
                        <svg viewBox="0 0 32 32" className="w-4 h-4 fill-current text-purple-400">
                          <path d="M15.925 23.969l-9.819-5.794L16 32l9.894-13.825-9.969 5.794zM16.075 0L6.181 16.481l9.819 5.806 9.894-5.806L16.075 0z" />
                        </svg>
                      </div>
                    ) : (
                      Icon && <Icon className="w-4 h-4 shrink-0" />
                    )}
                    <span className="hidden lg:inline">{item.label}</span>
                  </Link>
                );
              })}

              {/* ── Theme toggle ─────────────────────────────────── */}
              <button
                id="btn-theme-toggle"
                onClick={toggleTheme}
                title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                className="ml-1 p-2 rounded-xl transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: "var(--fg-muted)" }}
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>

              {user && <ProfileButton />}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
