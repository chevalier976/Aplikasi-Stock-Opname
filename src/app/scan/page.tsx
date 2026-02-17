"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BarcodeScanner from "@/components/BarcodeScanner";
import BottomNav from "@/components/BottomNav";
import { getProductsApi, searchLocationsApi } from "@/lib/api";
import toast from "react-hot-toast";
import LoadingSpinner from "@/components/LoadingSpinner";

type LocationResult = {
  locationCode: string;
  productCount: number;
};

export default function ScanPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [locationCode, setLocationCode] = useState("");
  const [scannerActive, setScannerActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Location search state
  const [searchMode, setSearchMode] = useState<"manual" | "search">("manual");
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleScan = async (code: string) => {
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
    await searchLocation(locationCode.trim());
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

  const handleLocationSearch = (value: string) => {
    setLocationCode(value);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (value.trim().length < 1) {
      setLocationResults([]);
      setShowResults(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const result = await searchLocationsApi(value.trim());
        if (result.success && result.locations) {
          setLocationResults(result.locations);
          setShowResults(result.locations.length > 0);
        }
      } catch (error) {
        console.error("Location search error:", error);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  };

  const handleSelectLocation = (loc: LocationResult) => {
    setLocationCode(loc.locationCode);
    setShowResults(false);
    setLocationResults([]);
    searchLocation(loc.locationCode);
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-primary text-white p-6 shadow-md">
        <h1 className="text-2xl font-bold mb-1">Stock Opname</h1>
        <p className="text-primary-pale">Halo, {user?.name || "User"}</p>
      </div>

      <div className="p-4">
        {/* Barcode Scanner */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-1">
            Scan Barcode Lokasi
          </h2>
          <p className="text-text-secondary text-sm mb-3">
            Support barcode batang (1D) dan QR Code
          </p>
          <BarcodeScanner onScan={handleScan} active={scannerActive} />
        </div>

        <div className="flex items-center mb-4">
          <div className="flex-1 h-px bg-border"></div>
          <span className="px-4 text-text-secondary text-sm">ATAU</span>
          <div className="flex-1 h-px bg-border"></div>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
          <button
            onClick={() => {
              setSearchMode("manual");
              setShowResults(false);
              setLocationResults([]);
            }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              searchMode === "manual"
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-secondary"
            }`}
          >
            <svg className="inline w-4 h-4 mr-1.5 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Input Manual
          </button>
          <button
            onClick={() => {
              setSearchMode("search");
              setLocationCode("");
            }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              searchMode === "search"
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-secondary"
            }`}
          >
            <svg className="inline w-4 h-4 mr-1.5 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            Cari Lokasi
          </button>
        </div>

        {/* Manual Input Mode */}
        {searchMode === "manual" && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-text-primary mb-2">
              Kode Lokasi
            </label>
            <input
              type="text"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
              className="w-full px-4 py-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary mb-3 bg-white"
              placeholder="Contoh: A01-B02-C03"
              disabled={loading}
            />
            <button
              onClick={handleManualSearch}
              disabled={loading || !locationCode.trim()}
              className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-light transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {loading ? <LoadingSpinner /> : "Cari Lokasi"}
            </button>
          </div>
        )}

        {/* Search Mode */}
        {searchMode === "search" && (
          <div className="mb-4 relative">
            <label className="block text-sm font-medium text-text-primary mb-2">
              Cari Lokasi
            </label>
            <div className="relative">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={locationCode}
                onChange={(e) => handleLocationSearch(e.target.value.toUpperCase())}
                className="w-full pl-11 pr-10 py-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                placeholder="Ketik kode lokasi, contoh: A01..."
                disabled={loading}
                autoFocus
              />
              {searchLoading && (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>

            {/* Search Results Dropdown */}
            {showResults && locationResults.length > 0 && (
              <div className="mt-2 bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                {locationResults.map((loc, index) => (
                  <button
                    key={loc.locationCode}
                    onClick={() => handleSelectLocation(loc)}
                    className={`w-full flex items-center justify-between px-4 py-3 hover:bg-primary-pale transition text-left active:bg-primary/10 ${
                      index < locationResults.length - 1 ? "border-b border-gray-100" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-text-primary text-sm">{loc.locationCode}</p>
                        <p className="text-xs text-text-secondary">{loc.productCount} produk</p>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-text-secondary flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {/* No results */}
            {showResults && locationResults.length === 0 && !searchLoading && locationCode.trim().length >= 1 && (
              <div className="mt-2 bg-white border border-border rounded-xl p-4 text-center">
                <svg className="w-8 h-8 mx-auto mb-2 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                  <path d="M8 11h6" />
                </svg>
                <p className="text-sm text-text-secondary">Lokasi tidak ditemukan</p>
              </div>
            )}

            {/* Hint */}
            {!showResults && !searchLoading && locationCode.trim().length === 0 && (
              <p className="mt-2 text-xs text-text-secondary">
                Ketik minimal 1 karakter untuk mencari lokasi
              </p>
            )}
          </div>
        )}
      </div>

      <BottomNav activePage="scan" />
    </div>
  );
}
