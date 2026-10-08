import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "@/contexts/AccountContext";
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
    accountType?: "real" | "demo";
  }) => Promise<{ success: boolean; trade?: Trade; error?: string }>;
  refetch: () => Promise<void>;
  clearDemoHistory?: () => void;
}

const TradesContext = createContext<TradesContextType | undefined>(undefined);

const DEMO_CLOSED_STORAGE_KEY = "globalink_demo_closed_trades";

function evaluateOutcome(
  type: string,
  entryPrice: number,
  exitPrice: number
): "won" | "lost" | "tie" {
  const getDigit = (price: number) => {
    const str = price.toFixed(3);
    return parseInt(str[str.length - 1], 10) || 0;
  };
  const entryDigit = getDigit(entryPrice);
  const exitDigit = getDigit(exitPrice);

  switch (type) {
    case "call":
      if (exitPrice > entryPrice) return "won";
      if (exitPrice < entryPrice) return "lost";
      return "tie";
    case "put":
      if (exitPrice < entryPrice) return "won";
      if (exitPrice > entryPrice) return "lost";
      return "tie";
    case "even":
      return exitDigit % 2 === 0 ? "won" : "lost";
    case "odd":
      return exitDigit % 2 !== 0 ? "won" : "lost";
    case "over":
      return exitDigit > 5 ? "won" : "lost";
    case "under":
      return exitDigit < 5 ? "won" : "lost";
    case "match":
      return exitDigit === entryDigit ? "won" : "lost";
    case "differ":
      return exitDigit !== entryDigit ? "won" : "lost";
    default:
      return exitPrice > entryPrice ? "won" : "lost";
  }
}

export function TradesProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { accountType, demoBalance, updateDemoBalance } = useAccount();

  // Real trades state
  const [realOpenTrades, setRealOpenTrades] = useState<Trade[]>([]);
  const [realClosedTrades, setRealClosedTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Demo trades state
  const [demoOpenTrades, setDemoOpenTrades] = useState<Trade[]>([]);
  const [demoClosedTrades, setDemoClosedTrades] = useState<Trade[]>(() => {
    try {
      const stored = localStorage.getItem(DEMO_CLOSED_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });

  // Keep a ref of demoOpenTrades & demoBalance for accurate async settlements
  const demoOpenTradesRef = useRef<Trade[]>(demoOpenTrades);
  demoOpenTradesRef.current = demoOpenTrades;

  const demoBalanceRef = useRef<number>(demoBalance);
  demoBalanceRef.current = demoBalance;

  // Real trades polling
  const fetchRealOpenTrades = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/trades/open");
      if (res.ok) {
        const data = await res.json();
        setRealOpenTrades(data.trades || []);
      }
    } catch {}
  }, [token]);

  const fetchRealHistory = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/trades/history");
      if (res.ok) {
        const data = await res.json();
        setRealClosedTrades(data.trades || []);
      }
    } catch {}
  }, [token]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchRealOpenTrades(), fetchRealHistory()]);
    setLoading(false);
  }, [fetchRealOpenTrades, fetchRealHistory]);

  // Polling loop for real trades
  useEffect(() => {
    if (token) {
      fetchAll();
      const interval = setInterval(() => {
        fetchRealOpenTrades();
        fetchRealHistory();
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [token, fetchAll, fetchRealOpenTrades, fetchRealHistory]);

  // Clear demo history utility
  const clearDemoHistory = useCallback(() => {
    setDemoClosedTrades([]);
    try {
      localStorage.removeItem(DEMO_CLOSED_STORAGE_KEY);
    } catch {}
  }, []);

  // Fetch latest price tick for a symbol
  const fetchTickPrice = async (symbol: string): Promise<number> => {
    try {
      const res = await apiFetch(`/api/ticks?symbol=${symbol}&count=1`);
      if (res.ok) {
        const data = await res.json();
        if (data.ticks && data.ticks.length > 0) {
          const val = data.ticks[data.ticks.length - 1].value;
          if (typeof val === "number" && !isNaN(val)) return val;
        }
      }
    } catch {}
    // Fallback pseudo-price with random last digit
    return Number((500 + Math.random() * 50).toFixed(3));
  };

  const placeTrade = async (params: {
    symbol: string;
    type: string;
    stake: number;
    durationSeconds?: number;
    accountType?: "real" | "demo";
  }): Promise<{ success: boolean; trade?: Trade; error?: string }> => {
    const targetAccount = params.accountType || accountType;

    // ─── DEMO TRADE EXECUTION ───
    if (targetAccount === "demo") {
      setPlacing(true);
      setError(null);

      try {
        if (params.stake < 1) {
          throw new Error("Minimum stake is $1.00");
        }

        if (demoBalanceRef.current < params.stake) {
          throw new Error(
            `Insufficient demo balance ($${demoBalanceRef.current.toFixed(2)}). Minimum required: $${params.stake.toFixed(2)}`
          );
        }

        // Immediately debit stake from demo balance
        updateDemoBalance(-params.stake);

        const durationSeconds = params.durationSeconds || 1;
        const now = new Date();
        const expiryTime = new Date(now.getTime() + durationSeconds * 1000);

        // Multipliers match the platform's exact pay table
        const multiplier =
          params.type === "match"
            ? 9.5
            : params.type === "differ"
            ? 1.056
            : 1.9522;

        const entryPrice = await fetchTickPrice(params.symbol);

        const newDemoTrade: Trade = {
          id: `demo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          symbol: params.symbol,
          type: params.type as any,
          stake: params.stake.toFixed(2),
          payoutMultiplier: multiplier.toFixed(4),
          entryPrice: entryPrice.toFixed(6),
          entryTime: now.toISOString(),
          expiryTime: expiryTime.toISOString(),
          status: "open",
          createdAt: now.toISOString(),
        };

        // Add to active demo open trades
        setDemoOpenTrades((prev) => [newDemoTrade, ...prev]);

        // Schedule settlement exactly when duration completes
        setTimeout(async () => {
          let exitPrice = await fetchTickPrice(params.symbol);
          // Ensure slight tick movement if prices coincide
          if (exitPrice === entryPrice) {
            exitPrice = Number((entryPrice + (Math.random() > 0.5 ? 0.002 : -0.002)).toFixed(3));
          }

          const outcome = evaluateOutcome(params.type, entryPrice, exitPrice);

          // Credit demo balance if won or tied
          if (outcome === "won") {
            const payout = Number((params.stake * multiplier).toFixed(2));
            updateDemoBalance(payout);
          } else if (outcome === "tie") {
            updateDemoBalance(params.stake);
          }

          const settledTrade: Trade = {
            ...newDemoTrade,
            exitPrice: exitPrice.toFixed(6),
            status: outcome,
          };

          // Remove from open, add to closed
          setDemoOpenTrades((prev) => prev.filter((t) => t.id !== newDemoTrade.id));
          setDemoClosedTrades((prev) => {
            const updated = [settledTrade, ...prev.slice(0, 49)];
            try {
              localStorage.setItem(DEMO_CLOSED_STORAGE_KEY, JSON.stringify(updated));
            } catch {}
            return updated;
          });
        }, Math.max(800, durationSeconds * 1000));

        return { success: true, trade: newDemoTrade };
      } catch (err: any) {
        setError(err.message || "Failed to place demo trade");
        return { success: false, error: err.message || "Failed to place demo trade" };
      } finally {
        setPlacing(false);
      }
    }

    // ─── REAL TRADE EXECUTION ───
    if (!token) return { success: false, error: "Not logged in" };
    setPlacing(true);
    setError(null);
    try {
      const res = await apiFetch("/api/trades/place", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: params.symbol,
          type: params.type,
          stake: params.stake,
          durationSeconds: params.durationSeconds,
          accountType: "real",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to place trade");
      }

      if (data.trade) {
        setRealOpenTrades((prev) => [data.trade, ...prev]);
      }
      fetchRealOpenTrades();
      return { success: true, trade: data.trade };
    } catch (err: any) {
      setError(err.message || "Failed to place trade");
      return { success: false, error: err.message || "Failed to place trade" };
    } finally {
      setPlacing(false);
    }
  };

  // Expose trades corresponding to currently selected account
  const activeOpenTrades = accountType === "demo" ? demoOpenTrades : realOpenTrades;
  const activeClosedTrades = accountType === "demo" ? demoClosedTrades : realClosedTrades;

  return (
    <TradesContext.Provider
      value={{
        openTrades: activeOpenTrades,
        closedTrades: activeClosedTrades,
        loading: accountType === "real" ? loading : false,
        placing,
        error,
        placeTrade,
        refetch: accountType === "real" ? fetchAll : async () => {},
        clearDemoHistory,
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
