"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bitcoin, Wallet, PiggyBank, LayoutGrid, GraduationCap } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/components/AuthProvider";
import Image from "next/image";
import ProfileButton from "@/components/ProfileButton";

const navItems = [
  { href: "/ingresos", label: "Ingresos", icon: PiggyBank },
  { href: "/cedears", label: "CEDEARs", icon: Wallet },
  { href: "/portfolio-cripto", label: "Cripto", icon: Bitcoin },
  { href: "/clases", label: "Clases", icon: GraduationCap },
  { href: "/otras-herramientas", label: "Más", icon: LayoutGrid },
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
      className="sticky top-0 z-50 w-full"
      style={{
        background: "var(--navbar-bg)",
        borderBottom: "1px solid var(--navbar-border)",
      }}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 shrink-0 hover:opacity-85 transition-opacity duration-150"
          >
            <Image
              src="/logo.png"
              alt="La Bóveda"
              width={32}
              height={32}
              className="rounded-md object-contain"
            />
            <span className="hidden sm:block font-medium tracking-tight text-base text-[#ededed]">
              La Bóveda
            </span>
          </Link>

          {pathname !== "/login" && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                {navItems.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(
                        "flex items-center gap-2 h-9 px-3 text-sm font-medium rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0",
                        active
                          ? "bg-[#232325] text-[#ededed] border border-[rgba(237,237,237,0.12)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                          : "text-[#a1a1a6] hover:text-[#ededed] hover:bg-[#19191b] border border-transparent"
                      )}
                    >
                      <Icon
                        className={clsx(
                          "w-4 h-4 shrink-0",
                          active ? "text-[#d99b43]" : "text-[#85858b]"
                        )}
                        strokeWidth={1.5}
                      />
                      <span className="hidden lg:inline">{item.label}</span>
                    </Link>
                  );
                })}
              </div>

              {user && (
                <div className="shrink-0 pl-1 border-l border-[rgba(237,237,237,0.08)]">
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
