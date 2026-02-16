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
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!location) {
      router.push("/scan");
      return;
    }

    fetchProducts();
  }, [location]);

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

  const handleSave = async () => {
    // Prepare items with quantities > 0
    const items = products
      .filter((product) => quantities[product.sku] > 0)
      .map((product) => ({
        productName: product.productName,
        sku: product.sku,
        batch: product.batch,
        qty: quantities[product.sku],
      }));

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
            <span className="font-semibold">Total Produk:</span> {products.length}
          </p>
          <p className="text-text-primary">
            <span className="font-semibold">Total Item:</span> {totalItems}
          </p>
        </div>

        <div className="mb-4">
          {products.map((product) => (
            <ProductCard
              key={product.sku}
              product={product}
              quantity={quantities[product.sku] || 0}
              onChange={handleQuantityChange}
            />
          ))}
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
