"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import BarcodeScanner from "@/components/BarcodeScanner";
import QtyInput from "@/components/QtyInput";
import { calcExpr } from "@/components/QtyInput";
import { getProductsApi, saveStockOpnameApi, deleteProductApi, lookupBarcodeApi, searchProductsApi, warmupCacheApi, preloadHistory, getAllProductsApi, invalidateMemCache } from "@/lib/api";
import { Product } from "@/lib/types";
import { getCache, setCache, clearCache } from "@/lib/cache";
import toast from "react-hot-toast";

function InputPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const location = searchParams.get("location") || "";

  const [products, setProducts] = useState<Product[]>([]);
  const [newProducts, setNewProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [formulas, setFormulas] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    productName: "",
    sku: "",
    batch: "",
    barcode: "",
    qty: 0,
  });
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTimer, setSearchTimer] = useState<NodeJS.Timeout | null>(null);
  const [newProductFormula, setNewProductFormula] = useState("");
  // Inline batch editing
  const [editingBatchKey, setEditingBatchKey] = useState<string | null>(null);
  const [editingBatchValue, setEditingBatchValue] = useState("");
  // All products cached locally for instant client-side search
  const allProductsRef = useRef<Product[] | null>(null);

  useEffect(() => {
    warmupCacheApi().catch(() => {});
    // Preload history for instant tab switch
    if (user?.email) preloadHistory(user.email);
    // Load all products for instant client-side search
    const loadAllProducts = async () => {
      const cached = getCache<Product[]>("allProducts");
      if (cached && cached.age < 120) {
        allProductsRef.current = cached.data;
      }
      try {
        const result = await getAllProductsApi();
        if (result.success && result.products) {
          allProductsRef.current = result.products;
          setCache("allProducts", result.products);
        }
      } catch {
        // Fall back to server-side search
      }
    };
    loadAllProducts();
  }, [user]);

  useEffect(() => {
    if (!location) {
      router.push("/scan");
      return;
    }

    fetchProducts();
  }, [location, router]);

  const fetchProducts = async () => {
    const ck = `products:${location}`;

    // AppSheet-style: show cached products INSTANTLY
    const cached = getCache<Product[]>(ck);
    if (cached) {
      setProducts(cached.data);
      const init: Record<string, number> = {};
      cached.data.forEach((p) => (init[p.sku] = 0));
      setQuantities(init);
      setLoading(false); // UI langsung tampil!
    }

    // Background refresh
    try {
      const result = await getProductsApi(location);
      if (result.success && result.products) {
        setProducts(result.products);
        setCache(ck, result.products);
        // Only set qty for NEW products (don't overwrite user input)
        setQuantities((prev) => {
          const next = { ...prev };
          result.products!.forEach((p) => {
            if (next[p.sku] === undefined) next[p.sku] = 0;
          });
          return next;
        });
      } else if (!cached) {
        toast.error(result.message || "Gagal mengambil data produk");
        router.push("/scan");
      }
    } catch (error) {
      console.error("Fetch products error:", error);
      if (!cached) {
        toast.error("Terjadi kesalahan saat mengambil data produk");
        router.push("/scan");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (sku: string, qty: number) => {
    setQuantities((prev) => ({
      ...prev,
      [sku]: qty,
    }));
  };

  const handleExprCommit = (sku: string, expr: string) => {
    setFormulas((prev) => ({
      ...prev,
      [sku]: expr,
    }));
  };

  const handleDeleteProduct = async (sku: string) => {
    const confirmDelete = window.confirm(
      "Hapus produk ini dari lokasi? Data juga akan dihapus dari Master Data."
    );
    if (!confirmDelete) return;

    // AppSheet-style: optimistic delete
    const prevProducts = [...products];
    const prevNewProducts = [...newProducts];
    const prevQuantities = { ...quantities };

    setProducts((prev) => prev.filter((p) => p.sku !== sku));
    setNewProducts((prev) => prev.filter((p) => p.sku !== sku));
    setQuantities((prev) => {
      const copy = { ...prev };
      delete copy[sku];
      return copy;
    });
    toast.success("Produk berhasil dihapus");

    // Update product cache
    const ck = `products:${location}`;
    setCache(ck, products.filter((p) => p.sku !== sku));
    clearCache("history:"); // invalidate history cache

    // Background sync
    try {
      const result = await deleteProductApi(location, sku);
      if (!result.success) {
        setProducts(prevProducts);
        setNewProducts(prevNewProducts);
        setQuantities(prevQuantities);
        setCache(ck, prevProducts);
        toast.error(result.message || "Gagal menghapus, data dikembalikan");
      }
    } catch (error) {
      console.error("Delete error:", error);
      setProducts(prevProducts);
      setNewProducts(prevNewProducts);
      setQuantities(prevQuantities);
      setCache(ck, prevProducts);
      toast.error("Gagal menghapus, data dikembalikan");
    }
  };

  const handleDeleteNewProduct = (sku: string) => {
    setNewProducts((prev) => prev.filter((p) => p.sku !== sku));
    setQuantities((prev) => {
      const copy = { ...prev };
      delete copy[sku];
      return copy;
    });
    toast.success("Produk baru dihapus dari daftar");
  };

  const handleProductNameSearch = (value: string) => {
    setNewProductForm((prev) => ({ ...prev, productName: value }));
    
    if (searchTimer) clearTimeout(searchTimer);
    
    if (value.trim().length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }

    // CLIENT-SIDE filtering if we have all products (INSTANT — 0ms)
    if (allProductsRef.current) {
      const q = value.trim().toLowerCase();
      const filtered = allProductsRef.current
        .filter((p) => p.productName.toLowerCase().includes(q))
        .slice(0, 10);
      setSearchResults(filtered);
      setShowSuggestions(filtered.length > 0);
      return;
    }
    
    // Fallback: server-side search
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
    }, 80);
    
    setSearchTimer(timer);
  };

  const handleSelectSuggestion = (product: Product) => {
    setNewProductForm((prev) => ({
      ...prev,
      productName: product.productName,
      sku: product.sku,
      batch: product.batch,
      barcode: product.barcode || prev.barcode,
    }));
    setShowSuggestions(false);
    setSearchResults([]);
    toast.success(`Produk dipilih: ${product.productName}`);
  };

  const handleBarcodeScan = async (barcode: string) => {
    setShowBarcodeScanner(false);
    setScanningBarcode(true);
    try {
      const result = await lookupBarcodeApi(barcode);
      if (result.success && result.product) {
        setNewProductForm((prev) => ({
          ...prev,
          productName: result.product!.productName,
          sku: result.product!.sku,
          batch: result.product!.batch || "",
          barcode: barcode,
        }));
        toast.success(`Produk ditemukan: ${result.product.productName}`);
      } else {
        // Barcode not found, just fill the barcode field
        setNewProductForm((prev) => ({
          ...prev,
          barcode: barcode,
        }));
        toast.error(result.message || "Produk tidak ditemukan, isi manual");
      }
    } catch (error) {
      console.error("Barcode lookup error:", error);
      setNewProductForm((prev) => ({
        ...prev,
        barcode: barcode,
      }));
      toast.error("Gagal lookup barcode, isi data manual");
    } finally {
      setScanningBarcode(false);
    }
  };

  const handleAddNewProduct = () => {
    if (!newProductForm.productName || !newProductForm.sku || !newProductForm.batch) {
      toast.error("Nama Produk, SKU, dan Batch harus diisi");
      return;
    }

    if (newProductForm.qty <= 0) {
      toast.error("Quantity harus lebih dari 0");
      return;
    }

    // Check if SKU already exists
    const allProducts = [...products, ...newProducts];
    if (allProducts.some((p) => p.sku === newProductForm.sku)) {
      toast.error("SKU sudah ada");
      return;
    }

    const newProduct: Product = {
      productName: newProductForm.productName,
      sku: newProductForm.sku,
      batch: newProductForm.batch,
      barcode: newProductForm.barcode || undefined,
    };

    setNewProducts((prev) => [...prev, newProduct]);
    setQuantities((prev) => ({
      ...prev,
      [newProduct.sku]: newProductForm.qty,
    }));
    if (newProductFormula) {
      setFormulas((prev) => ({ ...prev, [newProduct.sku]: newProductFormula }));
    }

    // Reset form
    setNewProductForm({
      productName: "",
      sku: "",
      batch: "",
      barcode: "",
      qty: 0,
    });
    setNewProductFormula("");
    setShowAddForm(false);
    toast.success("Produk baru berhasil ditambahkan");
  };

  const handleBatchEdit = (key: string, currentBatch: string) => {
    setEditingBatchKey(key);
    setEditingBatchValue(currentBatch);
  };

  const handleBatchSave = (sku: string, isNew: boolean) => {
    const newBatch = editingBatchValue.trim();
    if (isNew) {
      setNewProducts((prev) => prev.map((p) => p.sku === sku ? { ...p, batch: newBatch } : p));
    } else {
      setProducts((prev) => prev.map((p) => p.sku === sku ? { ...p, batch: newBatch } : p));
    }
    setEditingBatchKey(null);
    setEditingBatchValue("");
    toast.success("Batch diperbarui");
  };

  const handleSave = () => {
    const existingItems = products
      .filter((product) => quantities[product.sku] > 0)
      .map((product) => ({
        productName: product.productName,
        sku: product.sku,
        batch: product.batch,
        barcode: product.barcode || "",
        qty: quantities[product.sku],
        formula: formulas[product.sku] || "",
        isNew: false,
      }));

    const newItems = newProducts
      .filter((product) => quantities[product.sku] > 0)
      .map((product) => ({
        productName: product.productName,
        sku: product.sku,
        batch: product.batch,
        barcode: product.barcode || "",
        qty: quantities[product.sku],
        formula: formulas[product.sku] || "",
        isNew: true,
      }));

    const items = [...existingItems, ...newItems];

    if (items.length === 0) {
      toast.error("Tidak ada produk dengan quantity > 0");
      return;
    }

    setSaving(true);
    const sessionId = `${user?.email}_${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Fire save IMMEDIATELY in background — don't await
    saveStockOpnameApi(sessionId, user?.email || "", location, timestamp, items)
      .then((result) => {
        if (!result.success) toast.error(result.message || "Gagal sinkron ke server");
      })
      .catch(() => toast.error("Gagal sinkron ke server"));

    // Navigate immediately — don't wait for server
    // Only invalidate memCache, keep localStorage cache for instant history display
    invalidateMemCache("getHistory");
    clearCache("products:");
    toast.success("Stock opname berhasil disimpan!");
    router.push("/scan");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--primary-bg)]">
        <LoadingSpinner />
      </div>
    );
  }

  const allProducts = [...products, ...newProducts];
  const totalItems = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);

  return (
    <div className="min-h-screen pb-32 bg-[var(--primary-bg)]">
      {/* ── Header ── */}
      <div className="bg-white px-5 pt-6 pb-4 shadow-card">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => router.push("/scan")} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition">
            <svg className="w-4 h-4 text-text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div>
            <h1 className="text-lg font-bold text-text-primary">Input Quantity</h1>
            <p className="text-xs text-text-secondary">Lokasi: <span className="font-semibold text-primary">{location}</span></p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        {/* ── Stats Card ── */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-card border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Total Produk</p>
                <p className="text-lg font-bold text-text-primary">{allProducts.length}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-secondary">Total Item</p>
              <p className="text-lg font-bold text-primary">{totalItems}</p>
            </div>
          </div>
        </div>

        {/* ── Add New Product Button ── */}
        <div className="mb-3">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-full bg-primary text-white py-3 rounded-2xl font-semibold hover:bg-primary-light transition text-sm shadow-card active:scale-[0.98]"
          >
            {showAddForm ? "✕ Tutup Form" : "+ Tambah Produk Baru"}
          </button>
        </div>

        {/* ── Add New Product Form ── */}
        {showAddForm && (
          <div className="bg-white border border-border rounded-2xl p-4 mb-4 shadow-card">
            <h3 className="text-sm font-semibold mb-3 text-text-primary">Tambah Produk Baru</h3>

            {scanningBarcode && (
              <div className="mb-3 flex items-center justify-center gap-2 text-xs text-text-secondary">
                <LoadingSpinner /> Mencari produk...
              </div>
            )}

            <div className="space-y-2.5">
              {/* Barcode */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Barcode</label>
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                    <path d="M7 12h10" />
                  </svg>
                  <input
                    type="text"
                    value={newProductForm.barcode}
                    onChange={(e) => setNewProductForm({ ...newProductForm, barcode: e.target.value.trim() })}
                    onKeyDown={(e) => {
                      const barcodeVal = String(newProductForm.barcode || "").trim();
                      if (e.key === "Enter" && barcodeVal) { e.preventDefault(); handleBarcodeScan(barcodeVal); }
                    }}
                    className="w-full pl-10 pr-20 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-gray-50 text-sm"
                    placeholder="Scan / ketik barcode produk"
                    autoComplete="off"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { const barcodeVal = String(newProductForm.barcode || "").trim(); if (barcodeVal) handleBarcodeScan(barcodeVal); }}
                      disabled={!String(newProductForm.barcode || "").trim() || scanningBarcode}
                      className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 disabled:opacity-50"
                      title="Cari barcode"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBarcodeScanner(true)}
                      disabled={scanningBarcode}
                      className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 disabled:opacity-50"
                      title="Scan barcode"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                        <path d="M7 12h10" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Nama Produk + Search */}
              <div className="relative">
                <label className="block text-xs font-medium text-text-primary mb-1">Nama Produk</label>
                <input
                  type="text"
                  value={newProductForm.productName}
                  onChange={(e) => handleProductNameSearch(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setShowSuggestions(true); }}
                  onBlur={() => { setTimeout(() => setShowSuggestions(false), 200); }}
                  className="w-full px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  placeholder="Ketik min. 2 huruf untuk cari produk..."
                  autoComplete="off"
                />
                {showSuggestions && searchResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((p, idx) => (
                      <button
                        key={`${p.sku}-${idx}`}
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-primary-pale transition border-b border-border last:border-b-0"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectSuggestion(p)}
                      >
                        <p className="font-medium text-text-primary text-xs">{p.productName}</p>
                        <p className="text-[10px] text-text-secondary">SKU: {p.sku} | Batch: {p.batch}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* SKU */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">SKU</label>
                <input type="text" value={newProductForm.sku} onChange={(e) => setNewProductForm({ ...newProductForm, sku: e.target.value })}
                  className="w-full px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" placeholder="Masukkan SKU" />
              </div>

              {/* Batch */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Batch</label>
                <input type="text" value={newProductForm.batch} onChange={(e) => setNewProductForm({ ...newProductForm, batch: e.target.value })}
                  className="w-full px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" placeholder="Masukkan batch" />
              </div>

              {/* Qty */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Quantity</label>
                <QtyInput value={newProductForm.qty} onChange={(v) => setNewProductForm((prev) => ({ ...prev, qty: v }))} onExprCommit={(expr) => setNewProductFormula(expr)} wide />
              </div>

              <button onClick={handleAddNewProduct}
                className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-light transition text-sm active:scale-[0.98]">
                Tambahkan Produk
              </button>

              {showBarcodeScanner && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                  <div className="bg-white w-full max-w-md rounded-2xl p-4 shadow-2xl">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-text-primary text-sm">Scan Barcode Produk</h3>
                      <button onClick={() => setShowBarcodeScanner(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500">✕</button>
                    </div>
                    <BarcodeScanner onScan={(code) => handleBarcodeScan(code)} active={showBarcodeScanner} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Product Table ── */}
        {allProducts.length > 0 && (
          <div className="mb-4 bg-white rounded-2xl shadow-card overflow-hidden">
            <p className="text-[10px] text-text-secondary px-3 py-1.5 bg-gray-50 border-b border-border flex items-center gap-1">
              <svg className="w-3 h-3 text-accent-yellow" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6z" /><path d="M11 10h2v5h-2zm0 6h2v2h-2z" /></svg>
              Qty bisa pakai rumus: 10+5, 400-100, 10x10+5
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-primary text-white">
                    <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Produk</th>
                    <th className="text-left px-2 py-2.5 font-semibold whitespace-nowrap">SKU</th>
                    <th className="text-left px-2 py-2.5 font-semibold whitespace-nowrap">Batch</th>
                    <th className="text-center px-2 py-2.5 font-semibold whitespace-nowrap">Qty</th>
                    <th className="px-1 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {products.map((product, idx) => (
                    <tr key={`${product.sku}-${product.batch}`} className={`hover:bg-primary-pale/50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : "bg-white"}`}>
                      <td className="px-3 py-2 text-text-primary font-medium">
                        <span className="break-words text-[11px] leading-tight">{product.productName}</span>
                      </td>
                      <td className="px-2 py-2 text-text-secondary whitespace-nowrap text-[11px]">{product.sku}</td>
                      <td className="px-2 py-2 text-text-secondary whitespace-nowrap">
                        {editingBatchKey === `existing-${product.sku}` ? (
                          <span className="flex items-center gap-1">
                            <input type="text" value={editingBatchValue} onChange={(e) => setEditingBatchValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleBatchSave(product.sku, false); if (e.key === 'Escape') setEditingBatchKey(null); }}
                              className="w-16 px-1.5 py-0.5 border border-primary rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary" autoFocus />
                            <button onClick={() => handleBatchSave(product.sku, false)} className="text-primary hover:text-primary-dark text-xs" title="Simpan">✓</button>
                            <button onClick={() => setEditingBatchKey(null)} className="text-accent-red hover:text-red-700 text-xs" title="Batal">✕</button>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 group cursor-pointer" onClick={() => handleBatchEdit(`existing-${product.sku}`, product.batch)}>
                            <span className="text-[11px]">{product.batch}</span>
                            <span className="text-[10px] text-text-secondary opacity-0 group-hover:opacity-100 transition">✏️</span>
                          </span>
                        )}
                      </td>
                      <td className="px-1 py-1 text-center">
                        <QtyInput wide value={quantities[product.sku] || 0} onChange={(v) => handleQuantityChange(product.sku, v)} onExprCommit={(expr) => handleExprCommit(product.sku, expr)} />
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button onClick={() => handleDeleteProduct(product.sku)} className="w-6 h-6 rounded-full bg-red-50 text-accent-red hover:bg-accent-red hover:text-white text-[10px] font-bold transition" title="Hapus">✕</button>
                      </td>
                    </tr>
                  ))}
                  {newProducts.length > 0 && (
                    <tr className="bg-primary/5">
                      <td colSpan={5} className="px-3 py-1.5 text-xs font-semibold text-primary">Produk Baru</td>
                    </tr>
                  )}
                  {newProducts.map((product, idx) => (
                    <tr key={`new-${product.sku}-${product.batch}`} className={`hover:bg-primary-pale/50 transition ${idx % 2 === 1 ? "bg-blue-50/30" : "bg-primary-pale/20"}`}>
                      <td className="px-3 py-2 text-text-primary font-medium">
                        <span className="break-words text-[11px] leading-tight">{product.productName}</span>
                      </td>
                      <td className="px-2 py-2 text-text-secondary whitespace-nowrap text-[11px]">{product.sku}</td>
                      <td className="px-2 py-2 text-text-secondary whitespace-nowrap">
                        {editingBatchKey === `new-${product.sku}` ? (
                          <span className="flex items-center gap-1">
                            <input type="text" value={editingBatchValue} onChange={(e) => setEditingBatchValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleBatchSave(product.sku, true); if (e.key === 'Escape') setEditingBatchKey(null); }}
                              className="w-16 px-1.5 py-0.5 border border-primary rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary" autoFocus />
                            <button onClick={() => handleBatchSave(product.sku, true)} className="text-primary hover:text-primary-dark text-xs" title="Simpan">✓</button>
                            <button onClick={() => setEditingBatchKey(null)} className="text-accent-red hover:text-red-700 text-xs" title="Batal">✕</button>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 group cursor-pointer" onClick={() => handleBatchEdit(`new-${product.sku}`, product.batch)}>
                            <span className="text-[11px]">{product.batch}</span>
                            <span className="text-[10px] text-text-secondary opacity-0 group-hover:opacity-100 transition">✏️</span>
                          </span>
                        )}
                      </td>
                      <td className="px-1 py-1 text-center">
                        <QtyInput wide value={quantities[product.sku] || 0} onChange={(v) => handleQuantityChange(product.sku, v)} onExprCommit={(expr) => handleExprCommit(product.sku, expr)} />
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button onClick={() => handleDeleteNewProduct(product.sku)} className="w-6 h-6 rounded-full bg-red-50 text-accent-red hover:bg-accent-red hover:text-white text-[10px] font-bold transition" title="Hapus">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Save Button (Fixed) ── */}
        <div className="fixed bottom-20 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-border">
          <button
            onClick={handleSave}
            disabled={saving || totalItems === 0}
            className="w-full bg-primary text-white py-3.5 rounded-2xl font-semibold hover:bg-primary-light transition disabled:opacity-50 disabled:cursor-not-allowed shadow-card active:scale-[0.98]"
          >
            {saving ? <LoadingSpinner /> : `Simpan (${totalItems} item)`}
          </button>
        </div>
      </div>

      <BottomNav activePage="scan" />
    </div>
  );
}

export default function InputPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    }>
      <InputPageContent />
    </Suspense>
  );
}
