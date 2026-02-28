"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import { getHistoryApi } from "@/lib/api";
import { HistoryEntry } from "@/lib/types";
import { getCache, setCache } from "@/lib/cache";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!user?.email) return;
    const ck = `history:${user.email}:all`;
    const cached = getCache<HistoryEntry[]>(ck);
    if (cached) setHistory(cached.data);
    getHistoryApi(user.email).then((res) => {
      if (res.success && res.history) {
        setHistory(res.history);
        setCache(ck, res.history);
      }
    }).catch(() => {});
  }, [user]);

  const stats = useMemo(() => {
    const locations = new Set(history.map((e) => e.location));
    const totalItems = history.reduce((sum, e) => sum + e.qty, 0);
    return {
      discan: locations.size,
      items: totalItems,
      progress: 0, // will be displayed based on known total
    };
  }, [history]);

  const initial = user?.name?.charAt(0)?.toUpperCase() || "U";

  return (
    <div className="min-h-screen pb-24 bg-[var(--primary-bg)]">
      {/* ── Profile Header ── */}
      <div className="bg-white pt-10 pb-6 px-5 text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-primary flex items-center justify-center mb-3 shadow-lg">
          <span className="text-3xl font-bold text-white">{initial}</span>
        </div>
        <h1 className="text-xl font-bold text-text-primary">{user?.name || "User"}</h1>
        <div className="flex items-center justify-center gap-1.5 mt-1.5 text-sm text-text-secondary">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <span>{user?.role || "Staff Gudang"}</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 mt-1 text-sm text-text-secondary">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span>{user?.email || "-"}</span>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="mx-4 -mt-0">
        <div className="bg-white rounded-2xl shadow-card mt-4 grid grid-cols-3 divide-x divide-border">
          <div className="py-4 text-center">
            <p className="text-xl font-bold text-text-primary">{stats.discan}</p>
            <p className="text-xs text-text-secondary mt-0.5">Discan</p>
          </div>
          <div className="py-4 text-center">
            <p className="text-xl font-bold text-text-primary">{stats.items.toLocaleString()}</p>
            <p className="text-xs text-text-secondary mt-0.5">Item</p>
          </div>
          <div className="py-4 text-center">
            <p className="text-xl font-bold text-primary">{stats.discan > 0 ? `${stats.discan}` : "0"}</p>
            <p className="text-xs text-text-secondary mt-0.5">Lokasi</p>
          </div>
        </div>
      </div>

      {/* ── Menu Items ── */}
      <div className="mx-4 mt-4">
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          {[
            { icon: "bell", label: "Notifikasi", disabled: true },
            { icon: "palette", label: "Tampilan", disabled: true },
            { icon: "shield", label: "Keamanan", disabled: true },
            { icon: "help", label: "Bantuan", disabled: true },
            { icon: "info", label: "Tentang Aplikasi", disabled: true },
          ].map((item, idx) => (
            <button
              key={item.label}
              className={`w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition ${
                idx < 4 ? "border-b border-border" : ""
              } ${item.disabled ? "opacity-60" : ""}`}
              disabled={item.disabled}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  {item.icon === "bell" && (
                    <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
                    </svg>
                  )}
                  {item.icon === "palette" && (
                    <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="8" r="1.5" fill="currentColor" /><circle cx="8" cy="12" r="1.5" fill="currentColor" /><circle cx="16" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="16" r="1.5" fill="currentColor" />
                    </svg>
                  )}
                  {item.icon === "shield" && (
                    <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  )}
                  {item.icon === "help" && (
                    <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
                    </svg>
                  )}
                  {item.icon === "info" && (
                    <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-medium text-text-primary">{item.label}</span>
              </div>
              <svg className="w-5 h-5 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* ── Logout Button ── */}
      <div className="mx-4 mt-6">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-50 text-red-500 rounded-2xl font-semibold text-sm hover:bg-red-100 transition active:scale-[0.98]"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Keluar dari Akun
        </button>
      </div>

      {/* ── Version ── */}
      <p className="text-center text-xs text-text-secondary mt-4 mb-2">BLP Stock Opname v1.0.0</p>

      <BottomNav activePage="profile" />
    </div>
  );
}
