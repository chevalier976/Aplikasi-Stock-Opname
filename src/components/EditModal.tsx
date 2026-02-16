"use client";

import { useState, useEffect } from "react";
import { HistoryEntry } from "@/lib/types";

interface EditModalProps {
  entry: HistoryEntry;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newQty: number) => void;
}

export default function EditModal({
  entry,
  isOpen,
  onClose,
  onSave,
}: EditModalProps) {
  const [quantity, setQuantity] = useState(entry.qty);

  useEffect(() => {
    setQuantity(entry.qty);
  }, [entry]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(quantity);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-semibold text-text-primary mb-4">
          Edit Quantity
        </h2>

        <div className="mb-4">
          <p className="text-sm text-text-secondary mb-1">
            <span className="font-semibold">Produk:</span> {entry.productName}
          </p>
          <p className="text-sm text-text-secondary mb-1">
            <span className="font-semibold">SKU:</span> {entry.sku}
          </p>
          <p className="text-sm text-text-secondary mb-1">
            <span className="font-semibold">Batch:</span> {entry.batch}
          </p>
          <p className="text-sm text-text-secondary">
            <span className="font-semibold">Lokasi:</span> {entry.location}
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-text-primary mb-2">
            Quantity Baru:
          </label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
            className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            min="0"
          />
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
      </div>
    </div>
  );
}
