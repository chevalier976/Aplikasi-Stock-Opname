"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import EditModal, { EditData } from "@/components/EditModal";
import LoadingSpinner from "@/components/LoadingSpinner";
import QtyInput from "@/components/QtyInput";
import { getHistoryApi, updateEntryApi, deleteEntryApi } from "@/lib/api";
import { HistoryEntry } from "@/lib/types";
import { getCache, setCache, clearCache } from "@/lib/cache";
import toast from "react-hot-toast";
import BrandBLP from "@/components/BrandBLP";

export default function HistoryPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showFormula, setShowFormula] = useState<string | null>(null);

  // Inline edit state
  const [editingBatch, setEditingBatch] = useState<string | null>(null);
  const [editingBatchValue, setEditingBatchValue] = useState("");
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState(0);
  const [editingQtyFormula, setEditingQtyFormula] = useState("");

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, user]);

  const fetchHistory = async () => {
    if (!user) return;

    const ck = `history:${user.email}:${filter}`;

    // AppSheet-style: show cached data INSTANTLY
    const cached = getCache<HistoryEntry[]>(ck);
    if (cached) {
      setHistory(cached.data);
      setLoading(false); // UI langsung tampil!
    }

    // Background refresh (stale-while-revalidate)
    try {
      const result = await getHistoryApi(
        user.email,
        filter === "all" ? undefined : filter
      );

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

    const ck = `history:${user?.email}:${filter}`;
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

    const ck = `history:${user?.email}:${filter}`;
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

    const ck = `history:${user?.email}:${filter}`;
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

    const ck = `history:${user?.email}:${filter}`;
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

  const groupBySession = (entries: HistoryEntry[]) => {
    const grouped: Record<string, HistoryEntry[]> = {};
    entries.forEach((entry) => {
      if (!grouped[entry.sessionId]) {
        grouped[entry.sessionId] = [];
      }
      grouped[entry.sessionId].push(entry);
    });
    return grouped;
  };

  const formatDate = (raw: string) => {
    try {
      // If already formatted like "16 Feb 2026 18:28", return as-is
      if (!/\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
      const d = new Date(raw);
      const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
      const dd = String(d.getDate()).padStart(2, "0");
      const mmm = months[d.getMonth()];
      const yyyy = d.getFullYear();
      return `${dd} ${mmm} ${yyyy}`;
    } catch {
      return raw;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pb-20">
        <LoadingSpinner />
      </div>
    );
  }

  const groupedHistory = groupBySession(history);

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-primary text-white p-6 shadow-md">
        <div className="mb-1"><BrandBLP className="text-white text-2xl" /></div>
        <h1 className="text-xl font-bold mb-1">Riwayat Stock Opname</h1>
        <p className="text-primary-pale">{user?.name || "User"}</p>
      </div>

      <div className="p-4">
        <div className="mb-4">
          <label className="block text-sm font-semibold text-text-primary mb-2">
            Filter:
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">Semua</option>
            <option value="today">Hari Ini</option>
            <option value="week">Minggu Ini</option>
            <option value="month">Bulan Ini</option>
          </select>
        </div>

        {history.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center">
            <p className="text-text-secondary">Belum ada riwayat</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedHistory).map(([sessionId, entries]) => {
              const firstEntry = entries[0];
              const totalItems = entries.reduce((sum, e) => sum + e.qty, 0);

              return (
                <div
                  key={sessionId}
                  className="bg-white rounded-lg shadow-md overflow-hidden"
                >
                  <div className="bg-primary-pale px-3 py-2 border-b border-border">
                    <p className="font-semibold text-text-primary text-xs">
                      {firstEntry.location} • {formatDate(firstEntry.timestamp)}
                    </p>
                    <p className="text-[10px] text-text-secondary truncate">
                      {sessionId} • {entries.length} produk • {totalItems} item
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-border">
                          <th className="text-left px-2 py-1 font-semibold text-text-secondary whitespace-nowrap">Produk</th>
                          <th className="text-left px-2 py-1 font-semibold text-text-secondary whitespace-nowrap">SKU</th>
                          <th className="text-left px-2 py-1 font-semibold text-text-secondary whitespace-nowrap">Batch</th>
                          <th className="text-center px-2 py-1 font-semibold text-text-secondary whitespace-nowrap">Qty</th>
                          <th className="text-center px-1 py-1 font-semibold text-text-secondary whitespace-nowrap">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {entries.map((entry) => (
                          <tr key={entry.rowId} className="hover:bg-gray-50">
                            <td className="px-2 py-1 text-text-primary">
                              <span className="break-words font-medium text-[11px] leading-tight">{entry.productName}</span>
                              {entry.edited === "Yes" && (
                                <span className="ml-0.5 text-[10px] text-orange-500" title={`Diedit: ${entry.editTimestamp}`}>✏️</span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-text-secondary whitespace-nowrap">{entry.sku}</td>
                            <td className="px-2 py-1 text-text-secondary whitespace-nowrap">
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
                                  className="w-20 px-1 py-0.5 border border-primary rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              ) : (
                                <span className="inline-flex items-center gap-0.5">
                                  {entry.batch}
                                  <button
                                    type="button"
                                    onClick={() => startInlineBatchEdit(entry)}
                                    className="text-[10px] text-text-secondary hover:text-primary transition opacity-60 hover:opacity-100"
                                    title="Edit batch"
                                  >
                                    ✏️
                                  </button>
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-center font-semibold text-primary relative">
                              {editingQty === entry.rowId ? (
                                <div className="flex flex-col items-center">
                                  <QtyInput
                                    wide
                                    value={editingQtyValue}
                                    onChange={(v) => setEditingQtyValue(v)}
                                    onExprCommit={(expr) => setEditingQtyFormula(expr)}
                                  />
                                  <div className="flex gap-1 mt-1">
                                    <button
                                      type="button"
                                      onClick={() => saveInlineQty(entry)}
                                      className="px-2 py-0.5 bg-green-600 text-white text-[10px] rounded font-semibold hover:bg-green-700 transition"
                                    >
                                      💾
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingQty(null)}
                                      className="px-2 py-0.5 bg-gray-300 text-text-primary text-[10px] rounded font-semibold hover:bg-gray-400 transition"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="inline-flex items-center justify-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => entry.formula ? setShowFormula(showFormula === entry.rowId ? null : entry.rowId) : null}
                                    className={entry.formula ? "underline decoration-dotted cursor-pointer" : ""}
                                  >
                                    {entry.qty}
                                    {entry.formula && <span className="ml-0.5 text-[9px] text-text-secondary no-underline">🧮</span>}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startInlineQtyEdit(entry)}
                                    className="text-[10px] text-text-secondary hover:text-primary transition opacity-60 hover:opacity-100"
                                    title="Edit qty"
                                  >
                                    ✏️
                                  </button>
                                  {showFormula === entry.rowId && entry.formula && (
                                    <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-800 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                                      {entry.formula}
                                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                                    </div>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-1 py-1 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-0.5">
                                <button
                                  onClick={() => handleEdit(entry)}
                                  className="px-1.5 py-0.5 bg-primary text-white text-[10px] rounded hover:bg-primary-light transition"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(entry)}
                                  className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded hover:bg-red-600 transition"
                                >
                                  Hapus
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
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
