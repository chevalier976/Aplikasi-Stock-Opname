"use client";

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    if (standalone) return; // Don't show if already installed

    // Detect iOS
    const ua = window.navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) || 
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    // Check if user dismissed before (respect for 3 days)
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) {
      const dismissedDate = new Date(dismissed);
      const now = new Date();
      const diffDays = (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < 3) return; // Don't show for 3 days after dismiss
    }

    // For Android/Chrome - listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // For iOS - show manual instruction after 3 seconds
    if (isIOSDevice) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDeferredPrompt(null);
    localStorage.setItem("pwa-install-dismissed", new Date().toISOString());
  };

  // Don't render anything if already installed or prompt not ready
  if (isStandalone || !showPrompt) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 animate-fadeIn">
      <div className="w-full max-w-md mx-4 mb-6 bg-white rounded-2xl shadow-2xl overflow-hidden animate-slideUp">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
               style={{ backgroundColor: "var(--primary)" }}>
            SO
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-[var(--text-primary)] text-base">
              Install Stock Opname
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Tambahkan ke layar utama
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-4">
          {isIOS ? (
            // iOS instructions
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                Untuk menginstall aplikasi ini di iPhone/iPad:
              </p>
              <div className="flex items-start gap-3 bg-[var(--primary-pale)] rounded-xl p-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs font-bold">1</div>
                <p className="text-sm text-[var(--text-primary)] pt-0.5">
                  Tap ikon <strong>Share</strong>{" "}
                  <svg className="inline w-4 h-4 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                  </svg>
                  {" "}di bagian bawah Safari
                </p>
              </div>
              <div className="flex items-start gap-3 bg-[var(--primary-pale)] rounded-xl p-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs font-bold">2</div>
                <p className="text-sm text-[var(--text-primary)] pt-0.5">
                  Scroll ke bawah dan pilih <strong>&quot;Add to Home Screen&quot;</strong>
                </p>
              </div>
              <div className="flex items-start gap-3 bg-[var(--primary-pale)] rounded-xl p-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs font-bold">3</div>
                <p className="text-sm text-[var(--text-primary)] pt-0.5">
                  Tap <strong>&quot;Add&quot;</strong> untuk menginstall
                </p>
              </div>
            </div>
          ) : (
            // Android / Chrome
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                Install aplikasi ini untuk akses cepat dari layar utama HP Anda. Tidak perlu download dari Play Store!
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleInstall}
                  className="flex-1 py-3 rounded-xl text-white font-semibold text-sm transition-all active:scale-95"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  <svg className="inline w-5 h-5 mr-2 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Install Sekarang
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-4 py-3 rounded-xl text-[var(--text-secondary)] font-medium text-sm border border-gray-200 hover:bg-gray-50 transition-all"
                >
                  Nanti
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}
