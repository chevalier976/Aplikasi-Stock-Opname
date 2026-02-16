export type User = {
  email: string;
  name: string;
  role: string;
};

export type Product = {
  productName: string;
  sku: string;
  batch: string;
};

export type HistoryEntry = {
  sessionId: string;
  rowId: string;
  timestamp: string;
  operator: string;
  location: string;
  productName: string;
  sku: string;
  batch: string;
  qty: number;
  edited: string;
  editTimestamp: string;
};
