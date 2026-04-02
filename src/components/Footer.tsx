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
    <footer className="w-full mt-20 border-t border-white/5 bg-[#09090b]/50 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          
          {/* Brand & Rights */}
          <div className="text-center md:text-left space-y-2">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-2 group">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-5 h-5 text-orange-400" />
              </div>
              <span className="font-bold tracking-tight text-white group-hover:text-orange-400 transition-colors">La Bóveda</span>
            </div>
            <p className="text-sm text-gray-500">
              © {currentYear} La Bóveda. Todos los derechos reservados.
            </p>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">
              Seguridad • Privacidad • Descentralización
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 border border-white/5 hover:border-orange-500/30 hover:bg-orange-500/5 text-gray-300 hover:text-orange-400 text-sm font-semibold transition-all shadow-lg"
            >
              <MessageSquare className="w-4 h-4" />
              Contactanos / Feedback
            </button>
            <a 
              href="https://github.com/mgvegh/LaBoveda" 
              target="_blank" 
              rel="noopener noreferrer"
              className="p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-gray-400/30 text-gray-500 hover:text-white transition-all shadow-lg"
            >
              <GithubIcon className="w-5 h-5" />
            </a>
          </div>
        </div>

        {/* Bottom Banner */}
        <div className="mt-12 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-4">
            {/* Se removerán links inactivos por ahora */}
          </div>
          <div className="flex items-center gap-1">
            Hecho con <Heart className="w-3 h-3 text-red-500 fill-current" /> para inversores en Argentina
          </div>
        </div>
      </div>

      {/* Modal de Contacto */}
      <ContactModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </footer>
  );
}
