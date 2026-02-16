"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import EditModal from "@/components/EditModal";
import LoadingSpinner from "@/components/LoadingSpinner";
import { getHistoryApi, updateEntryApi } from "@/lib/api";
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
  }, [filter]);

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

  const handleSaveEdit = async (newQty: number) => {
    if (!selectedEntry) return;

    try {
      const editTimestamp = new Date().toISOString();
      const result = await updateEntryApi(
        selectedEntry.rowId,
        selectedEntry.sessionId,
        newQty,
        editTimestamp
      );

      if (result.success) {
        toast.success("Berhasil mengupdate quantity");
        setIsModalOpen(false);
        fetchHistory(); // Refresh history
      } else {
        toast.error(result.message || "Gagal mengupdate");
      }
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Terjadi kesalahan saat mengupdate");
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
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
                  <div className="bg-primary-pale p-4 border-b border-border">
                    <p className="font-semibold text-text-primary">
                      Lokasi: {firstEntry.location}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {formatDate(firstEntry.timestamp)}
                    </p>
                    <p className="text-sm text-text-secondary">
                      Total: {entries.length} produk, {totalItems} item
                    </p>
                  </div>

                  <div className="divide-y divide-border">
                    {entries.map((entry) => (
                      <div key={entry.rowId} className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="font-semibold text-text-primary">
                              {entry.productName}
                            </h3>
                            <p className="text-sm text-text-secondary">
                              SKU: {entry.sku} | Batch: {entry.batch}
                            </p>
                            <p className="text-sm font-semibold text-primary mt-1">
                              Qty: {entry.qty}
                            </p>
                            {entry.edited === "Yes" && (
                              <p className="text-xs text-warning-text mt-1">
                                ✏️ Diedit: {formatDate(entry.editTimestamp)}
                              </p>
                            )}
                          </div>

                          <button
                            onClick={() => handleEdit(entry)}
                            className="ml-4 px-3 py-1 bg-primary text-white text-sm rounded hover:bg-primary-light transition"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
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
