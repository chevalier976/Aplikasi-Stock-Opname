import { User } from "./types";

export const getSession = (): User | null => {
  if (typeof window === "undefined") return null;
  
  try {
    const sessionStr = localStorage.getItem("stock_opname_session");
    if (!sessionStr) return null;
    return JSON.parse(sessionStr) as User;
  } catch (error) {
    console.error("Error parsing session:", error);
    return null;
  }
};

export const setSession = (user: User): void => {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem("stock_opname_session", JSON.stringify(user));
  } catch (error) {
    console.error("Error setting session:", error);
  }
};

export const clearSession = (): void => {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.removeItem("stock_opname_session");
  } catch (error) {
    console.error("Error clearing session:", error);
  }
};
