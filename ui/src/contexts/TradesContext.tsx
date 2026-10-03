import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

export interface Trade {
  id: string;
  symbol: string;
  type: "call" | "put" | "even" | "odd" | "match" | "differ" | "over" | "under";
  stake: number | string;
  payoutMultiplier: number | string;
  entryPrice: number | string;
  exitPrice?: number | string | null;
  entryTime: string;
  expiryTime: string;
  status: "open" | "won" | "lost" | "tie" | "refunded";
  createdAt: string;
}

interface TradesContextType {
  openTrades: Trade[];
  closedTrades: Trade[];
  loading: boolean;
  placing: boolean;
  error: string | null;
  placeTrade: (params: {
    symbol: string;
    type: string;
    stake: number;
    durationSeconds?: number;
  }) => Promise<{ success: boolean; trade?: Trade; error?: string }>;
  refetch: () => Promise<void>;
}

const TradesContext = createContext<TradesContextType | undefined>(undefined);

export function TradesProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOpenTrades = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/trades/open");
      if (res.ok) {
        const data = await res.json();
        setOpenTrades(data.trades || []);
      }
    } catch {}
  }, [token]);

  const fetchHistory = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/trades/history");
      if (res.ok) {
        const data = await res.json();
        setClosedTrades(data.trades || []);
      }
    } catch {}
  }, [token]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchOpenTrades(), fetchHistory()]);
    setLoading(false);
  }, [fetchOpenTrades, fetchHistory]);

  // Polling loop to sync state across all components
  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => {
      fetchOpenTrades();
      fetchHistory();
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchAll, fetchOpenTrades, fetchHistory]);

  const placeTrade = async (params: {
    symbol: string;
    type: string;
    stake: number;
    durationSeconds?: number;
  }) => {
    if (!token) return { success: false, error: "Not logged in" };
    setPlacing(true);
    setError(null);
    try {
      const res = await apiFetch("/api/trades/place", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to place trade");
      }
      
      // Global optimistic state update: immediately visible in Open tab & badges
      if (data.trade) {
        setOpenTrades((prev) => [data.trade, ...prev]);
      }
      fetchOpenTrades();
      return { success: true, trade: data.trade };
    } catch (err: any) {
      setError(err.message || "Failed to place trade");
      return { success: false, error: err.message || "Failed to place trade" };
    } finally {
      setPlacing(false);
    }
  };

  return (
    <TradesContext.Provider
      value={{
        openTrades,
        closedTrades,
        loading,
        placing,
        error,
        placeTrade,
        refetch: fetchAll,
      }}
    >
      {children}
    </TradesContext.Provider>
  );
}

export function useTrades() {
  const ctx = useContext(TradesContext);
  if (!ctx) {
    throw new Error("useTrades must be used within a TradesProvider");
  }
  return ctx;
}
