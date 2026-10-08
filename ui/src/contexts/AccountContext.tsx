import React, { createContext, useContext, useState, useCallback } from "react";

export type AccountType = "real" | "demo";

interface AccountContextType {
  accountType: AccountType;
  setAccountType: (type: AccountType) => void;
  demoBalance: number;
  updateDemoBalance: (delta: number) => void;
  resetDemoBalance: () => void;
  isDemo: boolean;
  isReal: boolean;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

const DEMO_BALANCE_STORAGE_KEY = "globalink_demo_balance";
const ACCOUNT_TYPE_STORAGE_KEY = "globalink_account_type";
export const INITIAL_DEMO_BALANCE = 10000;

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [accountType, setAccountTypeState] = useState<AccountType>(() => {
    try {
      const stored = localStorage.getItem(ACCOUNT_TYPE_STORAGE_KEY);
      if (stored === "demo" || stored === "real") return stored;
    } catch {}
    return "real";
  });

  const [demoBalance, setDemoBalanceState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(DEMO_BALANCE_STORAGE_KEY);
      if (stored) {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      }
    } catch {}
    return INITIAL_DEMO_BALANCE;
  });

  const setAccountType = useCallback((type: AccountType) => {
    setAccountTypeState(type);
    try {
      localStorage.setItem(ACCOUNT_TYPE_STORAGE_KEY, type);
    } catch {}
  }, []);

  const updateDemoBalance = useCallback((delta: number) => {
    setDemoBalanceState((prev) => {
      const next = Math.max(0, Number((prev + delta).toFixed(2)));
      try {
        localStorage.setItem(DEMO_BALANCE_STORAGE_KEY, next.toString());
      } catch {}
      return next;
    });
  }, []);

  const resetDemoBalance = useCallback(() => {
    setDemoBalanceState(INITIAL_DEMO_BALANCE);
    try {
      localStorage.setItem(DEMO_BALANCE_STORAGE_KEY, INITIAL_DEMO_BALANCE.toString());
    } catch {}
  }, []);

  return (
    <AccountContext.Provider
      value={{
        accountType,
        setAccountType,
        demoBalance,
        updateDemoBalance,
        resetDemoBalance,
        isDemo: accountType === "demo",
        isReal: accountType === "real",
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error("useAccount must be used within an AccountProvider");
  }
  return ctx;
}
