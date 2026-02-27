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
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScanRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);

  // Keep onScan ref up-to-date without re-creating startScanner
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const startScanner = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

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

      // ALL barcode formats: 1D (batang) + 2D (QR)
      const formatsToSupport = [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.AZTEC,
        Html5QrcodeSupportedFormats.PDF_417,
      ];

      const scanner = new Html5Qrcode(scannerId, {
        formatsToSupport,
        verbose: false,
        // USE NATIVE BarcodeDetector API when available (Chrome Android 83+)
        // This is GPU-accelerated and MUCH faster than JS-based ZXing
        useBarCodeDetectorIfSupported: true,
      });
      scannerRef.current = scanner;

      // Calculate adaptive scan box based on screen size
      const vw = Math.min(containerRef.current.clientWidth || 320, 500);
      // Large scan area = faster detection
      const qrboxSize = Math.floor(vw * 0.75);

      await scanner.start(
        {
          facingMode: "environment",
        },
        {
          fps: 30,                                     // 2x faster frame rate
          qrbox: { width: qrboxSize, height: qrboxSize }, // SQUARE & LARGE for both QR + barcode
          aspectRatio: 1.0,                             // Square viewport — works for both
          disableFlip: true,                            // Save processing — rear camera doesn't need flip
          videoConstraints: {
            facingMode: "environment",
            advanced: [
              { focusMode: "continuous" } as any,       // Continuous autofocus
            ],
            width: { ideal: 1920 },                     // High res for better detection
            height: { ideal: 1080 },
          },
        },
        (decodedText: string) => {
          const now = Date.now();
          if (
            decodedText === lastScanRef.current &&
            now - lastScanTimeRef.current < 1500
          ) {
            return;
          }
          lastScanRef.current = decodedText;
          lastScanTimeRef.current = now;

          // Haptic feedback if available
          if (navigator.vibrate) navigator.vibrate(100);

          onScanRef.current(decodedText);
        },
        () => {
          // Not found in this frame — normal
        }
      );

      setCameraReady(true);
      setError(null);

      // Check torch support
      try {
        const track = scanner.getRunningTrackSettings?.() ||
          (scanner as any)._localMediaStream?.getVideoTracks?.()?.[0]?.getSettings?.();
        if (!track) {
          // Try alternative: access video tracks directly
          const videoEl = containerRef.current?.querySelector("video");
          if (videoEl?.srcObject) {
            const mediaStream = videoEl.srcObject as MediaStream;
            const vTrack = mediaStream.getVideoTracks()[0];
            const caps = vTrack?.getCapabilities?.() as any;
            if (caps?.torch) {
              setTorchSupported(true);
            }
          }
        }
      } catch {
        // torch detection failed, that's okay
      }
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
  }, []);

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
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const toggleTorch = useCallback(async () => {
    try {
      const videoEl = containerRef.current?.querySelector("video");
      if (videoEl?.srcObject) {
        const mediaStream = videoEl.srcObject as MediaStream;
        const vTrack = mediaStream.getVideoTracks()[0];
        const newVal = !torchOn;
        await vTrack.applyConstraints({ advanced: [{ torch: newVal } as any] });
        setTorchOn(newVal);
      }
    } catch {
      // torch toggle failed
    }
  }, [torchOn]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (active) {
      const timer = setTimeout(() => startScanner(), 150); // Faster startup
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [active, mounted, startScanner, stopScanner]);

  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

  if (!mounted || !active) {
    return (
      <div className="w-full h-72 bg-gray-800 rounded-xl flex items-center justify-center">
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
        <div className="w-full h-72 bg-gray-800 rounded-xl flex items-center justify-center">
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
            className="w-full bg-black"
            style={{ minHeight: "288px" }}
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
            <>
              {/* Torch / Flashlight toggle */}
              {torchSupported && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`absolute top-2 right-2 z-10 w-9 h-9 rounded-full flex items-center justify-center transition ${
                    torchOn ? "bg-yellow-400 text-gray-900" : "bg-black/50 text-white"
                  }`}
                  title={torchOn ? "Matikan flash" : "Nyalakan flash"}
                >
                  {torchOn ? "🔦" : "💡"}
                </button>
              )}
              <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
                <span className="bg-black/60 text-white text-[11px] px-3 py-1 rounded-full backdrop-blur-sm">
                  Arahkan ke QR Code / Barcode
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
