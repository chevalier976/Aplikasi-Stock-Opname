"use client";

import { useState } from "react";
import { Product } from "@/lib/types";

interface ProductCardProps {
  product: Product;
  quantity: number;
  onChange: (sku: string, qty: number) => void;
}

export default function ProductCard({
  product,
  quantity,
  onChange,
}: ProductCardProps) {
  const handleIncrement = () => {
    onChange(product.sku, quantity + 1);
  };

  const handleDecrement = () => {
    if (quantity > 0) {
      onChange(product.sku, quantity - 1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    if (value >= 0) {
      onChange(product.sku, value);
    }
  };

  return (
    <div className="bg-white border border-border rounded-lg p-4 mb-3 shadow-sm">
      <h3 className="font-semibold text-text-primary mb-1">
        {product.productName}
      </h3>
      <p className="text-sm text-text-secondary mb-2">
        SKU: {product.sku} | Batch: {product.batch}
      </p>

      <div className="flex items-center justify-between mt-3">
        <button
          onClick={handleDecrement}
          className="w-10 h-10 bg-primary-pale text-primary rounded-lg font-bold text-xl hover:bg-primary-light hover:text-white transition"
          disabled={quantity === 0}
        >
          −
        </button>

        <input
          type="number"
          value={quantity}
          onChange={handleInputChange}
          className="w-20 h-10 text-center border border-border rounded-lg font-semibold text-lg"
          min="0"
        />

        <button
          onClick={handleIncrement}
          className="w-10 h-10 bg-primary-pale text-primary rounded-lg font-bold text-xl hover:bg-primary-light hover:text-white transition"
        >
          +
        </button>
      </div>
    </div>
  );
}
