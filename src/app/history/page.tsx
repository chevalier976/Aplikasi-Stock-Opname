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

  // Inline batch edit state
  const [editingBatch, setEditingBatch] = useState<string | null>(null);
  const [editingBatchValue, setEditingBatchValue] = useState("");

  // Batch edit state
  const [batchEditSession, setBatchEditSession] = useState<string | null>(null);
  const [batchQty, setBatchQty] = useState<Record<string, number>>({});
  const [batchFormulas, setBatchFormulas] = useState<Record<string, string>>({});
  const [batchSaving, setBatchSaving] = useState(false);

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

  // ── Inline batch edit handler ──

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

  // ── Batch Edit handlers ──

  const startBatchEdit = (sessionId: string, entries: HistoryEntry[]) => {
    const qtyMap: Record<string, number> = {};
    const formulaMap: Record<string, string> = {};
    entries.forEach((e) => {
      qtyMap[e.rowId] = e.qty;
      formulaMap[e.rowId] = e.formula || "";
    });
    setBatchQty(qtyMap);
    setBatchFormulas(formulaMap);
    setBatchEditSession(sessionId);
  };

  const cancelBatchEdit = () => {
    setBatchEditSession(null);
    setBatchQty({});
    setBatchFormulas({});
  };

  const handleBatchQtyChange = (rowId: string, qty: number) => {
    setBatchQty((prev) => ({ ...prev, [rowId]: qty }));
  };

  const handleBatchExprCommit = (rowId: string, expr: string) => {
    setBatchFormulas((prev) => ({ ...prev, [rowId]: expr }));
  };

  const saveBatchEdit = async () => {
    if (!batchEditSession) return;

    // Find entries that changed
    const sessionEntries = history.filter((e) => e.sessionId === batchEditSession);
    const changedEntries = sessionEntries.filter(
      (e) => batchQty[e.rowId] !== undefined && batchQty[e.rowId] !== e.qty
    );

    if (changedEntries.length === 0) {
      toast("Tidak ada perubahan qty", { icon: "ℹ️" });
      cancelBatchEdit();
      return;
    }

    setBatchSaving(true);
    const editTimestamp = new Date().toISOString();
    const prev = [...history];

    // Optimistic: update UI immediately
    const updated = history.map((e) => {
      if (e.sessionId === batchEditSession && batchQty[e.rowId] !== undefined) {
        return {
          ...e,
          qty: batchQty[e.rowId],
          formula: batchFormulas[e.rowId] || e.formula,
          edited: batchQty[e.rowId] !== e.qty ? "Yes" : e.edited,
          editTimestamp: batchQty[e.rowId] !== e.qty ? editTimestamp : e.editTimestamp,
        };
      }
      return e;
    });
    setHistory(updated);

    const ck = `history:${user?.email}:${filter}`;
    setCache(ck, updated);
    toast.success(`${changedEntries.length} entry berhasil diupdate`);

    // Background sync: send all changes to server
    let hasError = false;
    for (const entry of changedEntries) {
      try {
        const result = await updateEntryApi(
          entry.rowId,
          entry.sessionId,
          batchQty[entry.rowId],
          editTimestamp,
          {
            formula: batchFormulas[entry.rowId] || "",
          }
        );
        if (!result.success) {
          hasError = true;
          console.error(`Failed to update ${entry.rowId}:`, result.message);
        }
      } catch (error) {
        hasError = true;
        console.error(`Error updating ${entry.rowId}:`, error);
      }
    }

    if (hasError) {
      setHistory(prev);
      setCache(ck, prev);
      toast.error("Sebagian update gagal, data dikembalikan");
    }

    setBatchSaving(false);
    cancelBatchEdit();
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
              const isBatchEditing = batchEditSession === sessionId;
              const batchTotalItems = isBatchEditing
                ? Object.values(batchQty).reduce((sum, q) => sum + q, 0)
                : entries.reduce((sum, e) => sum + e.qty, 0);

              return (
                <div
                  key={sessionId}
                  className={`bg-white rounded-lg shadow-md overflow-hidden ${isBatchEditing ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="bg-primary-pale px-3 py-2 border-b border-border flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-text-primary text-xs">
                        {firstEntry.location} • {formatDate(firstEntry.timestamp)}
                      </p>
                      <p className="text-[10px] text-text-secondary truncate">
                        {sessionId} • {entries.length} produk • {batchTotalItems} item
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {!isBatchEditing ? (
                        <button
                          onClick={() => startBatchEdit(sessionId, entries)}
                          disabled={batchEditSession !== null && !isBatchEditing}
                          className="px-2 py-1 bg-primary text-white text-[10px] rounded font-semibold hover:bg-primary-light transition disabled:opacity-40 whitespace-nowrap"
                          title="Edit semua qty sekaligus"
                        >
                          ✏️ Batch Edit
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={saveBatchEdit}
                            disabled={batchSaving}
                            className="px-2 py-1 bg-green-600 text-white text-[10px] rounded font-semibold hover:bg-green-700 transition disabled:opacity-50 whitespace-nowrap"
                          >
                            {batchSaving ? "..." : "💾 Simpan"}
                          </button>
                          <button
                            onClick={cancelBatchEdit}
                            disabled={batchSaving}
                            className="px-2 py-1 bg-gray-400 text-white text-[10px] rounded font-semibold hover:bg-gray-500 transition disabled:opacity-50"
                          >
                            Batal
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {isBatchEditing && (
                    <div className="bg-blue-50 px-3 py-1 border-b border-border">
                      <p className="text-[10px] text-primary">💡 Qty bisa pakai rumus: 10+5, 400-100, 10x10+5 — Klik &quot;Simpan&quot; untuk menyimpan</p>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-border">
                          <th className="text-left px-2 py-1 font-semibold text-text-secondary whitespace-nowrap">Produk</th>
                          <th className="text-left px-2 py-1 font-semibold text-text-secondary whitespace-nowrap">SKU</th>
                          <th className="text-left px-2 py-1 font-semibold text-text-secondary whitespace-nowrap">Batch</th>
                          <th className="text-center px-2 py-1 font-semibold text-text-secondary whitespace-nowrap">Qty</th>
                          {!isBatchEditing && (
                            <th className="text-center px-1 py-1 font-semibold text-text-secondary whitespace-nowrap">Aksi</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {entries.map((entry) => (
                          <tr key={entry.rowId} className={`hover:bg-gray-50 ${isBatchEditing && batchQty[entry.rowId] !== entry.qty ? "bg-yellow-50" : ""}`}>
                            <td className="px-2 py-1 text-text-primary">
                              <span className="break-words font-medium text-[11px] leading-tight">{entry.productName}</span>
                              {entry.edited === "Yes" && !isBatchEditing && (
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
                                  {!isBatchEditing && (
                                    <button
                                      type="button"
                                      onClick={() => startInlineBatchEdit(entry)}
                                      className="text-[10px] text-text-secondary hover:text-primary transition opacity-60 hover:opacity-100"
                                      title="Edit batch"
                                    >
                                      ✏️
                                    </button>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-center font-semibold text-primary relative">
                              {isBatchEditing ? (
                                <QtyInput
                                  wide
                                  value={batchQty[entry.rowId] ?? entry.qty}
                                  onChange={(v) => handleBatchQtyChange(entry.rowId, v)}
                                  onExprCommit={(expr) => handleBatchExprCommit(entry.rowId, expr)}
                                />
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => entry.formula ? setShowFormula(showFormula === entry.rowId ? null : entry.rowId) : null}
                                    className={entry.formula ? "underline decoration-dotted cursor-pointer" : ""}
                                  >
                                    {entry.qty}
                                    {entry.formula && <span className="ml-0.5 text-[9px] text-text-secondary no-underline">🧮</span>}
                                  </button>
                                  {showFormula === entry.rowId && entry.formula && (
                                    <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-800 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                                      {entry.formula}
                                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                            {!isBatchEditing && (
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
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Batch edit footer */}
                  {isBatchEditing && (
                    <div className="bg-gray-50 px-3 py-2 border-t border-border flex items-center justify-between">
                      <p className="text-[10px] text-text-secondary">
                        {Object.entries(batchQty).filter(([rowId]) => {
                          const original = entries.find((e) => e.rowId === rowId);
                          return original && batchQty[rowId] !== original.qty;
                        }).length} perubahan
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={cancelBatchEdit}
                          disabled={batchSaving}
                          className="px-3 py-1.5 bg-gray-200 text-text-primary text-xs rounded-lg font-semibold hover:bg-gray-300 transition disabled:opacity-50"
                        >
                          Batal
                        </button>
                        <button
                          onClick={saveBatchEdit}
                          disabled={batchSaving}
                          className="px-3 py-1.5 bg-primary text-white text-xs rounded-lg font-semibold hover:bg-primary-light transition disabled:opacity-50"
                        >
                          {batchSaving ? "Menyimpan..." : "💾 Simpan Semua"}
                        </button>
                      </div>
                    </div>
                  )}
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
