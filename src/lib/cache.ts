/**
 * AppSheet-style Local Cache Layer
 * 
 * Prinsip kerja AppSheet:
 * 1. Data disimpan di device → UI baca dari cache lokal (INSTAN)
 * 2. Fetch data baru di background → update silently
 * 3. Write operations: update UI dulu → sync ke server di background
 * 4. Jika server gagal → revert ke state sebelumnya
 */

const PREFIX = "so:";

function safe<T>(fn: () => T, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Get cached data with its age in seconds */
export function getCache<T>(key: string): { data: T; age: number } | null {
  return safe(() => {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { d, t } = JSON.parse(raw);
    return { data: d as T, age: (Date.now() - t) / 1000 };
  }, null);
}

/** Store data in local cache */
export function setCache<T>(key: string, data: T): void {
  safe(() => {
    localStorage.setItem(PREFIX + key, JSON.stringify({ d: data, t: Date.now() }));
  }, undefined);
}

/** Clear cache entries by prefix */
export function clearCache(prefix?: string): void {
  safe(() => {
    const fp = PREFIX + (prefix || "");
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(fp)) localStorage.removeItem(k);
    }
  }, undefined);
}
