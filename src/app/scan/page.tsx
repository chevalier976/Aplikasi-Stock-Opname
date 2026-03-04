"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BarcodeScanner from "@/components/BarcodeScanner";
import BottomNav from "@/components/BottomNav";
import { getProductsApi, searchLocationsApi, warmupCacheApi, preloadHistory, preloadProducts, getAllLocationsApi, getHistoryApi, searchProductsGlobalApi, moveProductsApi } from "@/lib/api";
import { getCache, setCache, clearCache } from "@/lib/cache";
import { invalidateMemCache } from "@/lib/api";
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

  // Product search + move state
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<Array<{ location: string; productName: string; sku: string; batch: string; barcode: string }>>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [showProductResults, setShowProductResults] = useState(false);
  const productSearchTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Quick move
  const [moveItem, setMoveItem] = useState<{ location: string; sku: string; batch: string; productName: string } | null>(null);
  const [quickMoveTarget, setQuickMoveTarget] = useState("");
  const [quickMoveSuggestions, setQuickMoveSuggestions] = useState<LocationResult[]>([]);
  const [showQuickMoveSuggestions, setShowQuickMoveSuggestions] = useState(false);
  const [quickMoving, setQuickMoving] = useState(false);
  const quickMoveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const quickMoveRef = useRef<HTMLDivElement>(null);

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
        // Keep the newest timestamp per location
        if (new Date(e.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
          existing.timestamp = e.timestamp;
        }
      }
    });

    const recentScans = Array.from(locationMap.entries())
      .map(([loc, data]) => ({ location: loc, ...data }))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
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

      // Check if we just saved — if so, delay API refresh to avoid overwriting optimistic data
      const lastSave = Number(localStorage.getItem("lastSaveTs") || "0");
      const sinceSave = Date.now() - lastSave;
      const refreshDelay = sinceSave < 15_000 ? Math.max(15_000 - sinceSave, 0) : 0;

      setTimeout(() => {
        getHistoryApi(user!.email, undefined).then((res) => {
          if (res.success && res.history) {
            setRecentHistory(res.history);
            setCache(`history:${user!.email}:all`, res.history);
          }
        }).catch(() => {});
      }, refreshDelay);
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

  // ── Product search handlers ──
  const handleProductSearch = (value: string) => {
    setProductQuery(value);
    if (productSearchTimerRef.current) clearTimeout(productSearchTimerRef.current);
    if (value.trim().length < 2) {
      setProductResults([]);
      setShowProductResults(false);
      return;
    }
    productSearchTimerRef.current = setTimeout(async () => {
      setProductSearchLoading(true);
      try {
        const result = await searchProductsGlobalApi(value.trim());
        if (result.success && result.products) {
          setProductResults(result.products);
          setShowProductResults(result.products.length > 0);
        }
      } catch { setShowProductResults(false); }
      finally { setProductSearchLoading(false); }
    }, 250);
  };

  const openQuickMove = (item: { location: string; sku: string; batch: string; productName: string }) => {
    setMoveItem(item);
    setQuickMoveTarget("");
    setQuickMoveSuggestions([]);
    setShowQuickMoveSuggestions(false);
  };

  const handleQuickMoveLocSearch = (value: string) => {
    const v = value.toUpperCase().trim();
    setQuickMoveTarget(v);
    if (quickMoveTimerRef.current) clearTimeout(quickMoveTimerRef.current);
    if (!v) { setQuickMoveSuggestions([]); setShowQuickMoveSuggestions(false); return; }

    // Use local allLocations if available
    if (allLocationsRef.current) {
      const q = v.toLowerCase();
      const filtered = allLocationsRef.current
        .filter(l => l.locationCode.toLowerCase().includes(q) && l.locationCode.toUpperCase() !== moveItem?.location.toUpperCase())
        .slice(0, 10);
      setQuickMoveSuggestions(filtered);
      setShowQuickMoveSuggestions(filtered.length > 0);
      return;
    }

    quickMoveTimerRef.current = setTimeout(async () => {
      try {
        const result = await searchLocationsApi(v);
        if (result.success && result.locations) {
          setQuickMoveSuggestions(result.locations.filter(l => l.locationCode.toUpperCase() !== moveItem?.location.toUpperCase()));
          setShowQuickMoveSuggestions(true);
        }
      } catch {}
    }, 200);
  };

  const executeQuickMove = async () => {
    if (!moveItem || !quickMoveTarget.trim()) return;
    const target = quickMoveTarget.trim().toUpperCase();
    if (target === moveItem.location.toUpperCase()) {
      toast.error("Lokasi tujuan tidak boleh sama");
      return;
    }
    setQuickMoving(true);
    try {
      const result = await moveProductsApi(moveItem.location, target, [{ sku: moveItem.sku, batch: moveItem.batch }]);
      if (result.success) {
        toast.success(result.message || "Produk berhasil dipindah");
        setMoveItem(null);
        // Re-search to refresh results
        if (productQuery.trim().length >= 2) {
          const refreshed = await searchProductsGlobalApi(productQuery.trim());
          if (refreshed.success && refreshed.products) {
            setProductResults(refreshed.products);
          }
        }
      } else {
        toast.error(result.message || "Gagal memindah");
      }
    } catch { toast.error("Gagal memindah produk"); }
    finally { setQuickMoving(false); }
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

        {/* ── Cari & Pindah Produk ── */}
        <div className="mt-4 bg-white rounded-2xl p-4 shadow-card">
          <h2 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            Cari &amp; Pindah Produk
          </h2>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={productQuery}
              onChange={(e) => handleProductSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Ketik nama produk, SKU, atau batch..."
              autoComplete="off"
            />
            {productSearchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Product search results */}
          {showProductResults && productResults.length > 0 && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
              {productResults.map((p, idx) => (
                <div
                  key={`${p.location}-${p.sku}-${p.batch}-${idx}`}
                  className="flex items-center justify-between px-3 py-2 bg-white hover:bg-gray-50 transition"
                >
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="text-xs font-semibold text-text-primary truncate">{p.productName}</p>
                    <p className="text-[10px] text-text-secondary">
                      SKU: {p.sku}{p.batch ? ` · Batch: ${p.batch}` : ""}
                    </p>
                    <p className="text-[10px] text-primary font-medium">📍 {p.location}</p>
                  </div>
                  <button
                    onClick={() => openQuickMove({ location: p.location, sku: p.sku, batch: p.batch, productName: p.productName })}
                    className="flex-shrink-0 px-2.5 py-1.5 bg-amber-500 text-white text-[10px] font-semibold rounded-lg hover:bg-amber-600 active:scale-95 transition"
                  >
                    Pindah
                  </button>
                </div>
              ))}
            </div>
          )}

          {showProductResults && productResults.length === 0 && !productSearchLoading && productQuery.trim().length >= 2 && (
            <p className="mt-2 text-xs text-text-secondary text-center py-2">Produk tidak ditemukan</p>
          )}
        </div>

        {/* ── Quick Move Modal ── */}
        {moveItem && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setMoveItem(null)}>
            <div ref={quickMoveRef} className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-text-primary">Pindah Produk</h3>
                <button onClick={() => setMoveItem(null)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500">✕</button>
              </div>

              {/* Product info */}
              <div className="bg-gray-50 rounded-xl p-3 mb-4">
                <p className="text-sm font-semibold text-text-primary">{moveItem.productName}</p>
                <p className="text-xs text-text-secondary mt-0.5">SKU: {moveItem.sku}{moveItem.batch ? ` · Batch: ${moveItem.batch}` : ""}</p>
                <p className="text-xs text-primary font-medium mt-1">📍 Dari: {moveItem.location}</p>
              </div>

              {/* Target location */}
              <label className="block text-sm font-semibold text-text-primary mb-1">Lokasi Tujuan</label>
              <div className="relative">
                <input
                  type="text"
                  value={quickMoveTarget}
                  onChange={(e) => handleQuickMoveLocSearch(e.target.value)}
                  onFocus={() => { if (quickMoveSuggestions.length > 0) setShowQuickMoveSuggestions(true); }}
                  className="w-full px-4 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 uppercase text-sm"
                  placeholder="Ketik lokasi tujuan..."
                  autoComplete="off"
                />
                {showQuickMoveSuggestions && quickMoveSuggestions.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {quickMoveSuggestions.map(loc => (
                      <button
                        key={loc.locationCode}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setQuickMoveTarget(loc.locationCode); setShowQuickMoveSuggestions(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-amber-50 transition border-b border-border last:border-b-0 text-sm"
                      >
                        <span className="font-medium">{loc.locationCode}</span>
                        <span className="text-xs text-text-secondary ml-2">({loc.productCount} produk)</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setMoveItem(null)}
                  className="flex-1 py-2.5 bg-gray-100 text-text-primary text-sm font-semibold rounded-xl hover:bg-gray-200 transition"
                >
                  Batal
                </button>
                <button
                  onClick={executeQuickMove}
                  disabled={!quickMoveTarget.trim() || quickMoving}
                  className="flex-1 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  {quickMoving ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Memindah...</>
                  ) : "Pindahkan"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Scan Terakhir (compact table) ── */}
        {stats.recentScans.length > 0 && (
          <div className="mt-5">
            <h2 className="text-sm font-semibold text-text-primary mb-2">Scan Terakhir</h2>
            <div className="bg-white rounded-xl shadow-card overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-border">
                    <th className="text-left px-3 py-1.5 font-semibold text-text-secondary">Lokasi</th>
                    <th className="text-right px-3 py-1.5 font-semibold text-text-secondary w-14">Item</th>
                    <th className="text-right px-3 py-1.5 font-semibold text-text-secondary w-20">Waktu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.recentScans.map((scan) => (
                    <tr key={scan.location}>
                      <td className="px-3 py-2 text-text-primary font-medium text-[11px]">{scan.location}</td>
                      <td className="px-3 py-2 text-right text-primary font-semibold">{scan.items}</td>
                      <td className="px-3 py-2 text-right text-text-secondary text-[10px]">{formatRelativeTime(scan.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
