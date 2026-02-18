"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import EditModal, { EditData } from "@/components/EditModal";
import LoadingSpinner from "@/components/LoadingSpinner";
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
                    <p className="text-[10px] text-text-secondary">
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
                            <td className="px-2 py-1 text-text-secondary whitespace-nowrap">{entry.batch}</td>
                            <td className="px-2 py-1 text-center font-semibold text-primary">{entry.qty}</td>
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
