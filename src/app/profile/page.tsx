"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import { getHistoryApi, getAllLocationsApi } from "@/lib/api";
import { HistoryEntry } from "@/lib/types";
import { getCache, setCache } from "@/lib/cache";

type LocationResult = { locationCode: string; productCount: number };

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [allLocations, setAllLocations] = useState<LocationResult[]>([]);

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

    // Load all locations for progress calculation
    const cachedLoc = getCache<LocationResult[]>("allLocations");
    if (cachedLoc) setAllLocations(cachedLoc.data);
    getAllLocationsApi().then((res) => {
      if (res.success && res.locations) {
        setAllLocations(res.locations);
        setCache("allLocations", res.locations);
      }
    }).catch(() => {});
  }, [user]);

  const stats = useMemo(() => {
    const locations = new Set(history.map((e) => e.location));
    const totalItems = history.reduce((sum, e) => sum + e.qty, 0);
    const totalEntries = history.length;
    return {
      discan: locations.size,
      items: totalItems,
      entries: totalEntries,
    };
  }, [history]);

  // ── Location group progress (CEN/PARAS, CEN/PAYU, etc.) ──
  const locationGroups = useMemo(() => {
    // Detect groups from allLocations (prefix before last slash segment)
    const groupMap = new Map<string, { total: number; scanned: number; inputCount: number; totalQty: number }>();

    // Count total locations per group
    allLocations.forEach((loc) => {
      // Extract group prefix: "CEN/PARAS/001" → "CEN/PARAS"
      const parts = loc.locationCode.split("/");
      const prefix = parts.length >= 2 ? parts.slice(0, 2).join("/") : parts[0];
      const existing = groupMap.get(prefix);
      if (!existing) {
        groupMap.set(prefix, { total: 1, scanned: 0, inputCount: 0, totalQty: 0 });
      } else {
        existing.total += 1;
      }
    });

    // Count scanned locations, input entries, and qty per group from history
    const scannedPerGroup = new Map<string, Set<string>>();
    history.forEach((e) => {
      const parts = e.location.split("/");
      const prefix = parts.length >= 2 ? parts.slice(0, 2).join("/") : parts[0];

      if (!scannedPerGroup.has(prefix)) scannedPerGroup.set(prefix, new Set());
      scannedPerGroup.get(prefix)!.add(e.location);

      const group = groupMap.get(prefix);
      if (group) {
        group.inputCount += 1;
        group.totalQty += e.qty;
      } else {
        groupMap.set(prefix, { total: 0, scanned: 0, inputCount: 1, totalQty: e.qty });
      }
    });

    // Update scanned counts
    scannedPerGroup.forEach((locations, prefix) => {
      const group = groupMap.get(prefix);
      if (group) group.scanned = locations.size;
    });

    return Array.from(groupMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [history, allLocations]);

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
      <div className="mx-4 mt-4">
        <div className="bg-white rounded-2xl shadow-card grid grid-cols-3 divide-x divide-border">
          <div className="py-4 text-center">
            <p className="text-xl font-bold text-primary">{stats.discan}</p>
            <p className="text-[11px] text-text-secondary mt-0.5">Lokasi Discan</p>
          </div>
          <div className="py-4 text-center">
            <p className="text-xl font-bold text-text-primary">{stats.entries.toLocaleString()}</p>
            <p className="text-[11px] text-text-secondary mt-0.5">Produk Diinput</p>
          </div>
          <div className="py-4 text-center">
            <p className="text-xl font-bold text-accent-yellow">{stats.items.toLocaleString()}</p>
            <p className="text-[11px] text-text-secondary mt-0.5">Total Item</p>
          </div>
        </div>
      </div>

      {/* ── Location Group Progress ── */}
      {locationGroups.length > 0 && (
        <div className="mx-4 mt-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary px-1">Progress per Area</h2>
          {locationGroups.map((group) => {
            const pct = group.total > 0 ? Math.round((group.scanned / group.total) * 100) : 0;
            return (
              <div key={group.name} className="bg-white rounded-2xl shadow-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">{group.name}</p>
                      <p className="text-[11px] text-text-secondary">{group.scanned} / {group.total} lokasi discan</p>
                    </div>
                  </div>
                  <span className={`text-lg font-bold ${pct === 100 ? "text-primary" : pct > 0 ? "text-accent-yellow" : "text-text-secondary"}`}>
                    {pct}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? "bg-primary" : "bg-accent-yellow"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {/* Detail stats */}
                <div className="flex items-center gap-4 mt-2.5 text-[11px] text-text-secondary">
                  <span>Produk diinput: <strong className="text-text-primary">{group.inputCount.toLocaleString()}</strong></span>
                  <span>Total item: <strong className="text-text-primary">{group.totalQty.toLocaleString()}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Info Card ── */}
      <div className="mx-4 mt-4">
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Tentang Aplikasi</p>
              <p className="text-xs text-text-secondary">BLP Stock Opname v1.0.0</p>
            </div>
          </div>
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
