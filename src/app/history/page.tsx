"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import EditModal, { EditData } from "@/components/EditModal";
import LoadingSpinner from "@/components/LoadingSpinner";
import { getHistoryApi, updateEntryApi, deleteEntryApi } from "@/lib/api";
import { HistoryEntry } from "@/lib/types";
import toast from "react-hot-toast";

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
    
    setLoading(true);
    try {
      const result = await getHistoryApi(
        user.email,
        filter === "all" ? undefined : filter
      );

      if (result.success && result.history) {
        setHistory(result.history);
      } else {
        toast.error(result.message || "Gagal mengambil riwayat");
      }
    } catch (error) {
      console.error("Fetch history error:", error);
      toast.error("Terjadi kesalahan saat mengambil riwayat");
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

    try {
      const result = await deleteEntryApi(entry.rowId);
      if (result.success) {
        toast.success("Entry berhasil dihapus");
        fetchHistory();
      } else {
        toast.error(result.message || "Gagal menghapus entry");
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Terjadi kesalahan saat menghapus");
    }
  };

  const handleSaveEdit = async (data: EditData) => {
    if (!selectedEntry) return;

    try {
      const editTimestamp = new Date().toISOString();
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

      if (result.success) {
        toast.success("Berhasil mengupdate entry");
        setIsModalOpen(false);
        fetchHistory();
      } else {
        toast.error(result.message || "Gagal mengupdate");
      }
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Terjadi kesalahan saat mengupdate");
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
        <h1 className="text-2xl font-bold mb-1">Riwayat Stock Opname</h1>
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
                  <div className="bg-primary-pale px-4 py-3 border-b border-border">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-text-primary text-sm">
                          {firstEntry.location} • {formatDate(firstEntry.timestamp)}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {sessionId} • {entries.length} produk • {totalItems} item
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Table header */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-border">
                          <th className="text-left px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">Produk</th>
                          <th className="text-left px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">SKU</th>
                          <th className="text-left px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">Batch</th>
                          <th className="text-center px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">Qty</th>
                          <th className="text-center px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {entries.map((entry) => (
                          <tr key={entry.rowId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-text-primary">
                              <span className="font-medium">{entry.productName}</span>
                              {entry.edited === "Yes" && (
                                <span className="ml-1 text-xs text-orange-500" title={`Diedit: ${entry.editTimestamp}`}>✏️</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{entry.sku}</td>
                            <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{entry.batch}</td>
                            <td className="px-3 py-2 text-center font-semibold text-primary">{entry.qty}</td>
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleEdit(entry)}
                                  className="px-2 py-1 bg-primary text-white text-xs rounded hover:bg-primary-light transition"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(entry)}
                                  className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition"
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
