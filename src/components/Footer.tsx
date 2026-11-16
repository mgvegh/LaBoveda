"use client";
import Link from "next/link";
import { useState } from "react";
import { MessageSquare, ShieldCheck, Lock } from "lucide-react";
import ContactModal from "./ContactModal";

const GithubIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export default function Footer() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="w-full mt-16"
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--surface-deep)",
      }}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#d99b43]" strokeWidth={1.5} />
              <span className="font-medium tracking-tight text-sm text-[#ededed]">
                La Bóveda
              </span>
              <span className="text-xs font-mono text-[#85858b] tabular">
                v3.0
              </span>
            </div>
            <p className="text-xs text-[#85858b]">
              © {currentYear} La Bóveda · Datos aislados por cuenta en Firebase Firestore
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/privacidad"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium bg-[#19191b] border border-[rgba(237,237,237,0.08)] text-[#a1a1a6] hover:text-[#ededed] hover:bg-[#232325] transition-colors duration-150"
            >
              <Lock className="w-4 h-4 text-[#85858b]" strokeWidth={1.5} />
              Seguridad y privacidad
            </Link>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium bg-[#19191b] border border-[rgba(237,237,237,0.08)] text-[#a1a1a6] hover:text-[#ededed] hover:bg-[#232325] transition-colors duration-150 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-[#85858b]" strokeWidth={1.5} />
              Contacto
            </button>
            <a
              href="https://github.com/mgvegh/LaBoveda"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Repositorio en GitHub"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#19191b] border border-[rgba(237,237,237,0.08)] text-[#85858b] hover:text-[#ededed] hover:bg-[#232325] transition-colors duration-150"
            >
              <GithubIcon className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      <ContactModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </footer>
  );
}
