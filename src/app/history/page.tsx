"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import EditModal, { EditData } from "@/components/EditModal";
import LoadingSpinner from "@/components/LoadingSpinner";
import QtyInput from "@/components/QtyInput";
import BarcodeScanner from "@/components/BarcodeScanner";
import { getHistoryApi, updateEntryApi, deleteEntryApi, warmupCacheApi, saveStockOpnameApi, lookupBarcodeApi, searchProductsApi, getAllProductsApi, getAllLocationsApi } from "@/lib/api";
import { HistoryEntry, Product } from "@/lib/types";
import { getCache, setCache, clearCache } from "@/lib/cache";
import toast from "react-hot-toast";

export default function HistoryPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showFormula, setShowFormula] = useState<string | null>(null);

  // ── Search & Filter state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDate, setFilterDate] = useState("");   // "YYYY-MM-DD"
  const searchRef = useRef<HTMLInputElement>(null);

  // Inline edit state
  const [editingBatch, setEditingBatch] = useState<string | null>(null);
  const [editingBatchValue, setEditingBatchValue] = useState("");
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState(0);
  const [editingQtyFormula, setEditingQtyFormula] = useState("");

  // ── Add Product state ──
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [addSearchResults, setAddSearchResults] = useState<Product[]>([]);
  const [showAddSuggestions, setShowAddSuggestions] = useState(false);
  const [addSearchTimer, setAddSearchTimer] = useState<NodeJS.Timeout | null>(null);
  const [addFormula, setAddFormula] = useState("");
  const allProductsRef = useRef<Product[] | null>(null);
  const allLocationsRef = useRef<Array<{ locationCode: string; productCount: number }> | null>(null);
  const [locationResults, setLocationResults] = useState<Array<{ locationCode: string; productCount: number }>>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [showLocationScanner, setShowLocationScanner] = useState(false);
  const [addForm, setAddForm] = useState({
    location: "",
    productName: "",
    sku: "",
    batch: "",
    barcode: "",
    qty: 0,
  });

  useEffect(() => {
    fetchHistory();
    warmupCacheApi().catch(() => {});
    // Load all products + locations in parallel for instant search
    const cachedProducts = getCache<Product[]>("allProducts");
    if (cachedProducts) allProductsRef.current = cachedProducts.data;
    const cachedLocations = getCache<Array<{ locationCode: string; productCount: number }>>("allLocations");
    if (cachedLocations) allLocationsRef.current = cachedLocations.data;
    // Background refresh
    getAllProductsApi().then((res) => {
      if (res.success && res.products) {
        allProductsRef.current = res.products;
        setCache("allProducts", res.products);
      }
    }).catch(() => {});
    getAllLocationsApi().then((res) => {
      if (res.success && res.locations) {
        allLocationsRef.current = res.locations;
        setCache("allLocations", res.locations);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchHistory = async () => {
    if (!user) return;

    const ck = `history:${user.email}:all`;

    // Show cached data instantly
    const cached = getCache<HistoryEntry[]>(ck);
    if (cached) {
      setHistory(cached.data);
      setLoading(false);
    }

    // Background refresh
    try {
      const result = await getHistoryApi(user.email);

      if (result.success && result.history) {
        setHistory(result.history);
        setCache(ck, result.history);
      } else if (!cached) {
        toast.error(result.message || "Gagal mengambil riwayat");
      }
    } catch (error) {
      console.error("Fetch history error:", error);
      if (!cached) toast.error("Terjadi kesalahan saat mengambil riwayat");
    } finally {
      setLoading(false);
    }
  };

  // ── Parse a timestamp string to a Date object ──
  const parseTimestamp = (raw: string): Date | null => {
    try {
      // ISO format: "2026-02-16T18:28:00Z"
      if (/\d{4}-\d{2}-\d{2}T/.test(raw)) return new Date(raw);
      // Format: "16 Feb 2026 18:28"
      const m = raw.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (m) {
        const months: Record<string, number> = {
          Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11
        };
        return new Date(+m[3], months[m[2]] ?? 0, +m[1]);
      }
      return new Date(raw);
    } catch { return null; }
  };

  // ── Client-side filtered data (instant) ──
  const filteredHistory = useMemo(() => {
    let result = history;

    // Search by product name
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((e) =>
        e.productName.toLowerCase().includes(q) ||
        e.sku.toLowerCase().includes(q)
      );
    }

    // Filter by specific date
    if (filterDate) {
      result = result.filter((e) => {
        const d = parseTimestamp(e.timestamp);
        if (!d) return false;
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return iso === filterDate;
      });
    }

    return result;
  }, [history, searchQuery, filterDate]);

  const hasActiveFilters = searchQuery || filterDate;

  const clearAllFilters = () => {
    setSearchQuery("");
    setFilterDate("");
  };

  const handleEdit = (entry: HistoryEntry) => {
    setSelectedEntry(entry);
    setIsModalOpen(true);
  };

  const handleDelete = async (entry: HistoryEntry) => {
    const confirmDelete = window.confirm(
      `Hapus entry "${entry.productName}" (Qty: ${entry.qty})?`
    );
    if (!confirmDelete) return;

    // AppSheet-style: optimistic delete — hapus dari UI langsung
    const prev = [...history];
    const updated = history.filter((e) => e.rowId !== entry.rowId);
    setHistory(updated);
    toast.success("Entry berhasil dihapus");

    const ck = `history:${user?.email}:all`;
    setCache(ck, updated);
    clearCache("products:"); // invalidate product cache

    // Background sync ke server
    try {
      const result = await deleteEntryApi(entry.rowId);
      if (!result.success) {
        setHistory(prev);
        setCache(ck, prev);
        toast.error(result.message || "Gagal menghapus, data dikembalikan");
      }
    } catch (error) {
      console.error("Delete error:", error);
      setHistory(prev);
      setCache(ck, prev);
      toast.error("Gagal menghapus, data dikembalikan");
    }
  };

  const handleSaveEdit = async (data: EditData) => {
    if (!selectedEntry) return;

    const editTimestamp = new Date().toISOString();
    const prev = [...history];

    // AppSheet-style: optimistic edit — update UI langsung
    const updated = history.map((e) =>
      e.rowId === selectedEntry.rowId
        ? {
            ...e,
            productName: data.productName ?? e.productName,
            sku: data.sku ?? e.sku,
            batch: data.batch ?? e.batch,
            qty: data.newQty,
            formula: data.formula || e.formula,
            edited: "Yes",
            editTimestamp,
          }
        : e
    );
    setHistory(updated);
    setIsModalOpen(false);
    toast.success("Berhasil mengupdate entry");

    const ck = `history:${user?.email}:all`;
    setCache(ck, updated);

    // Background sync ke server
    try {
      const result = await updateEntryApi(
        selectedEntry.rowId,
        selectedEntry.sessionId,
        data.newQty,
        editTimestamp,
        {
          productName: data.productName,
          sku: data.sku,
          batch: data.batch,
          formula: data.formula,
        }
      );

      if (!result.success) {
        setHistory(prev);
        setCache(ck, prev);
        toast.error(result.message || "Gagal mengupdate, data dikembalikan");
      }
    } catch (error) {
      console.error("Update error:", error);
      setHistory(prev);
      setCache(ck, prev);
      toast.error("Gagal mengupdate, data dikembalikan");
    }
  };

  // ── Inline edit handlers ──

  const startInlineBatchEdit = (entry: HistoryEntry) => {
    setEditingBatch(entry.rowId);
    setEditingBatchValue(entry.batch);
  };

  const saveInlineBatch = async (entry: HistoryEntry) => {
    const newBatch = editingBatchValue.trim();
    setEditingBatch(null);
    if (newBatch === entry.batch) return; // no change

    const editTimestamp = new Date().toISOString();
    const prev = [...history];

    // Optimistic update
    const updated = history.map((e) =>
      e.rowId === entry.rowId ? { ...e, batch: newBatch, edited: "Yes", editTimestamp } : e
    );
    setHistory(updated);
    toast.success("Batch berhasil diupdate");

    const ck = `history:${user?.email}:all`;
    setCache(ck, updated);

    try {
      const result = await updateEntryApi(
        entry.rowId,
        entry.sessionId,
        entry.qty,
        editTimestamp,
        { batch: newBatch }
      );
      if (!result.success) {
        setHistory(prev);
        setCache(ck, prev);
        toast.error(result.message || "Gagal update batch");
      }
    } catch {
      setHistory(prev);
      setCache(ck, prev);
      toast.error("Gagal update batch");
    }
  };

  const startInlineQtyEdit = (entry: HistoryEntry) => {
    setEditingQty(entry.rowId);
    setEditingQtyValue(entry.qty);
    setEditingQtyFormula(entry.formula || "");
  };

  const saveInlineQty = async (entry: HistoryEntry) => {
    const newQty = editingQtyValue;
    const newFormula = editingQtyFormula;
    setEditingQty(null);
    if (newQty === entry.qty && newFormula === (entry.formula || "")) return; // no change

    const editTimestamp = new Date().toISOString();
    const prev = [...history];

    // Optimistic update
    const updated = history.map((e) =>
      e.rowId === entry.rowId
        ? { ...e, qty: newQty, formula: newFormula, edited: "Yes", editTimestamp }
        : e
    );
    setHistory(updated);
    toast.success("Qty berhasil diupdate");

    const ck = `history:${user?.email}:all`;
    setCache(ck, updated);

    try {
      const result = await updateEntryApi(
        entry.rowId,
        entry.sessionId,
        newQty,
        editTimestamp,
        { formula: newFormula }
      );
      if (!result.success) {
        setHistory(prev);
        setCache(ck, prev);
        toast.error(result.message || "Gagal update qty");
      }
    } catch {
      setHistory(prev);
      setCache(ck, prev);
      toast.error("Gagal update qty");
    }
  };

  // ── Add Product handlers ──
  const normalizeLocationCode = (value: string) => value.toUpperCase().replace(/\s+/g, "").trim();

  const handleLocationSearch = (value: string) => {
    const normalized = normalizeLocationCode(value);
    setAddForm((prev) => ({ ...prev, location: normalized }));

    if (normalized.length < 1) {
      setLocationResults([]);
      setShowLocationSuggestions(false);
      return;
    }

    // Build combined location list: API locations + unique history locations
    let candidates: Array<{ locationCode: string; productCount: number }> = [];

    if (allLocationsRef.current) {
      candidates = [...allLocationsRef.current];
    }

    // Add unique locations from history that aren't already in candidates
    const existingCodes = new Set(candidates.map((c) => c.locationCode.toLowerCase()));
    const historyLocations = new Set(history.map((e) => e.location));
    historyLocations.forEach((loc) => {
      if (!existingCodes.has(loc.toLowerCase())) {
        candidates.push({ locationCode: loc, productCount: 0 });
      }
    });

    const q = normalized.toLowerCase();
    const filtered = candidates
      .filter((loc) => loc.locationCode.toLowerCase().includes(q))
      .slice(0, 15);
    setLocationResults(filtered);
    setShowLocationSuggestions(filtered.length > 0);
  };

  const handleSelectLocation = (loc: { locationCode: string }) => {
    setAddForm((prev) => ({ ...prev, location: loc.locationCode }));
    setLocationResults([]);
    setShowLocationSuggestions(false);
  };

  const handleLocationBarcodeScan = (code: string) => {
    setShowLocationScanner(false);
    const normalized = normalizeLocationCode(code);
    setAddForm((prev) => ({ ...prev, location: normalized }));
    toast.success(`Lokasi: ${normalized}`);
  };

  const handleAddProductSearch = (value: string) => {
    setAddForm((prev) => ({ ...prev, productName: value }));
    if (addSearchTimer) clearTimeout(addSearchTimer);
    if (value.trim().length < 2) {
      setAddSearchResults([]);
      setShowAddSuggestions(false);
      return;
    }
    if (allProductsRef.current) {
      const q = value.trim().toLowerCase();
      const filtered = allProductsRef.current
        .filter((p) => p.productName.toLowerCase().includes(q))
        .slice(0, 10);
      setAddSearchResults(filtered);
      setShowAddSuggestions(filtered.length > 0);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await searchProductsApi(value.trim());
        if (result.success && result.products) {
          setAddSearchResults(result.products);
          setShowAddSuggestions(result.products.length > 0);
        }
      } catch (error) {
        console.error("Search error:", error);
      }
    }, 80);
    setAddSearchTimer(timer);
  };

  const handleAddSelectSuggestion = (product: Product) => {
    setAddForm((prev) => ({
      ...prev,
      productName: product.productName,
      sku: product.sku,
      batch: product.batch,
      barcode: product.barcode || prev.barcode,
    }));
    setShowAddSuggestions(false);
    setAddSearchResults([]);
    toast.success(`Produk dipilih: ${product.productName}`);
  };

  const handleAddBarcodeScan = async (barcode: string) => {
    setShowBarcodeScanner(false);
    setScanningBarcode(true);
    try {
      const result = await lookupBarcodeApi(barcode);
      if (result.success && result.product) {
        setAddForm((prev) => ({
          ...prev,
          productName: result.product!.productName,
          sku: result.product!.sku,
          batch: result.product!.batch || "",
          barcode: barcode,
        }));
        toast.success(`Produk ditemukan: ${result.product.productName}`);
      } else {
        setAddForm((prev) => ({ ...prev, barcode }));
        toast.error(result.message || "Produk tidak ditemukan, isi manual");
      }
    } catch (error) {
      console.error("Barcode lookup error:", error);
      setAddForm((prev) => ({ ...prev, barcode }));
      toast.error("Gagal lookup barcode, isi data manual");
    } finally {
      setScanningBarcode(false);
    }
  };

  const handleAddProduct = async () => {
    if (!addForm.location.trim()) {
      toast.error("Lokasi harus diisi");
      return;
    }
    if (!addForm.productName || !addForm.sku || !addForm.batch) {
      toast.error("Nama Produk, SKU, dan Batch harus diisi");
      return;
    }
    if (addForm.qty <= 0) {
      toast.error("Quantity harus lebih dari 0");
      return;
    }

    const sessionId = `${user?.email}_${Date.now()}`;
    const timestamp = new Date().toISOString();
    const items = [{
      productName: addForm.productName,
      sku: addForm.sku,
      batch: addForm.batch,
      barcode: addForm.barcode || "",
      qty: addForm.qty,
      formula: addFormula || "",
      isNew: true,
    }];

    // OPTIMISTIC: Add to history UI immediately — don't wait for server
    const newEntry: HistoryEntry = {
      sessionId,
      rowId: `temp_${Date.now()}`,
      timestamp,
      operator: user?.email || "",
      location: addForm.location.trim(),
      productName: addForm.productName,
      sku: addForm.sku,
      batch: addForm.batch,
      qty: addForm.qty,
      edited: "",
      editTimestamp: "",
      formula: addFormula || "",
    };
    setHistory((prev) => [newEntry, ...prev]);
    const ck = `history:${user?.email}:all`;
    setCache(ck, [newEntry, ...history]);

    // Reset form immediately
    setAddForm({ location: addForm.location, productName: "", sku: "", batch: "", barcode: "", qty: 0 });
    setAddFormula("");
    setShowAddForm(false);
    toast.success("Produk berhasil ditambahkan!");

    // Background sync to server
    saveStockOpnameApi(sessionId, user?.email || "", addForm.location.trim(), timestamp, items)
      .then((result) => {
        if (result.success) {
          // Refresh history to get real rowId
          clearCache("history:");
          fetchHistory();
        } else {
          toast.error(result.message || "Gagal sinkron ke server");
        }
      })
      .catch(() => {
        toast.error("Gagal sinkron ke server");
      });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pb-20 bg-[var(--primary-bg)]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 bg-[var(--primary-bg)]">
      {/* ── Header ── */}
      <div className="bg-white px-5 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-xl font-bold text-text-primary">Riwayat</h1>
          <span className="px-2.5 py-0.5 bg-primary text-white text-xs font-bold rounded-full">{history.length}</span>
        </div>

        {/* ── Filter Tabs ── */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar">
          {(["all", "today", "week", "month"] as const).map((tab) => {
            const labels = { all: "Semua", today: "Hari Ini", week: "Minggu Ini", month: "Bulan Ini" };
            const isActive = !filterDate && !searchQuery && tab === "all"
              || (tab === "today" && filterDate === new Date().toISOString().slice(0, 10));
            return (
              <button
                key={tab}
                onClick={() => {
                  if (tab === "all") { setFilterDate(""); setSearchQuery(""); }
                  else if (tab === "today") { setFilterDate(new Date().toISOString().slice(0, 10)); }
                  else if (tab === "week") {
                    const d = new Date(); d.setDate(d.getDate() - 7);
                    setFilterDate(""); // Will use searchQuery approach
                  }
                  else if (tab === "month") {
                    const d = new Date(); d.setDate(d.getDate() - 30);
                    setFilterDate("");
                  }
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                  (tab === "all" && !filterDate && !searchQuery)
                    ? "bg-text-primary text-white"
                    : "bg-gray-100 text-text-secondary hover:bg-gray-200"
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-3">
        {/* ── Search Box ── */}
        <div className="mb-3">
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              placeholder="Cari nama produk atau SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm shadow-card"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* ── Date Filter + Counter ── */}
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1.5 shadow-card border border-border">
            <svg className="w-4 h-4 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="text-xs focus:outline-none bg-transparent"
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-accent-red font-medium transition px-2 py-1"
            >
              Reset
            </button>
          )}

          <span className="ml-auto text-[11px] text-text-secondary bg-white px-2 py-1 rounded-lg shadow-card">
            {filteredHistory.length} / {history.length}
          </span>
        </div>

        {/* ── Add Product Button ── */}
        <div className="mb-3">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-full bg-primary text-white py-3 rounded-2xl font-semibold hover:bg-primary-light transition text-sm shadow-card active:scale-[0.98]"
          >
            {showAddForm ? "✕ Tutup Form" : "+ Tambah Produk Baru"}
          </button>
        </div>

        {/* ── Add Product Form ── */}
        {showAddForm && (
          <div className="bg-white border border-border rounded-2xl p-4 mb-4 shadow-card">
            <h3 className="text-sm font-semibold mb-3 text-text-primary">Tambah Produk Baru</h3>

            {scanningBarcode && (
              <div className="mb-3 flex items-center justify-center gap-2 text-xs text-text-secondary">
                <LoadingSpinner /> Mencari produk...
              </div>
            )}

            <div className="space-y-2.5">
              {/* Lokasi */}
              <div className="relative">
                <label className="block text-xs font-medium text-text-primary mb-1">Lokasi</label>
                <div className="relative">
                  <input
                    type="text"
                    value={addForm.location}
                    onChange={(e) => handleLocationSearch(e.target.value)}
                    onFocus={() => { if (locationResults.length > 0) setShowLocationSuggestions(true); }}
                    onBlur={() => { setTimeout(() => setShowLocationSuggestions(false), 200); }}
                    className="w-full pl-3 pr-12 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    placeholder="Ketik atau scan lokasi..."
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLocationScanner(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20"
                    title="Scan barcode lokasi"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                      <path d="M7 12h10" />
                    </svg>
                  </button>
                </div>
                {showLocationSuggestions && locationResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {locationResults.map((loc, idx) => (
                      <button
                        key={`loc-${idx}`}
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-primary-pale transition border-b border-border last:border-b-0"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectLocation(loc)}
                      >
                        <p className="font-medium text-text-primary text-xs">{loc.locationCode}</p>
                        {loc.productCount > 0 && (
                          <p className="text-[10px] text-text-secondary">{loc.productCount} produk</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Barcode */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Barcode</label>
                <div className="relative">
                  <input
                    type="text"
                    value={addForm.barcode}
                    onChange={(e) => setAddForm({ ...addForm, barcode: e.target.value.trim() })}
                    onKeyDown={(e) => {
                      const bv = String(addForm.barcode || "").trim();
                      if (e.key === "Enter" && bv) { e.preventDefault(); handleAddBarcodeScan(bv); }
                    }}
                    className="w-full pl-3 pr-20 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-gray-50"
                    placeholder="Scan / ketik barcode"
                    autoComplete="off"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { const bv = String(addForm.barcode || "").trim(); if (bv) handleAddBarcodeScan(bv); }}
                      disabled={!String(addForm.barcode || "").trim() || scanningBarcode}
                      className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 disabled:opacity-50"
                      title="Cari barcode"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBarcodeScanner(true)}
                      disabled={scanningBarcode}
                      className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 disabled:opacity-50"
                      title="Scan barcode"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                        <path d="M7 12h10" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Nama Produk + Search */}
              <div className="relative">
                <label className="block text-xs font-medium text-text-primary mb-1">Nama Produk</label>
                <input
                  type="text"
                  value={addForm.productName}
                  onChange={(e) => handleAddProductSearch(e.target.value)}
                  onFocus={() => { if (addSearchResults.length > 0) setShowAddSuggestions(true); }}
                  onBlur={() => { setTimeout(() => setShowAddSuggestions(false), 200); }}
                  className="w-full px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  placeholder="Ketik min. 2 huruf untuk cari produk..."
                  autoComplete="off"
                />
                {showAddSuggestions && addSearchResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {addSearchResults.map((p, idx) => (
                      <button
                        key={`${p.sku}-${idx}`}
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-primary-pale transition border-b border-border last:border-b-0"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleAddSelectSuggestion(p)}
                      >
                        <p className="font-medium text-text-primary text-xs">{p.productName}</p>
                        <p className="text-[10px] text-text-secondary">SKU: {p.sku} | Batch: {p.batch}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* SKU */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">SKU</label>
                <input type="text" value={addForm.sku} onChange={(e) => setAddForm({ ...addForm, sku: e.target.value })}
                  className="w-full px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" placeholder="Masukkan SKU" />
              </div>

              {/* Batch */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Batch</label>
                <input type="text" value={addForm.batch} onChange={(e) => setAddForm({ ...addForm, batch: e.target.value })}
                  className="w-full px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" placeholder="Masukkan batch" />
              </div>

              {/* Qty */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Quantity <span className="text-[10px] text-text-secondary font-normal">(bisa pakai rumus: 10+5, 10x10+5)</span></label>
                <QtyInput value={addForm.qty} onChange={(v) => setAddForm((prev) => ({ ...prev, qty: v }))} onExprCommit={(expr) => setAddFormula(expr)} wide />
              </div>

              <button
                onClick={handleAddProduct}
                className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-light transition text-sm active:scale-[0.98]"
              >
                Simpan Produk
              </button>
            </div>

            {/* Scanner Modals */}
            {showBarcodeScanner && (
              <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md rounded-2xl p-4 shadow-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-text-primary text-sm">Scan Barcode Produk</h3>
                    <button onClick={() => setShowBarcodeScanner(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500">✕</button>
                  </div>
                  <BarcodeScanner onScan={(code) => handleAddBarcodeScan(code)} active={showBarcodeScanner} />
                </div>
              </div>
            )}
            {showLocationScanner && (
              <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md rounded-2xl p-4 shadow-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-text-primary text-sm">Scan Barcode Lokasi</h3>
                    <button onClick={() => setShowLocationScanner(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500">✕</button>
                  </div>
                  <BarcodeScanner onScan={(code) => handleLocationBarcodeScan(code)} active={showLocationScanner} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Data Table ── */}
        {filteredHistory.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-card">
            <svg className="w-12 h-12 mx-auto mb-3 text-text-secondary/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-text-secondary text-sm">
              {hasActiveFilters ? "Tidak ada hasil yang cocok" : "Belum ada riwayat"}
            </p>
            {hasActiveFilters && (
              <button type="button" onClick={clearAllFilters} className="mt-2 text-sm text-primary font-medium hover:underline">
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[640px] w-full text-xs">
                <thead>
                  <tr className="bg-primary text-white">
                    <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">Lokasi</th>
                    <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">Nama Produk</th>
                    <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">Batch</th>
                    <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">Qty Fisik</th>
                    <th className="text-center px-2 py-3 font-semibold whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((entry, idx) => (
                    <tr
                      key={entry.rowId}
                      className={`border-b border-border hover:bg-primary-pale/50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : "bg-white"}`}
                    >
                      <td className="px-3 py-2.5 text-text-secondary whitespace-nowrap text-[11px]">{entry.location}</td>
                      <td className="px-3 py-2.5 text-text-primary whitespace-nowrap">
                        <span className="font-medium text-[11px]">{entry.productName}</span>
                        {entry.edited === "Yes" && <span className="ml-0.5 text-[10px] text-accent-yellow" title={`Diedit: ${entry.editTimestamp}`}>✏️</span>}
                      </td>
                      <td className="px-3 py-2.5 text-text-secondary whitespace-nowrap">
                        {editingBatch === entry.rowId ? (
                          <input
                            type="text" value={editingBatchValue}
                            onChange={(e) => setEditingBatchValue(e.target.value)}
                            onBlur={() => saveInlineBatch(entry)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveInlineBatch(entry); if (e.key === "Escape") setEditingBatch(null); }}
                            autoFocus className="w-24 px-1.5 py-0.5 border border-primary rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1 cursor-pointer group" onClick={() => startInlineBatchEdit(entry)}>
                            {entry.batch}
                            <span className="text-[10px] text-text-secondary opacity-0 group-hover:opacity-100 transition">✏️</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-primary whitespace-nowrap">
                        {editingQty === entry.rowId ? (
                          <div className="flex flex-col items-end">
                            <QtyInput wide value={editingQtyValue} onChange={(v) => setEditingQtyValue(v)} onExprCommit={(expr) => setEditingQtyFormula(expr)} />
                            <div className="flex gap-1 mt-1">
                              <button type="button" onClick={() => saveInlineQty(entry)} className="px-2 py-0.5 bg-primary text-white text-[10px] rounded-md font-semibold hover:bg-primary-light transition">💾</button>
                              <button type="button" onClick={() => setEditingQty(null)} className="px-2 py-0.5 bg-gray-200 text-text-primary text-[10px] rounded-md font-semibold hover:bg-gray-300 transition">✕</button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="inline-flex items-center justify-end gap-1">
                              <span className={entry.formula ? "cursor-pointer underline decoration-dotted" : ""} onClick={() => { if (entry.formula) setShowFormula(showFormula === entry.rowId ? null : entry.rowId); }}>
                                {entry.qty.toLocaleString()}
                              </span>
                              {entry.formula && <span className="text-[9px] text-text-secondary">🧮</span>}
                              <button type="button" onClick={() => startInlineQtyEdit(entry)} className="text-[10px] text-text-secondary hover:text-primary transition" title="Edit qty">✏️</button>
                            </span>
                            {showFormula === entry.rowId && entry.formula && (
                              <div className="mt-0.5 bg-gray-800 text-white text-[10px] px-2 py-0.5 rounded-lg shadow-lg whitespace-nowrap">{entry.formula}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleEdit(entry)} className="px-2 py-1 bg-primary text-white text-[10px] rounded-md font-medium hover:bg-primary-light transition">Edit</button>
                          <button onClick={() => handleDelete(entry)} className="px-2 py-1 bg-accent-red text-white text-[10px] rounded-md font-medium hover:bg-red-600 transition">Hapus</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selectedEntry && (
        <EditModal entry={selectedEntry} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveEdit} />
      )}

      <BottomNav activePage="history" />
    </div>
  );
}
