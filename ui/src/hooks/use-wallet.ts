import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

export type TxDirection = "credit" | "debit";
export type TxType = "mpesa_stk" | "mpesa_c2b" | "withdrawal" | "adjustment";
export type TxStatus = "pending" | "completed" | "failed" | "reversed";

export interface Transaction {
  id: string;
  amount: number;
  direction: TxDirection;
  type: TxType;
  status: TxStatus;
  mpesaReceiptNumber: string | null;
  description: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface WalletState {
  balance: number;
  currency: string;
  transactions: Transaction[];
}

export interface DepositResult {
  success: boolean;
  message: string;
  checkoutRequestId?: string;
  expiresAt?: string;
}

export interface WithdrawResult {
  success: boolean;
  message: string;
  transactionId?: string;
  conversationId?: string;
  newBalance?: number;
}

export function useWallet() {
  const { token } = useAuth();
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/payments/balance");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setWallet(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to load wallet");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetch on mount and whenever token changes
  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const deposit = useCallback(
    async (amount: number, phoneNumber?: string): Promise<DepositResult> => {
      if (!token) return { success: false, message: "Not authenticated" };
      try {
        const res = await apiFetch("/api/payments/mpesa/deposit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ amount, phoneNumber }),
        });
        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          if (res.status === 404) {
            return {
              success: false,
              message: "API endpoint not found (404). The backend server needs to be restarted with the latest code.",
            };
          }
          return { success: false, message: `Server error (${res.status}): unexpected response format` };
        }

        if (res.status === 401) {
          return { success: false, message: "Session expired. Please log in again." };
        }
        if (!res.ok) return { success: false, message: data?.error ?? "Deposit failed" };
        // Refresh balance in background after a short delay (callback takes a few seconds)
        setTimeout(fetchWallet, 8000);
        return {
          success: true,
          message: data.message,
          checkoutRequestId: data.checkoutRequestId,
          expiresAt: data.expiresAt,
        };
      } catch (e: any) {
        return { success: false, message: e.message ?? "Network error" };
      }
    },
    [token, fetchWallet]
  );

  const withdraw = useCallback(
    async (amount: number, phoneNumber?: string): Promise<WithdrawResult> => {
      if (!token) return { success: false, message: "Not authenticated" };
      try {
        const res = await apiFetch("/api/payments/mpesa/withdraw", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ amount, phoneNumber }),
        });
        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          if (res.status === 404) {
            return {
              success: false,
              message: "API endpoint not found (404). The backend server needs to be restarted with the latest code.",
            };
          }
          return { success: false, message: `Server error (${res.status}): unexpected response format` };
        }

        if (res.status === 401) {
          return { success: false, message: "Session expired. Please log in again." };
        }
        if (!res.ok) return { success: false, message: data?.error ?? "Withdrawal failed" };
        // Immediate and subsequent re-fetch
        fetchWallet();
        setTimeout(fetchWallet, 6000);
        return {
          success: true,
          message: data.message,
          transactionId: data.transactionId,
          conversationId: data.conversationId,
          newBalance: data.newBalance,
        };
      } catch (e: any) {
        return { success: false, message: e.message ?? "Network error" };
      }
    },
    [token, fetchWallet]
  );

  return { wallet, loading, error, refetch: fetchWallet, deposit, withdraw };
}
