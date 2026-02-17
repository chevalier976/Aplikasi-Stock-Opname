import { User, Product, HistoryEntry } from "./types";

const API_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || "";

export const apiCall = async (action: string, data: Record<string, unknown> = {}): Promise<any> => {
  if (!API_URL) {
    console.error("NEXT_PUBLIC_APPS_SCRIPT_URL is not configured. Please set it in your .env.local file.");
    throw new Error("API URL belum dikonfigurasi. Silakan set NEXT_PUBLIC_APPS_SCRIPT_URL di file .env.local");
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: JSON.stringify({ action, ...data }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("API call error:", error);
    throw error;
  }
};

export const loginApi = async (
  email: string,
  password: string
): Promise<{ success: boolean; user?: User; message?: string }> => {
  return apiCall("login", { email, password });
};

export const getProductsApi = async (
  locationCode: string
): Promise<{ success: boolean; products?: Product[]; message?: string }> => {
  return apiCall("getProducts", { locationCode });
};

export const saveStockOpnameApi = async (
  sessionId: string,
  operator: string,
  location: string,
  timestamp: string,
  items: Array<{
    productName: string;
    sku: string;
    batch: string;
    qty: number;
    isNew?: boolean;
    barcode?: string;
  }>
): Promise<{ success: boolean; message?: string }> => {
  return apiCall("saveStockOpname", {
    sessionId,
    operator,
    location,
    timestamp,
    items,
  });
};

export const getHistoryApi = async (
  operator: string,
  filter?: string
): Promise<{ success: boolean; history?: HistoryEntry[]; message?: string }> => {
  return apiCall("getHistory", { operator, filter });
};

export const updateEntryApi = async (
  rowId: string,
  sessionId: string,
  newQty: number,
  editTimestamp: string,
  extra?: { productName?: string; sku?: string; batch?: string }
): Promise<{ success: boolean; message?: string }> => {
  return apiCall("updateEntry", {
    rowId,
    sessionId,
    newQty,
    editTimestamp,
    ...extra,
  });
};

export const deleteProductApi = async (
  locationCode: string,
  sku: string
): Promise<{ success: boolean; message?: string }> => {
  return apiCall("deleteProduct", { locationCode, sku });
};

export const lookupBarcodeApi = async (
  barcode: string
): Promise<{ success: boolean; product?: Product; message?: string }> => {
  return apiCall("lookupBarcode", { barcode });
};

export const searchProductsApi = async (
  query: string
): Promise<{ success: boolean; products?: Product[] }> => {
  return apiCall("searchProducts", { query });
};

export const deleteEntryApi = async (
  rowId: string
): Promise<{ success: boolean; message?: string }> => {
  return apiCall("deleteEntry", { rowId });
};

export const searchLocationsApi = async (
  query: string
): Promise<{ success: boolean; locations?: Array<{ locationCode: string; productCount: number }> }> => {
  return apiCall("searchLocations", { query });
};

export const warmupCacheApi = async (
  payload: { locationQuery?: string; productQuery?: string } = {}
): Promise<{ success: boolean; warmed?: { locations: number; products: number }; message?: string }> => {
  return apiCall("warmupCache", payload);
};
