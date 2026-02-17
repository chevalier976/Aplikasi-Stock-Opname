"use client";

import { useState, useEffect } from "react";
import { HistoryEntry, Product } from "@/lib/types";
import { lookupBarcodeApi, searchProductsApi, warmupCacheApi } from "@/lib/api";
import BarcodeScanner from "./BarcodeScanner";

export interface EditData {
  newQty: number;
  productName: string;
  sku: string;
  batch: string;
}

interface EditModalProps {
  entry: HistoryEntry;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EditData) => void;
}

export default function EditModal({
  entry,
  isOpen,
  onClose,
  onSave,
}: EditModalProps) {
  const [quantity, setQuantity] = useState(entry.qty);
  const [productName, setProductName] = useState(entry.productName);
  const [sku, setSku] = useState(entry.sku);
  const [batch, setBatch] = useState(entry.batch);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTimer, setSearchTimer] = useState<NodeJS.Timeout | null>(null);
  const [barcode, setBarcode] = useState("");
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [scanningBarcode, setScanningBarcode] = useState(false);

  useEffect(() => {
    setQuantity(entry.qty);
    setProductName(entry.productName);
    setSku(entry.sku);
    setBatch(entry.batch);
    setBarcode("");
    setShowBarcodeScanner(false);
    warmupCacheApi().catch(() => {});
  }, [entry]);

  if (!isOpen) return null;

  const handleProductSearch = (value: string) => {
    setProductName(value);
    if (value.trim().length >= 1) {
      warmupCacheApi({ productQuery: value.trim() }).catch(() => {});
    }
    if (searchTimer) clearTimeout(searchTimer);
    if (value.trim().length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await searchProductsApi(value.trim());
        if (result.success && result.products) {
          setSearchResults(result.products);
          setShowSuggestions(result.products.length > 0);
        }
      } catch (error) {
        console.error("Search error:", error);
      }
    }, 180);
    setSearchTimer(timer);
  };

  const handleSelectProduct = (product: Product) => {
    setProductName(product.productName);
    setSku(product.sku);
    setBatch(product.batch);
    setShowSuggestions(false);
    setSearchResults([]);
  };

  const handleBarcodeScan = async (barcodeValue: string) => {
    const normalized = String(barcodeValue || "").trim();
    if (!normalized) return;

    setBarcode(normalized);
    setShowBarcodeScanner(false);
    setScanningBarcode(true);
    try {
      const result = await lookupBarcodeApi(normalized);
      if (result.success && result.product) {
        setProductName(result.product.productName);
        setSku(result.product.sku);
        setBatch(result.product.batch || "");
      }
    } catch (error) {
      console.error("Barcode lookup error:", error);
    } finally {
      setScanningBarcode(false);
    }
  };

  const handleSave = () => {
    if (quantity < 0) return;
    onSave({ newQty: quantity, productName, sku, batch });
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-semibold text-text-primary mb-4">
          Edit Entry
        </h2>

        <div className="mb-3">
          <p className="text-sm text-text-secondary">
            <span className="font-semibold">Lokasi:</span> {entry.location}
          </p>
        </div>

        <div className="mb-4 space-y-3">
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-1">
              Barcode
            </label>
            <div className="relative">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                <path d="M7 12h10" />
                <path d="M7 9h2M11 9h2M15 9h2M7 15h2M11 15h2M15 15h2" />
              </svg>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && barcode) {
                    e.preventDefault();
                    handleBarcodeScan(barcode);
                  }
                }}
                className="w-full pl-11 pr-24 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-gray-50"
                placeholder="Scan / ketik barcode"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleBarcodeScan(barcode)}
                  disabled={!barcode || scanningBarcode}
                  className="w-9 h-9 rounded-lg border border-border bg-white flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  title="Cari barcode"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setShowBarcodeScanner(true)}
                  disabled={scanningBarcode}
                  className="w-9 h-9 rounded-lg border border-border bg-white flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  title="Scan barcode"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                    <path d="M7 12h10" />
                    <path d="M7 9h2M11 9h2M15 9h2M7 15h2M11 15h2M15 15h2" />
                  </svg>
                </button>
              </div>
            </div>
            {scanningBarcode && (
              <p className="text-xs text-text-secondary mt-1">Mencari data produk...</p>
            )}
          </div>

          <div className="relative">
            <label className="block text-sm font-semibold text-text-primary mb-1">
              Nama Produk:
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => handleProductSearch(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setShowSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Ketik min. 2 huruf untuk cari..."
              autoComplete="off"
            />
            {showSuggestions && searchResults.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {searchResults.map((p, idx) => (
                  <button
                    key={`${p.sku}-${idx}`}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-primary-pale transition border-b border-border last:border-b-0"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectProduct(p)}
                  >
                    <p className="font-medium text-text-primary text-sm">{p.productName}</p>
                    <p className="text-xs text-text-secondary">SKU: {p.sku} | Batch: {p.batch}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-primary mb-1">
              SKU:
            </label>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-primary mb-1">
              Batch:
            </label>
            <input
              type="text"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-primary mb-1">
              Quantity:
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
              className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              min="0"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-200 text-text-primary rounded-lg hover:bg-gray-300 transition"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-light transition"
          >
            Simpan
          </button>
        </div>

        {showBarcodeScanner && (
          <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl p-4 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-text-primary">Scan Barcode Produk</h3>
                <button
                  onClick={() => setShowBarcodeScanner(false)}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
                >
                  ✕
                </button>
              </div>
              <BarcodeScanner onScan={handleBarcodeScan} active={showBarcodeScanner} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
