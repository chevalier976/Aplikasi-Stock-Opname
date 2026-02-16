"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import ProductCard from "@/components/ProductCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import { getProductsApi, saveStockOpnameApi } from "@/lib/api";
import { Product } from "@/lib/types";
import toast from "react-hot-toast";

function InputPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const location = searchParams.get("location") || "";

  const [products, setProducts] = useState<Product[]>([]);
  const [newProducts, setNewProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    productName: "",
    sku: "",
    batch: "",
    qty: 0,
  });

  useEffect(() => {
    if (!location) {
      router.push("/scan");
      return;
    }

    fetchProducts();
  }, [location, router]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const result = await getProductsApi(location);
      
      if (result.success && result.products) {
        setProducts(result.products);
        // Initialize quantities to 0
        const initialQuantities: Record<string, number> = {};
        result.products.forEach((product) => {
          initialQuantities[product.sku] = 0;
        });
        setQuantities(initialQuantities);
      } else {
        toast.error(result.message || "Gagal mengambil data produk");
        router.push("/scan");
      }
    } catch (error) {
      console.error("Fetch products error:", error);
      toast.error("Terjadi kesalahan saat mengambil data produk");
      router.push("/scan");
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

  const handleAddNewProduct = () => {
    if (!newProductForm.productName || !newProductForm.sku || !newProductForm.batch) {
      toast.error("Semua field harus diisi");
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
    };

    setNewProducts((prev) => [...prev, newProduct]);
    setQuantities((prev) => ({
      ...prev,
      [newProduct.sku]: newProductForm.qty,
    }));

    // Reset form
    setNewProductForm({
      productName: "",
      sku: "",
      batch: "",
      qty: 0,
    });
    setShowAddForm(false);
    toast.success("Produk baru berhasil ditambahkan");
  };

  const handleSave = async () => {
    // Prepare items with quantities > 0
    const existingItems = products
      .filter((product) => quantities[product.sku] > 0)
      .map((product) => ({
        productName: product.productName,
        sku: product.sku,
        batch: product.batch,
        qty: quantities[product.sku],
        isNew: false,
      }));

    const newItems = newProducts
      .filter((product) => quantities[product.sku] > 0)
      .map((product) => ({
        productName: product.productName,
        sku: product.sku,
        batch: product.batch,
        qty: quantities[product.sku],
        isNew: true,
      }));

    const items = [...existingItems, ...newItems];

    if (items.length === 0) {
      toast.error("Tidak ada produk dengan quantity > 0");
      return;
    }

    setSaving(true);
    try {
      const sessionId = `${user?.email}_${Date.now()}`;
      const timestamp = new Date().toISOString();

      const result = await saveStockOpnameApi(
        sessionId,
        user?.email || "",
        location,
        timestamp,
        items
      );

      if (result.success) {
        toast.success("Stock opname berhasil disimpan!");
        router.push("/history");
      } else {
        toast.error(result.message || "Gagal menyimpan stock opname");
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Terjadi kesalahan saat menyimpan");
    } finally {
      setSaving(false);
    }
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
        <h1 className="text-2xl font-bold mb-1">Input Quantity</h1>
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
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Nama Produk
                </label>
                <input
                  type="text"
                  value={newProductForm.productName}
                  onChange={(e) =>
                    setNewProductForm({ ...newProductForm, productName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Masukkan nama produk"
                />
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
                <input
                  type="number"
                  min="0"
                  value={newProductForm.qty}
                  onChange={(e) => {
                    const value = e.target.value === "" ? 0 : parseInt(e.target.value);
                    setNewProductForm({ ...newProductForm, qty: isNaN(value) ? 0 : value });
                  }}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Masukkan quantity"
                />
              </div>
              <button
                onClick={handleAddNewProduct}
                className="w-full bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-light transition"
              >
                Tambahkan Produk
              </button>
            </div>
          </div>
        )}

        <div className="mb-4">
          {products.map((product) => (
            <ProductCard
              key={product.sku}
              product={product}
              quantity={quantities[product.sku] || 0}
              onChange={handleQuantityChange}
            />
          ))}
          {newProducts.length > 0 && (
            <>
              <div className="my-4 border-t-2 border-primary pt-2">
                <h3 className="text-lg font-semibold text-primary mb-2">Produk Baru</h3>
              </div>
              {newProducts.map((product) => (
                <ProductCard
                  key={product.sku}
                  product={product}
                  quantity={quantities[product.sku] || 0}
                  onChange={handleQuantityChange}
                />
              ))}
            </>
          )}
        </div>

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
