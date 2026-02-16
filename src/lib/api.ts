import { User, Product, HistoryEntry } from "./types";

const API_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || "";

export const apiCall = async (action: string, data: any = {}): Promise<any> => {
  try {
    // Using "text/plain" instead of "application/json" to avoid CORS preflight
    // Google Apps Script doesn't support OPTIONS preflight requests
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
  editTimestamp: string
): Promise<{ success: boolean; message?: string }> => {
  return apiCall("updateEntry", {
    rowId,
    sessionId,
    newQty,
    editTimestamp,
  });
};
