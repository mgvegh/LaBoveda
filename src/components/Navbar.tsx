"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bitcoin, Wallet, PiggyBank, LayoutGrid, GraduationCap } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import Image from "next/image";
import ProfileButton from "@/components/ProfileButton";

const navItems = [
  {
    href: "/ingresos",
    label: "Ingresos",
    icon: PiggyBank,
    activeClass: "bg-violet-500/15 text-violet-400 border border-violet-500/20",
  },
  {
    href: "/cedears",
    label: "CEDEARs",
    icon: Wallet,
    activeClass: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  },
  {
    href: "/portfolio-cripto",
    label: "Cripto",
    icon: null,
    activeClass: "bg-teal-500/15 text-teal-400 border border-teal-500/20",
  },
  {
    href: "/clases",
    label: "Clases",
    icon: GraduationCap,
    activeClass: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  },
  {
    href: "/otras-herramientas",
    label: "Más",
    icon: LayoutGrid,
    activeClass: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const isActive = (href: string) => {
    if (href === "/otras-herramientas") {
      return (
        pathname.startsWith("/otras-herramientas") &&
        !pathname.startsWith("/clases")
      );
    }
    if (href === "/clases") {
      return pathname.startsWith("/clases");
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
            <span className="hidden sm:block font-bold tracking-tight text-base" style={{ color: "var(--fg)" }}>
              La Bóveda
            </span>
          </Link>

          {/* ── Nav items ────────────────────────────────────────── */}
          {pathname !== "/login" && (
            <div className="flex items-center gap-1">
              {/* Scrollable nav links */}
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
                        active ? item.activeClass : "hover:bg-white/5",
                      )}
                      style={active ? undefined : { color: "var(--fg-muted)" }}
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
              </div>

              {/* Profile — outside overflow container */}
              {user && (
                <div className="shrink-0 ml-1">
                  <ProfileButton />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
