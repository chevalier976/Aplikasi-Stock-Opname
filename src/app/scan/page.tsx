"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BarcodeScanner from "@/components/BarcodeScanner";
import BottomNav from "@/components/BottomNav";
import { getProductsApi, searchLocationsApi, warmupCacheApi, preloadHistory, preloadProducts, getAllLocationsApi, getHistoryApi } from "@/lib/api";
import { getCache, setCache } from "@/lib/cache";
import toast from "react-hot-toast";
import LoadingSpinner from "@/components/LoadingSpinner";
import { HistoryEntry } from "@/lib/types";

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
  const warmedRef = useRef(false);
  const allLocationsRef = useRef<LocationResult[] | null>(null);
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([]);
  const [totalLocations, setTotalLocations] = useState(0);

  const normalizeLocationCode = (value: string) => value.toUpperCase().replace(/\s+/g, "").trim();

  // Compute dashboard stats from data
  const stats = useMemo(() => {
    const uniqueLocations = new Set(recentHistory.map((e) => e.location));
    const scannedCount = uniqueLocations.size;
    const total = Math.max(totalLocations, scannedCount);
    const pending = Math.max(0, total - scannedCount);
    const progress = total > 0 ? Math.round((scannedCount / total) * 100) : 0;

    // Recent scans: group by location, get latest timestamp & item count
    const locationMap = new Map<string, { items: number; timestamp: string; operator: string }>();
    recentHistory.forEach((e) => {
      const existing = locationMap.get(e.location);
      if (!existing) {
        locationMap.set(e.location, { items: 1, timestamp: e.timestamp, operator: e.operator });
      } else {
        existing.items += 1;
      }
    });

    const recentScans = Array.from(locationMap.entries())
      .map(([loc, data]) => ({ location: loc, ...data }))
      .slice(0, 5);

    return { total, scannedCount, pending, progress, recentScans };
  }, [recentHistory, totalLocations]);

  useEffect(() => {
    if (warmedRef.current) return;
    warmedRef.current = true;

    const loadAllLocations = async () => {
      const cached = getCache<LocationResult[]>("allLocations");
      if (cached && cached.age < 300) {
        allLocationsRef.current = cached.data;
        setTotalLocations(cached.data.length);
      }
      try {
        const result = await getAllLocationsApi();
        if (result.success && result.locations) {
          allLocationsRef.current = result.locations;
          setCache("allLocations", result.locations);
          setTotalLocations(result.locations.length);
        }
      } catch { }
    };
    loadAllLocations();

    // Load recent history for dashboard
    if (user?.email) {
      const cachedHist = getCache<HistoryEntry[]>(`history:${user.email}:all`);
      if (cachedHist) setRecentHistory(cachedHist.data);
      getHistoryApi(user.email).then((res) => {
        if (res.success && res.history) {
          setRecentHistory(res.history);
          setCache(`history:${user.email}:all`, res.history);
        }
      }).catch(() => {});
    }

    warmupCacheApi().catch(() => {});
    if (user?.email) preloadHistory(user.email);
    router.prefetch("/input");
  }, [user, router]);

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
    if (allLocationsRef.current) {
      const exists = allLocationsRef.current.some(
        (loc) => loc.locationCode.toLowerCase() === code.toLowerCase()
      );
      if (exists) {
        toast.success("Lokasi ditemukan!");
        getProductsApi(code).then((result) => {
          if (result.success && result.products) {
            setCache(`products:${code}`, result.products);
          }
        }).catch(() => {});
        router.push(`/input?location=${encodeURIComponent(code)}`);
        return;
      }
    }

    setLoading(true);
    try {
      const result = await getProductsApi(code);
      if (result.success && result.products && result.products.length > 0) {
        setCache(`products:${code}`, result.products);
        toast.success("Lokasi ditemukan!");
        router.push(`/input?location=${encodeURIComponent(code)}`);
      } else {
        toast.error(result.message || "Lokasi tidak ditemukan");
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Koneksi ke server bermasalah. Coba lagi.");
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

    if (allLocationsRef.current) {
      const q = normalized.toLowerCase();
      const filtered = allLocationsRef.current
        .filter((loc) => loc.locationCode.toLowerCase().includes(q))
        .slice(0, 15);
      setLocationResults(filtered);
      setShowResults(filtered.length > 0);
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
            toast("Mode cari lokasi belum aktif di backend.", { icon: "ℹ️" });
          }
        }
      } catch (error) {
        console.error("Location search error:", error);
        setShowResults(false);
      } finally {
        setSearchLoading(false);
      }
    }, 80);
  };

  const handleSelectLocation = (loc: LocationResult) => {
    setLocationCode(loc.locationCode);
    setShowResults(false);
    setLocationResults([]);
    preloadProducts(loc.locationCode);
    searchLocation(loc.locationCode);
  };

  // Format relative time
  const formatRelativeTime = (ts: string) => {
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) {
        // Try "dd MMM yyyy HH:mm" format
        const m = ts.match(/(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/);
        if (!m) return ts;
        const months: Record<string, number> = { Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11 };
        const d = new Date(+m[3], months[m[2]] ?? 0, +m[1], +m[4], +m[5]);
        if (isNaN(d.getTime())) return ts;
        return formatRelativeFromDate(d);
      }
      return formatRelativeFromDate(date);
    } catch { return ts; }
  };

  const formatRelativeFromDate = (date: Date) => {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return "Baru saja";
    if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
    return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  };

  return (
    <div className="min-h-screen pb-24 bg-[var(--primary-bg)]">
      {/* ── Header ── */}
      <div className="bg-white px-5 pt-6 pb-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Halo, {user?.name?.split(" ")[0] || "User"} 👋</h1>
            <p className="text-sm text-text-secondary">Stock Opname BLP</p>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-pale rounded-full">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
            <span className="text-xs font-semibold text-primary">LIVE</span>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-0">
        {/* ── Search Bar ── */}
        <div className="mt-4 relative">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={locationCode}
              onChange={(e) => handleLocationSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
              className="w-full pl-12 pr-14 py-3.5 bg-white border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary shadow-card text-sm"
              placeholder="Ketik kode lokasi, cth: A01-B02-C03"
              disabled={loading}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowLocationScanner(true)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-md active:scale-95 transition"
              title="Scan barcode lokasi"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                <path d="M7 12h10" />
                <path d="M7 9h2M11 9h2M15 9h2M7 15h2M11 15h2M15 15h2" />
              </svg>
            </button>
          </div>

          {/* Search Results Dropdown */}
          {showResults && locationResults.length > 0 && (
            <div className="mt-2 bg-white border border-border rounded-2xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
              {locationResults.map((loc, index) => (
                <button
                  key={loc.locationCode}
                  onClick={() => handleSelectLocation(loc)}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-primary-pale transition text-left active:bg-primary/10 ${
                    index < locationResults.length - 1 ? "border-b border-gray-100" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
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

          {showResults && locationResults.length === 0 && !searchLoading && locationCode.trim().length >= 1 && (
            <div className="mt-2 bg-white border border-border rounded-2xl p-4 text-center shadow-card">
              <p className="text-sm text-text-secondary">Lokasi tidak ditemukan</p>
            </div>
          )}
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="mt-4 flex items-center justify-center gap-2 py-4">
            <LoadingSpinner />
            <span className="text-sm text-text-secondary">Mencari lokasi...</span>
          </div>
        )}

        {/* ── Progress Card ── */}
        <div className="mt-5 bg-white rounded-2xl p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-text-primary">Progress Opname</h2>
            <span className="text-2xl font-bold text-primary">{stats.progress}%</span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-700"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
          <p className="text-xs text-text-secondary">{stats.scannedCount} dari {stats.total} lokasi selesai</p>
        </div>

        {/* ── Stat Cards ── */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-card text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-primary/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <p className="text-xl font-bold text-text-primary">{stats.total}</p>
            <p className="text-[11px] text-text-secondary">Total Lokasi</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-card text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-primary/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <path d="M22 4L12 14.01l-3-3" />
              </svg>
            </div>
            <p className="text-xl font-bold text-primary">{stats.scannedCount}</p>
            <p className="text-[11px] text-text-secondary">Selesai</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-card text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-accent-red/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-accent-red" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
            <p className="text-xl font-bold text-accent-red">{stats.pending}</p>
            <p className="text-[11px] text-text-secondary">Pending</p>
          </div>
        </div>

        {/* ── Scan Terakhir ── */}
        {stats.recentScans.length > 0 && (
          <div className="mt-6">
            <h2 className="text-base font-semibold text-text-primary mb-3">Scan Terakhir</h2>
            <div className="space-y-3">
              {stats.recentScans.map((scan, idx) => (
                <button
                  key={scan.location}
                  onClick={() => {
                    setLocationCode(scan.location);
                    searchLocation(scan.location);
                  }}
                  className="w-full bg-white rounded-2xl p-4 shadow-card flex items-center gap-4 text-left active:scale-[0.98] transition"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="w-2.5 h-2.5 bg-primary rounded-full"></span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-text-primary text-sm">{scan.location}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{formatRelativeTime(scan.timestamp)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-pale text-primary text-xs font-semibold rounded-full">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>
                      Selesai
                    </span>
                    <p className="text-xs text-text-secondary mt-1">{scan.items} item</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Location Scanner Modal ── */}
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

      <BottomNav activePage="scan" />
    </div>
  );
}
