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
          </div>
        </div>
      ) : (
        <div className="h-64 bg-black rounded-lg overflow-hidden">
          <QrReader
            onUpdate={(err, result) => {
              if (err) {
                const errorMessage = err instanceof Error ? err.message : "Kamera error";
                setError(errorMessage);
                return;
              }
              if (result) {
                const text = result.getText();
                if (text) {
                  onScan(text);
                }
              }
            }}
            facingMode="environment"
          />
        </div>
      )}
    </div>
  );
}
