"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  active: boolean;
}

export default function BarcodeScanner({ onScan, active }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScanRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);

  const startScanner = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      // Dynamically import html5-qrcode (avoid SSR issues)
      const { Html5Qrcode } = await import("html5-qrcode");

      // Clean up any existing scanner
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
          scannerRef.current.clear();
        } catch {
          // ignore cleanup errors
        }
        scannerRef.current = null;
      }

      const scannerId = "barcode-scanner-container";
      const scanner = new Html5Qrcode(scannerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 150 },
          aspectRatio: 16 / 9,
          disableFlip: false,
        },
        (decodedText: string) => {
          // Debounce: prevent duplicate scans within 2 seconds
          const now = Date.now();
          if (
            decodedText === lastScanRef.current &&
            now - lastScanTimeRef.current < 2000
          ) {
            return;
          }
          lastScanRef.current = decodedText;
          lastScanTimeRef.current = now;
          onScan(decodedText);
        },
        () => {
          // QR code not found in this frame - this is normal, ignore
        }
      );

      setCameraReady(true);
      setError(null);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        setError("Izin kamera ditolak. Silakan izinkan akses kamera di pengaturan browser.");
      } else if (msg.includes("NotFoundError") || msg.includes("Requested device not found")) {
        setError("Kamera tidak ditemukan. Pastikan perangkat memiliki kamera.");
      } else if (msg.includes("NotReadableError") || msg.includes("Could not start")) {
        setError("Kamera sedang digunakan aplikasi lain. Tutup aplikasi lain dan coba lagi.");
      } else {
        setError("Gagal mengakses kamera: " + msg);
      }
      setCameraReady(false);
    }
  }, [onScan]);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // ignore cleanup errors
      }
      scannerRef.current = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (active) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        startScanner();
      }, 300);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [active, mounted, startScanner, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  if (!mounted || !active) {
    return (
      <div className="w-full h-64 bg-gray-800 rounded-xl flex items-center justify-center">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-2 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <p className="text-gray-400 text-sm">Kamera tidak aktif</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl overflow-hidden relative">
      {error ? (
        <div className="w-full h-64 bg-gray-800 rounded-xl flex items-center justify-center">
          <div className="text-center text-white p-4">
            <svg className="w-10 h-10 mx-auto mb-2 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
            <p className="text-sm mb-3">{error}</p>
            <button
              onClick={() => {
                setError(null);
                startScanner();
              }}
              className="px-5 py-2 bg-white text-gray-800 rounded-lg text-sm font-semibold active:scale-95 transition"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <div
            id="barcode-scanner-container"
            ref={containerRef}
            className="w-full h-64 bg-black"
          />
          {!cameraReady && (
            <div className="absolute inset-0 bg-gray-800 flex items-center justify-center rounded-xl">
              <div className="text-center">
                <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-gray-300 text-sm">Membuka kamera...</p>
              </div>
            </div>
          )}
          {cameraReady && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
              <span className="bg-black/60 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
                Arahkan kamera ke barcode
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
