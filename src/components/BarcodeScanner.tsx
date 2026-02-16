"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const QrReader = dynamic(() => import("react-qr-barcode-scanner"), {
  ssr: false,
});

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  active: boolean;
}

export default function BarcodeScanner({
  onScan,
  active,
}: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !active) {
    return (
      <div className="w-full h-64 bg-gray-800 rounded-lg flex items-center justify-center">
        <p className="text-white">Kamera tidak aktif</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg overflow-hidden">
      {error ? (
        <div className="w-full h-64 bg-gray-800 rounded-lg flex items-center justify-center">
          <div className="text-center text-white p-4">
            <p className="mb-2">❌ Kamera tidak dapat diakses</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-3 px-4 py-2 bg-white text-gray-800 rounded-lg text-sm font-semibold"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      ) : (
        <div className="h-64 bg-black rounded-lg overflow-hidden">
          <QrReader
            onUpdate={(err, result) => {
              // Ignore NotFoundException - it fires on every frame without a barcode
              // Only treat actual camera/permission errors as errors
              if (err) {
                const errorName = (err as any)?.name || "";
                const errorMessage = err instanceof Error ? err.message : String(err);
                // NotFoundException is normal - means no barcode found in this frame
                if (errorName === "NotFoundException" || errorMessage.includes("NotFoundException")) {
                  return;
                }
                // Only set error for real camera issues
                if (errorMessage && errorMessage !== "" && !errorMessage.includes("No MultiFormat Readers")) {
                  setError(errorMessage);
                }
                return;
              }
              if (result) {
                const text = result.getText();
                if (text) {
                  onScan(text);
                }
              }
            }}
            stopStream={!active}
            facingMode="environment"
          />
        </div>
      )}
    </div>
  );
}
