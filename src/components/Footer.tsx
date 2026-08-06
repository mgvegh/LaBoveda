"use client";
import { useState } from "react";
import { MessageSquare, Heart, ShieldCheck } from "lucide-react";
import ContactModal from "./ContactModal";

const GithubIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export default function Footer() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="w-full mt-20 backdrop-blur-md"
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--navbar-bg)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">

          {/* Brand & Rights */}
          <div className="text-center md:text-left space-y-2">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-2 group">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center border group-hover:scale-110 transition-transform"
                style={{ background: "rgba(251,146,60,0.1)", borderColor: "rgba(251,146,60,0.2)" }}
              >
                <ShieldCheck className="w-4 h-4 text-orange-400" />
              </div>
              <span className="font-bold tracking-tight group-hover:text-orange-400 transition-colors" style={{ color: "var(--fg)" }}>
                La Bóveda
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-violet-500/20 to-blue-500/20 text-blue-400 border border-blue-500/20">
                v3.0
              </span>
            </div>
            <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>
              © {currentYear} La Bóveda. Todos los derechos reservados.
            </p>
            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--fg-subtle)" }}>
              Seguridad • Privacidad • Descentralización
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: "var(--glass-bg)",
                border: "1px solid var(--border)",
                color: "var(--fg-muted)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#fb923c";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(251,146,60,0.3)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-muted)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
              }}
            >
              <MessageSquare className="w-4 h-4" />
              Contacto / Feedback
            </button>
            <a
              href="https://github.com/mgvegh/LaBoveda"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 rounded-xl transition-all"
              style={{
                background: "var(--glass-bg)",
                border: "1px solid var(--border)",
                color: "var(--fg-subtle)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--fg)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "var(--fg-subtle)";
              }}
            >
              <GithubIcon className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Bottom */}
        <div
          className="mt-8 pt-6 flex items-center justify-center gap-1 text-xs"
          style={{ borderTop: "1px solid var(--border)", color: "var(--fg-subtle)" }}
        >
          Hecho con <Heart className="w-3 h-3 text-red-400 fill-current mx-0.5" /> para inversores en Argentina
        </div>
      </div>

      <ContactModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </footer>
  );
}
