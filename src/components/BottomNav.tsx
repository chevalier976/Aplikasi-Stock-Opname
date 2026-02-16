"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";

interface BottomNavProps {
  activePage: "scan" | "history";
}

export default function BottomNav({ activePage }: BottomNavProps) {
  const { logout } = useAuth();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-lg">
      <div className="flex justify-around items-center h-16">
        <Link
          href="/scan"
          className={`flex flex-col items-center justify-center flex-1 h-full ${
            activePage === "scan"
              ? "text-primary border-t-2 border-primary"
              : "text-text-secondary"
          }`}
        >
          <svg
            className="w-6 h-6 mb-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
            />
          </svg>
          <span className="text-xs">Scan</span>
        </Link>

        <Link
          href="/history"
          className={`flex flex-col items-center justify-center flex-1 h-full ${
            activePage === "history"
              ? "text-primary border-t-2 border-primary"
              : "text-text-secondary"
          }`}
        >
          <svg
            className="w-6 h-6 mb-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-xs">Riwayat</span>
        </Link>

        <button
          onClick={logout}
          className="flex flex-col items-center justify-center flex-1 h-full text-text-secondary"
        >
          <svg
            className="w-6 h-6 mb-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          <span className="text-xs">Logout</span>
        </button>
      </div>
    </nav>
  );
}
