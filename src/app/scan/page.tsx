"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BarcodeScanner from "@/components/BarcodeScanner";
import BottomNav from "@/components/BottomNav";
import { getProductsApi } from "@/lib/api";
import toast from "react-hot-toast";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function ScanPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [locationCode, setLocationCode] = useState("");
  const [scannerActive, setScannerActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const handleScan = async (code: string) => {
    // Debounce: prevent multiple rapid scans
    if (isSearching) return;
    setIsSearching(true);
    setLocationCode(code);
    setScannerActive(false);
    await searchLocation(code);
    setIsSearching(false);
  };

  const handleManualSearch = async () => {
    if (!locationCode.trim()) {
      toast.error("Masukkan kode lokasi");
      return;
    }
    await searchLocation(locationCode);
  };

  const searchLocation = async (code: string) => {
    setLoading(true);
    try {
      const result = await getProductsApi(code);
      
      if (result.success && result.products && result.products.length > 0) {
        toast.success("Lokasi ditemukan!");
        router.push(`/input?location=${encodeURIComponent(code)}`);
      } else {
        toast.error(result.message || "Lokasi tidak ditemukan");
        setScannerActive(true);
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Terjadi kesalahan saat mencari lokasi");
      setScannerActive(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-primary text-white p-6 shadow-md">
        <h1 className="text-2xl font-bold mb-1">Stock Opname</h1>
        <p className="text-primary-pale">Halo, {user?.name || "User"}</p>
      </div>

      <div className="p-4">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-3">
            Scan Barcode Lokasi
          </h2>
          <BarcodeScanner onScan={handleScan} active={scannerActive} />
        </div>

        <div className="mb-4">
          <div className="flex items-center mb-3">
            <div className="flex-1 h-px bg-border"></div>
            <span className="px-4 text-text-secondary text-sm">ATAU</span>
            <div className="flex-1 h-px bg-border"></div>
          </div>

          <h2 className="text-lg font-semibold text-text-primary mb-3">
            Input Manual Kode Lokasi
          </h2>
          <input
            type="text"
            value={locationCode}
            onChange={(e) => setLocationCode(e.target.value.toUpperCase())}
            className="w-full px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary mb-3"
            placeholder="Contoh: A01-B02-C03"
            disabled={loading}
          />

          <button
            onClick={handleManualSearch}
            disabled={loading}
            className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-light transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <LoadingSpinner /> : "Cari Lokasi"}
          </button>
        </div>
      </div>

      <BottomNav activePage="scan" />
    </div>
  );
}
