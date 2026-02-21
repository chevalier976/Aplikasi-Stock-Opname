"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import EditModal, { EditData } from "@/components/EditModal";
import LoadingSpinner from "@/components/LoadingSpinner";
import QtyInput from "@/components/QtyInput";
import { getHistoryApi, updateEntryApi, deleteEntryApi, warmupCacheApi } from "@/lib/api";
import { HistoryEntry } from "@/lib/types";
import { getCache, setCache, clearCache } from "@/lib/cache";
import toast from "react-hot-toast";
import BrandBLP from "@/components/BrandBLP";

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

  useEffect(() => {
    fetchHistory();
    warmupCacheApi().catch(() => {});
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pb-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-primary text-white p-6 shadow-md">
        <div className="mb-1"><BrandBLP className="text-white text-2xl" /></div>
        <h1 className="text-xl font-bold mb-1">Riwayat Stock Opname</h1>
        <p className="text-primary-pale">{user?.name || "User"}</p>
      </div>

      <div className="p-4">
        {/* ── Search Box ── */}
        <div className="mb-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">🔍</span>
            <input
              ref={searchRef}
              type="text"
              placeholder="Cari nama produk atau SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* ── Date Filter + Counter ── */}
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-secondary">📅</span>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="px-2 py-1.5 border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-red-500 hover:text-red-700 font-medium transition"
            >
              Reset
            </button>
          )}

          <span className="ml-auto text-[11px] text-text-secondary">
            {filteredHistory.length} / {history.length} entry
          </span>
        </div>

        {/* ── Flat Table ── */}
        {filteredHistory.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center">
            <p className="text-text-secondary">
              {hasActiveFilters ? "Tidak ada hasil yang cocok" : "Belum ada riwayat"}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-2 text-sm text-primary font-medium hover:underline"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            {/* ── Header row ── */}
            <div className="bg-primary text-white text-[11px] font-semibold flex items-center px-3 py-2">
              <span className="flex-1">Nama Produk</span>
              <span className="w-20 text-right mr-2">Qty Fisik</span>
              <span className="w-[88px] text-center">Aksi</span>
            </div>

            {/* ── Rows ── */}
            <div className="divide-y divide-border">
              {filteredHistory.map((entry, idx) => (
                <div
                  key={entry.rowId}
                  className={`px-3 py-2 ${idx % 2 === 1 ? "bg-gray-50/60" : ""}`}
                >
                  {/* Row 1: Product Name ... Qty ... Edit/Hapus */}
                  <div className="flex items-start gap-2">
                    {/* Product name — single line, truncate */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[12px] text-text-primary truncate leading-tight">
                        {entry.productName}
                        {entry.edited === "Yes" && (
                          <span className="ml-0.5 text-[10px] text-orange-500">✏️</span>
                        )}
                      </p>
                    </div>

                    {/* Qty */}
                    <div className="w-20 text-right shrink-0">
                      {editingQty === entry.rowId ? (
                        <div className="flex flex-col items-end">
                          <QtyInput
                            wide
                            value={editingQtyValue}
                            onChange={(v) => setEditingQtyValue(v)}
                            onExprCommit={(expr) => setEditingQtyFormula(expr)}
                          />
                          <div className="flex gap-1 mt-1">
                            <button type="button" onClick={() => saveInlineQty(entry)}
                              className="px-2 py-0.5 bg-green-600 text-white text-[10px] rounded font-semibold">💾</button>
                            <button type="button" onClick={() => setEditingQty(null)}
                              className="px-2 py-0.5 bg-gray-300 text-text-primary text-[10px] rounded font-semibold">✕</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="font-bold text-[13px] text-primary">
                            <span
                              className={entry.formula ? "cursor-pointer underline decoration-dotted" : ""}
                              onClick={() => { if (entry.formula) setShowFormula(showFormula === entry.rowId ? null : entry.rowId); }}
                            >
                              {entry.qty.toLocaleString()}
                            </span>
                            {entry.formula && <span className="ml-0.5 text-[9px] text-text-secondary">🧮</span>}
                            <button type="button" onClick={() => startInlineQtyEdit(entry)}
                              className="ml-1 text-[10px] text-text-secondary hover:text-primary" title="Edit qty">✏️</button>
                          </span>
                          {showFormula === entry.rowId && entry.formula && (
                            <div className="mt-0.5 bg-gray-800 text-white text-[10px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap inline-block">
                              {entry.formula}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Aksi */}
                    <div className="w-[88px] flex items-center justify-center gap-1 shrink-0">
                      <button onClick={() => handleEdit(entry)}
                        className="px-2 py-1 bg-primary text-white text-[10px] rounded font-medium hover:bg-primary-light transition">Edit</button>
                      <button onClick={() => handleDelete(entry)}
                        className="px-2 py-1 bg-red-500 text-white text-[10px] rounded font-medium hover:bg-red-600 transition">Hapus</button>
                    </div>
                  </div>

                  {/* Row 2: Location • Batch (compact subtitle) */}
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] text-text-secondary truncate">
                      📍 {entry.location}
                    </span>
                    <span className="text-[10px] text-text-secondary">•</span>
                    {editingBatch === entry.rowId ? (
                      <input
                        type="text"
                        value={editingBatchValue}
                        onChange={(e) => setEditingBatchValue(e.target.value)}
                        onBlur={() => saveInlineBatch(entry)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveInlineBatch(entry); }
                          if (e.key === "Escape") { setEditingBatch(null); }
                        }}
                        autoFocus
                        className="w-24 px-1 py-0 border border-primary rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    ) : (
                      <span
                        className="text-[10px] text-text-secondary cursor-pointer hover:text-primary transition inline-flex items-center gap-0.5"
                        onClick={() => startInlineBatchEdit(entry)}
                      >
                        🏷️ {entry.batch} <span className="text-[9px] opacity-60">✏️</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedEntry && (
        <EditModal
          entry={selectedEntry}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveEdit}
        />
      )}

      <BottomNav activePage="history" />
    </div>
  );
}
