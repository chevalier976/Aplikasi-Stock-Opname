"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import BarcodeScanner from "@/components/BarcodeScanner";
import QtyInput from "@/components/QtyInput";
import { calcExpr } from "@/components/QtyInput";
import { getProductsApi, saveStockOpnameApi, deleteProductApi, lookupBarcodeApi, searchProductsApi, warmupCacheApi, preloadHistory, getAllProductsApi } from "@/lib/api";
import { Product } from "@/lib/types";
import { getCache, setCache, clearCache } from "@/lib/cache";
import toast from "react-hot-toast";
import BrandBLP from "@/components/BrandBLP";

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
    clearCache("history:");
    clearCache("products:");
    toast.success("Stock opname berhasil disimpan!");
    router.push("/scan");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const allProducts = [...products, ...newProducts];
  const totalItems = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);

  return (
    <div className="min-h-screen pb-32">
      <div className="bg-primary text-white p-6 shadow-md">
        <div className="mb-1"><BrandBLP className="text-white text-2xl" /></div>
        <h1 className="text-xl font-bold mb-1">Input Quantity</h1>
        <p className="text-primary-pale">Lokasi: {location}</p>
      </div>

      <div className="p-4">
        <div className="bg-primary-pale border border-primary rounded-lg p-4 mb-4">
          <p className="text-text-primary">
            <span className="font-semibold">Total Produk:</span> {allProducts.length}
          </p>
          <p className="text-text-primary">
            <span className="font-semibold">Total Item:</span> {totalItems}
          </p>
        </div>

        {/* Add New Product Button */}
        <div className="mb-4">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-light transition"
          >
            {showAddForm ? "Tutup Form" : "+ Tambah Produk Baru"}
          </button>
        </div>

        {/* Add New Product Form */}
        {showAddForm && (
          <div className="bg-white border border-border rounded-lg p-4 mb-4 shadow-md">
            <h3 className="text-lg font-semibold mb-3 text-text-primary">
              Tambah Produk Baru
            </h3>

            {scanningBarcode && (
              <div className="mb-3 flex items-center justify-center gap-2 text-sm text-text-secondary">
                <LoadingSpinner /> Mencari produk...
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
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
                    value={newProductForm.barcode}
                    onChange={(e) =>
                      setNewProductForm({ ...newProductForm, barcode: e.target.value.trim() })
                    }
                    onKeyDown={(e) => {
                      const barcodeVal = String(newProductForm.barcode || "").trim();
                      if (e.key === "Enter" && barcodeVal) {
                        e.preventDefault();
                        handleBarcodeScan(barcodeVal);
                      }
                    }}
                    className="w-full pl-11 pr-24 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-gray-50"
                    placeholder="Scan / ketik barcode produk"
                    autoComplete="off"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const barcodeVal = String(newProductForm.barcode || "").trim();
                        if (barcodeVal) handleBarcodeScan(barcodeVal);
                      }}
                      disabled={!String(newProductForm.barcode || "").trim() || scanningBarcode}
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
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Nama Produk
                </label>
                <input
                  type="text"
                  value={newProductForm.productName}
                  onChange={(e) => handleProductNameSearch(e.target.value)}
                  onFocus={() => {
                    if (searchResults.length > 0) setShowSuggestions(true);
                  }}
                  onBlur={() => {
                    // Delay to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Ketik min. 2 huruf untuk cari produk..."
                  autoComplete="off"
                />
                {showSuggestions && searchResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((p, idx) => (
                      <button
                        key={`${p.sku}-${idx}`}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-primary-pale transition border-b border-border last:border-b-0"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectSuggestion(p)}
                      >
                        <p className="font-medium text-text-primary text-sm">{p.productName}</p>
                        <p className="text-xs text-text-secondary">SKU: {p.sku} | Batch: {p.batch}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  SKU
                </label>
                <input
                  type="text"
                  value={newProductForm.sku}
                  onChange={(e) =>
                    setNewProductForm({ ...newProductForm, sku: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Masukkan SKU"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Batch
                </label>
                <input
                  type="text"
                  value={newProductForm.batch}
                  onChange={(e) =>
                    setNewProductForm({ ...newProductForm, batch: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Masukkan batch"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Quantity
                </label>
                <QtyInput
                  value={newProductForm.qty}
                  onChange={(v) => setNewProductForm((prev) => ({ ...prev, qty: v }))}
                  onExprCommit={(expr) => setNewProductFormula(expr)}
                  wide
                />
              </div>
              <button
                onClick={handleAddNewProduct}
                className="w-full bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-light transition"
              >
                Tambahkan Produk
              </button>

              {showBarcodeScanner && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
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
                    <BarcodeScanner
                      onScan={(code) => handleBarcodeScan(code)}
                      active={showBarcodeScanner}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {allProducts.length > 0 && (
        <div className="mb-4 bg-white rounded-lg shadow-md overflow-hidden">
          <p className="text-[10px] text-text-secondary px-2 py-1 bg-gray-50 border-b border-border">💡 Qty bisa pakai rumus: 10+5, 400-100, 10x10+5</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-border">
                  <th className="text-left px-2 py-1.5 font-semibold text-text-secondary whitespace-nowrap">Produk</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-text-secondary whitespace-nowrap">SKU</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-text-secondary whitespace-nowrap">Batch</th>
                  <th className="text-center px-2 py-1.5 font-semibold text-text-secondary whitespace-nowrap">Qty</th>
                  <th className="px-1 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((product) => (
                  <tr key={`${product.sku}-${product.batch}`} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5 text-text-primary font-medium">
                      <span className="break-words text-[11px] leading-tight">{product.productName}</span>
                    </td>
                    <td className="px-2 py-1.5 text-text-secondary whitespace-nowrap">{product.sku}</td>
                    <td className="px-2 py-1.5 text-text-secondary whitespace-nowrap">{product.batch}</td>
                    <td className="px-1 py-1 text-center">
                      <QtyInput wide value={quantities[product.sku] || 0} onChange={(v) => handleQuantityChange(product.sku, v)} onExprCommit={(expr) => handleExprCommit(product.sku, expr)} />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => handleDeleteProduct(product.sku)} className="w-5 h-5 rounded-full bg-red-100 text-red-600 hover:bg-red-500 hover:text-white text-[10px] font-bold transition" title="Hapus">✕</button>
                    </td>
                  </tr>
                ))}
                {newProducts.length > 0 && (
                  <tr className="bg-primary-pale">
                    <td colSpan={5} className="px-2 py-1 text-xs font-semibold text-primary">Produk Baru</td>
                  </tr>
                )}
                {newProducts.map((product) => (
                  <tr key={`new-${product.sku}-${product.batch}`} className="hover:bg-gray-50 bg-blue-50/30">
                    <td className="px-2 py-1.5 text-text-primary font-medium">
                      <span className="break-words text-[11px] leading-tight">{product.productName}</span>
                    </td>
                    <td className="px-2 py-1.5 text-text-secondary whitespace-nowrap">{product.sku}</td>
                    <td className="px-2 py-1.5 text-text-secondary whitespace-nowrap">{product.batch}</td>
                    <td className="px-1 py-1 text-center">
                      <QtyInput wide value={quantities[product.sku] || 0} onChange={(v) => handleQuantityChange(product.sku, v)} onExprCommit={(expr) => handleExprCommit(product.sku, expr)} />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => handleDeleteNewProduct(product.sku)} className="w-5 h-5 rounded-full bg-red-100 text-red-600 hover:bg-red-500 hover:text-white text-[10px] font-bold transition" title="Hapus">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        <div className="fixed bottom-20 left-0 right-0 p-4 bg-white border-t border-border">
          <button
            onClick={handleSave}
            disabled={saving || totalItems === 0}
            className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-light transition disabled:opacity-50 disabled:cursor-not-allowed"
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
