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
  const [showLocationScanner, setShowLocationScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchLocationApiDisabled, setSearchLocationApiDisabled] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const normalizeLocationCode = (value: string) => value.toUpperCase().replace(/\s+/g, "").trim();

  const handleScan = async (code: string) => {
    if (isSearching) return;
    setIsSearching(true);
    const normalized = normalizeLocationCode(code);
    setLocationCode(normalized);
    setShowLocationScanner(false);
    await searchLocation(normalized);
    setIsSearching(false);
  };

  const handleManualSearch = async () => {
    if (!locationCode.trim()) {
      toast.error("Masukkan kode lokasi");
      return;
    }
    await searchLocation(normalizeLocationCode(locationCode));
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
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Koneksi ke server lokasi bermasalah. Cek URL Apps Script & deploy Web App (Anyone).");
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSearch = (value: string) => {
    const normalized = normalizeLocationCode(value);
    setLocationCode(normalized);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (normalized.length < 1) {
      setLocationResults([]);
      setShowResults(false);
      return;
    }

    if (searchLocationApiDisabled) {
      setLocationResults([]);
      setShowResults(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const result = await searchLocationsApi(normalized);
        if (result.success && result.locations) {
          setLocationResults(result.locations);
          setShowResults(result.locations.length > 0);
        } else {
          const msg = String((result as any)?.message || "").toLowerCase();
          if (msg.includes("unknown action") || msg.includes("searchlocations")) {
            setSearchLocationApiDisabled(true);
            setShowResults(false);
            toast("Mode cari lokasi belum aktif di backend, pakai tombol Cari Lokasi dulu ya.", { icon: "ℹ️" });
          }
        }
      } catch (error) {
        console.error("Location search error:", error);
        setShowResults(false);
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
        <div className="mb-4 relative">
          <label className="block text-sm font-medium text-text-primary mb-2">
            Cari / Scan Lokasi
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
              onChange={(e) => handleLocationSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
              className="w-full pl-11 pr-24 py-3 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-white"
              placeholder="Contoh: A01-B02-C03"
              disabled={loading}
              autoComplete="off"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchLoading && (
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              )}
              <button
                type="button"
                onClick={() => setShowLocationScanner(true)}
                className="w-9 h-9 rounded-lg border border-border bg-white flex items-center justify-center text-gray-600 hover:bg-gray-50"
                title="Scan barcode lokasi"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                  <path d="M7 12h10" />
                  <path d="M7 9h2M11 9h2M15 9h2M7 15h2M11 15h2M15 15h2" />
                </svg>
              </button>
            </div>
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

          {searchLocationApiDisabled && (
            <p className="mt-2 text-xs text-orange-600">
              Mode saran lokasi belum aktif di backend. Tetap bisa cari pakai tombol di bawah.
            </p>
          )}

          {!showResults && !searchLoading && locationCode.trim().length === 0 && (
            <p className="mt-2 text-xs text-text-secondary">
              Ketik kode lokasi atau tap ikon scan di kanan
            </p>
          )}
        </div>

        <button
          onClick={handleManualSearch}
          disabled={loading || !locationCode.trim()}
          className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-light transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
        >
          {loading ? <LoadingSpinner /> : "Cari Lokasi"}
        </button>

        {showLocationScanner && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl p-4 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-text-primary">Scan Barcode Lokasi</h3>
                <button
                  onClick={() => setShowLocationScanner(false)}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
                >
                  ✕
                </button>
              </div>
              <BarcodeScanner onScan={handleScan} active={showLocationScanner} />
            </div>
          </div>
        )}
      </div>

      <BottomNav activePage="scan" />
    </div>
  );
}
