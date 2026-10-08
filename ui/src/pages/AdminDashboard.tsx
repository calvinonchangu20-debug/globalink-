import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { 
  Users, 
  TrendingUp, 
  Activity, 
  ArrowLeft, 
  RefreshCw, 
  ShieldAlert, 
  ShieldCheck,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  SlidersHorizontal,
  Save,
  CheckCircle2,
  Banknote,
  MoreVertical,
  PlusCircle,
  MinusCircle,
  Pencil,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface Metrics {
  users: { total: number };
  trades: {
    total: number;
    open: number;
    won: number;
    lost: number;
    totalVolumeUSD: number;
  };
  finances: {
    totalDepositsUSD: number;
    totalPayoutsUSD: number;
    totalWithdrawalsUSD?: number;
    pendingDeposits: number;
    pendingWithdrawals?: number;
    minWithdrawalUSD?: number;
  };
  system: {
    serverTime: string;
    uptimeSeconds: number;
    nodeMemoryUsageMB: number;
  };
}

interface AdminUser {
  id: string;
  firstName: string;
  secondName: string;
  username: string;
  email: string;
  phoneNumber?: string;
  role: string;
  balance: string;
  createdAt: string;
}

interface AdminTrade {
  id: string;
  userId: string;
  username?: string;
  userEmail?: string;
  symbol: string;
  type: string;
  stake: string;
  payoutMultiplier: string;
  entryPrice: string;
  exitPrice?: string | null;
  status: "open" | "won" | "lost" | "tie" | "refunded";
  createdAt: string;
}

interface AdminTransaction {
  id: string;
  userId: string;
  username?: string;
  userEmail?: string;
  amount: string;
  direction: "credit" | "debit";
  type: string;
  status: string;
  mpesaReceiptNumber?: string;
  phoneNumber?: string;
  description?: string;
  balanceAfter?: string;
  createdAt: string;
}

export default function AdminDashboard() {
  const { user, token } = useAuth();
  const [tab, setTab] = useState<"overview" | "users" | "trades" | "finances" | "settings">("overview");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [tradesList, setTradesList] = useState<AdminTrade[]>([]);
  const [txList, setTxList] = useState<AdminTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings State
  const [minWithdrawalSetting, setMinWithdrawalSetting] = useState<number>(5);
  const [inputMinWithdrawal, setInputMinWithdrawal] = useState<string>("5.00");
  const hasLoadedInitialSetting = useRef(false);
  const [isSavingSetting, setIsSavingSetting] = useState(false);
  const [settingSuccess, setSettingSuccess] = useState<string | null>(null);
  const [settingError, setSettingError] = useState<string | null>(null);

  const [pendingRoleChange, setPendingRoleChange] = useState<{
    user: AdminUser;
    newRole: "USER" | "ADMIN";
  } | null>(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Action Menu & Balance Edit State
  const [openActionMenuUserId, setOpenActionMenuUserId] = useState<string | null>(null);
  const [selectedUserForBalance, setSelectedUserForBalance] = useState<AdminUser | null>(null);
  const [balanceEditMode, setBalanceEditMode] = useState<"set" | "add" | "subtract">("set");
  const [balanceEditValue, setBalanceEditValue] = useState<string>("");
  const [balanceEditReason, setBalanceEditReason] = useState<string>("");
  const [isUpdatingBalance, setIsUpdatingBalance] = useState<boolean>(false);
  const [balanceModalError, setBalanceModalError] = useState<string | null>(null);
  const [balanceSuccessAlert, setBalanceSuccessAlert] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setOpenActionMenuUserId(null);
      }
    };
    if (openActionMenuUserId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openActionMenuUserId]);

  // Filters State
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"ALL" | "USER" | "ADMIN">("ALL");

  const [tradeSearch, setTradeSearch] = useState("");
  const [tradeStatusFilter, setTradeStatusFilter] = useState<string>("ALL");
  const [tradeSymbolFilter, setTradeSymbolFilter] = useState<string>("ALL");

  const [txSearch, setTxSearch] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState<string>("ALL");
  const [txStatusFilter, setTxStatusFilter] = useState<string>("ALL");

  const fetchAdminData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [resMetrics, resUsers, resTrades, resTx, resSettings] = await Promise.all([
        apiFetch("/api/admin/metrics"),
        apiFetch("/api/admin/users"),
        apiFetch("/api/admin/trades"),
        apiFetch("/api/admin/transactions"),
        apiFetch("/api/admin/settings").catch(() => null),
      ]);

      if (!resMetrics.ok) {
        if (resMetrics.status === 403) {
          setError("Forbidden: You do not have ADMIN privileges.");
        } else {
          setError("Failed to load admin metrics");
        }
        setLoading(false);
        return;
      }

      const [dataMetrics, dataUsers, dataTrades, dataTx] = await Promise.all([
        resMetrics.json(),
        resUsers.json(),
        resTrades.json(),
        resTx.json(),
      ]);

      setMetrics(dataMetrics.metrics);
      setUsersList(dataUsers.users || []);
      setTradesList(dataTrades.trades || []);
      setTxList(dataTx.transactions || []);

      if (resSettings && resSettings.ok) {
        const dataSettings = await resSettings.json();
        if (dataSettings?.settings?.minWithdrawalUSD !== undefined) {
          const val = dataSettings.settings.minWithdrawalUSD;
          setMinWithdrawalSetting(val);
          if (!hasLoadedInitialSetting.current) {
            setInputMinWithdrawal(val.toFixed(2));
            hasLoadedInitialSetting.current = true;
          }
        }
      } else if (dataMetrics?.metrics?.finances?.minWithdrawalUSD !== undefined) {
        const val = dataMetrics.metrics.finances.minWithdrawalUSD;
        setMinWithdrawalSetting(val);
        if (!hasLoadedInitialSetting.current) {
          setInputMinWithdrawal(val.toFixed(2));
          hasLoadedInitialSetting.current = true;
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch admin data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleSaveMinWithdrawal = async (amountToSave?: number) => {
    const val = amountToSave !== undefined ? amountToSave : parseFloat(inputMinWithdrawal);
    if (!Number.isFinite(val) || val <= 0 || val > 1500) {
      setSettingError("Please enter a valid amount between $0.01 and $1,500 USD");
      return;
    }
    setIsSavingSetting(true);
    setSettingError(null);
    setSettingSuccess(null);
    try {
      const res = await apiFetch("/api/admin/settings/withdrawal-limit", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ minWithdrawalUSD: val }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSettingError(data?.error || "Failed to update withdrawal limit");
      } else {
        setMinWithdrawalSetting(data.minWithdrawalUSD);
        setInputMinWithdrawal(data.minWithdrawalUSD.toFixed(2));
        setSettingSuccess(`Saved! Minimum withdrawal is now $${data.minWithdrawalUSD.toFixed(2)} USD`);
        setTimeout(() => setSettingSuccess(null), 3500);
      }
    } catch (err: any) {
      setSettingError(err.message || "Failed to update setting");
    } finally {
      setIsSavingSetting(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
    const interval = setInterval(fetchAdminData, 3000); // 3s polling for real-time monitoring
    return () => clearInterval(interval);
  }, [fetchAdminData]);

  const handleRoleSelectChange = (u: AdminUser, newRole: "USER" | "ADMIN") => {
    if (u.role === newRole) return;
    setPendingRoleChange({ user: u, newRole });
  };

  const handleConfirmRoleChange = async () => {
    if (!token || !pendingRoleChange) return;
    const { user: targetUser, newRole } = pendingRoleChange;
    setIsUpdatingRole(true);
    try {
      const res = await apiFetch(`/api/admin/users/${targetUser.id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setUsersList((prev) =>
          prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u))
        );
        setPendingRoleChange(null);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update role");
      }
    } catch (err) {
      console.error("Failed to update role:", err);
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const openEditBalanceModal = (u: AdminUser, mode: "set" | "add" | "subtract" = "set") => {
    setOpenActionMenuUserId(null);
    setSelectedUserForBalance(u);
    setBalanceEditMode(mode);
    setBalanceEditValue(mode === "set" ? parseFloat(u.balance || "0").toFixed(2) : "");
    setBalanceEditReason("");
    setBalanceModalError(null);
  };

  const handleUpdateBalanceSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!token || !selectedUserForBalance) return;

    const num = parseFloat(balanceEditValue);
    if (!Number.isFinite(num)) {
      setBalanceModalError("Please enter a valid numeric amount");
      return;
    }

    if (balanceEditMode === "set") {
      if (num < 0) {
        setBalanceModalError("Account balance cannot be negative ($0.00 or higher)");
        return;
      }
    } else {
      if (num <= 0) {
        setBalanceModalError(`Amount to ${balanceEditMode === "add" ? "add" : "deduct"} must be greater than $0.00`);
        return;
      }
      if (balanceEditMode === "subtract") {
        const currentBal = parseFloat(selectedUserForBalance.balance || "0");
        if (num > currentBal) {
          setBalanceModalError(`Cannot deduct $${num.toFixed(2)} USD. User only has $${currentBal.toFixed(2)} USD.`);
          return;
        }
      }
    }

    setIsUpdatingBalance(true);
    setBalanceModalError(null);

    try {
      const res = await apiFetch(`/api/admin/users/${selectedUserForBalance.id}/balance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operation: balanceEditMode,
          value: num,
          reason: balanceEditReason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setBalanceModalError(data.error || "Failed to update user balance");
      } else {
        const newBalance = data.user?.balance ?? (
          balanceEditMode === "set"
            ? num.toFixed(2)
            : balanceEditMode === "add"
            ? (parseFloat(selectedUserForBalance.balance || "0") + num).toFixed(2)
            : (parseFloat(selectedUserForBalance.balance || "0") - num).toFixed(2)
        );

        // Update user in usersList immediately
        setUsersList((prev) =>
          prev.map((u) => (u.id === selectedUserForBalance.id ? { ...u, balance: newBalance } : u))
        );

        // Update txList if transaction record returned
        if (data.transaction) {
          setTxList((prev) => [
            {
              ...data.transaction,
              username: selectedUserForBalance.username,
              userEmail: selectedUserForBalance.email,
            },
            ...prev,
          ]);
        }

        const successMsg = `Successfully updated @${selectedUserForBalance.username}'s real balance to $${parseFloat(newBalance).toFixed(2)} USD`;
        setBalanceSuccessAlert(successMsg);
        setTimeout(() => setBalanceSuccessAlert(null), 6000);

        setSelectedUserForBalance(null);
        setBalanceEditValue("");
        setBalanceEditReason("");
        fetchAdminData();
      }
    } catch (err: any) {
      setBalanceModalError(err.message || "Failed to update user balance");
    } finally {
      setIsUpdatingBalance(false);
    }
  };

  if (user?.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-6">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          You must be logged in as an Administrator to view the system monitoring panel.
        </p>
        <Link to="/">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Return to Trading Platform
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Top Admin Header */}
      <header className="border-b bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <img src="/branding/logo-mark.svg" alt="Global Link" className="h-8 w-8 rounded-lg shadow-sm" />
          <div>
            <h1 className="font-bold text-lg flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-500" /> Admin Command & Monitoring Center
            </h1>
            <p className="text-xs text-muted-foreground">
              Real-time platform metrics, user management, and trade flow
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchAdminData} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">
            Live Monitoring
          </span>
        </div>
      </header>

      {error && (
        <div className="bg-red-500/10 border-b border-red-500/20 text-red-500 px-6 py-3 text-sm flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Metric Cards Grid */}
        {metrics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Users</span>
                <Users className="h-4 w-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold">{metrics.users.total.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Registered accounts</p>
            </div>

            <div className="bg-card border rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Trading Volume</span>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold">${metrics.trades.totalVolumeUSD.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.trades.total} total trades ({metrics.trades.open} active)
              </p>
            </div>

            <div className="bg-card border rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Deposits</span>
                <ArrowDownToLine className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl font-bold">${metrics.finances.totalDepositsUSD.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.finances.pendingDeposits} pending STK pushes
              </p>
            </div>

            <div className="bg-card border rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Payouts</span>
                <ArrowUpRight className="h-4 w-4 text-purple-500" />
              </div>
              <div className="text-2xl font-bold">${metrics.finances.totalPayoutsUSD.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Settled winning trades
              </p>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b space-x-4">
          <button
            onClick={() => setTab("overview")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Real-time Activity
          </button>
          <button
            onClick={() => setTab("users")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "users"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Users ({usersList.length})
          </button>
          <button
            onClick={() => setTab("trades")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "trades"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Live Trades ({tradesList.length})
          </button>
          <button
            onClick={() => setTab("finances")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "finances"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Ledger & Deposits ({txList.length})
          </button>
          <button
            onClick={() => setTab("settings")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === "settings"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" /> Platform Settings
          </button>
        </div>

        {/* Tab Contents */}
        {tab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Live Trades Stream */}
            <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-sm flex items-center justify-between">
                <span>Recent Global Trades</span>
                <span className="text-xs text-muted-foreground">Last {tradesList.slice(0, 5).length} trades</span>
              </h3>
              <div className="divide-y">
                {tradesList.slice(0, 5).map((tr) => (
                  <div key={tr.id} className="py-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        <span>{tr.username || tr.userEmail || "User"}</span>
                        <span className="text-xs uppercase bg-muted px-1.5 py-0.5 rounded font-mono">
                          {tr.symbol} {tr.type}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Stake: ${tr.stake} | Entry: {tr.entryPrice} {tr.exitPrice ? `→ Exit: ${tr.exitPrice}` : ""}
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                        tr.status === "won"
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          : tr.status === "lost"
                          ? "bg-red-500/10 text-red-500 border border-red-500/20"
                          : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                      }`}
                    >
                      {tr.status}
                    </span>
                  </div>
                ))}
                {tradesList.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">No trades yet.</div>
                )}
              </div>
            </div>

            {/* Live Ledger Activity */}
            <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-sm flex items-center justify-between">
                <span>Recent Transactions & M-Pesa</span>
                <span className="text-xs text-muted-foreground">Last {txList.slice(0, 5).length} events</span>
              </h3>
              <div className="divide-y">
                {txList.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="py-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        <span>{tx.username || tx.userEmail || "User"}</span>
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                          {tx.type}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {tx.description || tx.phoneNumber || "Ledger entry"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${tx.direction === "credit" ? "text-emerald-500" : "text-foreground"}`}>
                        {tx.direction === "credit" ? "+" : "-"}${tx.amount}
                      </div>
                      <span className="text-[10px] text-muted-foreground uppercase">{tx.status}</span>
                    </div>
                  </div>
                ))}
                {txList.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">No transactions recorded yet.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "users" && (() => {
          const filteredUsers = usersList.filter((u) => {
            const matchesSearch = 
              u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
              u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
              `${u.firstName} ${u.secondName}`.toLowerCase().includes(userSearch.toLowerCase()) ||
              (u.phoneNumber && u.phoneNumber.includes(userSearch));
            const matchesRole = userRoleFilter === "ALL" || u.role === userRoleFilter;
            return matchesSearch && matchesRole;
          });

          return (
            <div className="space-y-4">
              {/* Success Notification Alert */}
              {balanceSuccessAlert && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-4 py-3 rounded-xl text-xs flex items-center justify-between shadow-sm animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="font-medium">{balanceSuccessAlert}</span>
                  </div>
                  <button
                    onClick={() => setBalanceSuccessAlert(null)}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Filter Toolbar */}
              <div className="bg-card border rounded-xl p-3.5 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm">
                <div className="w-full sm:w-80 relative">
                  <input
                    type="text"
                    placeholder="Search name, username, email, phone..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full bg-muted/50 border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <span className="text-xs text-muted-foreground font-medium">Role:</span>
                  <select
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value as "ALL" | "USER" | "ADMIN")}
                    className="bg-muted/50 border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="ALL">All Roles</option>
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                  <span className="text-xs text-muted-foreground ml-2">
                    Showing {filteredUsers.length} of {usersList.length}
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="bg-card border rounded-xl overflow-visible shadow-sm min-h-[300px]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 border-b text-xs font-semibold uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Phone</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Balance</th>
                        <th className="px-4 py-3">Registered</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <div className="font-medium">{u.firstName} {u.secondName}</div>
                            <div className="text-xs text-muted-foreground">@{u.username} • {u.email}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{u.phoneNumber || "—"}</td>
                          <td className="px-4 py-3">
                            <select
                              value={u.role}
                              onChange={(e) => handleRoleSelectChange(u, e.target.value as "USER" | "ADMIN")}
                              className={`text-xs px-2 py-1 rounded font-medium border bg-transparent cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary ${
                                u.role === "ADMIN"
                                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30"
                                  : "border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <option value="USER" className="bg-card text-foreground">USER</option>
                              <option value="ADMIN" className="bg-card text-foreground">ADMIN</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                            ${parseFloat(u.balance || "0").toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(u.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {/* 3-Dot Action Menu Dropdown */}
                            <div
                              className="relative inline-block text-left"
                              ref={openActionMenuUserId === u.id ? actionMenuRef : undefined}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenActionMenuUserId(openActionMenuUserId === u.id ? null : u.id);
                                }}
                                className="h-8 w-8 p-0 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                                title="User actions"
                              >
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                              </Button>

                              {openActionMenuUserId === u.id && (
                                <div className="absolute right-0 mt-1 w-60 rounded-xl bg-card border shadow-xl z-30 py-1.5 animate-in fade-in zoom-in-95 text-left">
                                  <div className="px-3 py-1.5 border-b mb-1">
                                    <p className="text-[11px] font-semibold text-foreground truncate">{u.firstName} {u.secondName}</p>
                                    <p className="text-[10px] text-muted-foreground truncate font-mono">@{u.username} • ${parseFloat(u.balance || "0").toFixed(2)} USD</p>
                                  </div>

                                  {/* Primary Action: Edit Account Balance */}
                                  <button
                                    type="button"
                                    onClick={() => openEditBalanceModal(u, "set")}
                                    className="w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-emerald-500/10 text-foreground transition-colors group cursor-pointer"
                                  >
                                    <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                      <Pencil className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                                        Edit Account Balance
                                      </div>
                                      <div className="text-[10px] text-muted-foreground">Change balance to any value</div>
                                    </div>
                                  </button>

                                  <div className="h-px bg-border my-1" />

                                    {/* View User's Trades */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionMenuUserId(null);
                                        setTradeSearch(u.username);
                                        setTab("trades");
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-muted text-foreground transition-colors cursor-pointer"
                                    >
                                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span>View User Trades</span>
                                    </button>

                                    {/* View User's Ledger Transactions */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionMenuUserId(null);
                                        setTxSearch(u.username);
                                        setTab("finances");
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-muted text-foreground transition-colors cursor-pointer"
                                    >
                                      <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span>View User Transactions</span>
                                    </button>

                                    {/* Quick Role Toggle */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionMenuUserId(null);
                                        handleRoleSelectChange(u, u.role === "ADMIN" ? "USER" : "ADMIN");
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-muted text-foreground transition-colors cursor-pointer"
                                    >
                                      {u.role === "ADMIN" ? (
                                        <>
                                          <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                                          <span>Demote to USER</span>
                                        </>
                                      ) : (
                                        <>
                                          <ShieldCheck className="h-3.5 w-3.5 text-purple-500" />
                                          <span>Promote to ADMIN</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>
                          </td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                            No users match the filter criteria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {tab === "trades" && (() => {
          const uniqueSymbols = Array.from(new Set(tradesList.map((t) => t.symbol)));
          const filteredTrades = tradesList.filter((tr) => {
            const matchesSearch = 
              (tr.username && tr.username.toLowerCase().includes(tradeSearch.toLowerCase())) ||
              (tr.userEmail && tr.userEmail.toLowerCase().includes(tradeSearch.toLowerCase())) ||
              tr.symbol.toLowerCase().includes(tradeSearch.toLowerCase()) ||
              tr.type.toLowerCase().includes(tradeSearch.toLowerCase());
            const matchesStatus = tradeStatusFilter === "ALL" || tr.status === tradeStatusFilter;
            const matchesSymbol = tradeSymbolFilter === "ALL" || tr.symbol === tradeSymbolFilter;
            return matchesSearch && matchesStatus && matchesSymbol;
          });

          return (
            <div className="space-y-4">
              {/* Filter Toolbar */}
              <div className="bg-card border rounded-xl p-3.5 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm">
                <div className="w-full sm:w-80 relative">
                  <input
                    type="text"
                    placeholder="Search trader, symbol, type..."
                    value={tradeSearch}
                    onChange={(e) => setTradeSearch(e.target.value)}
                    className="w-full bg-muted/50 border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                  <span className="text-xs text-muted-foreground font-medium">Status:</span>
                  <select
                    value={tradeStatusFilter}
                    onChange={(e) => setTradeStatusFilter(e.target.value)}
                    className="bg-muted/50 border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="open">Open</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                    <option value="refunded">Refunded</option>
                  </select>

                  <span className="text-xs text-muted-foreground font-medium ml-1">Symbol:</span>
                  <select
                    value={tradeSymbolFilter}
                    onChange={(e) => setTradeSymbolFilter(e.target.value)}
                    className="bg-muted/50 border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="ALL">All Symbols</option>
                    {uniqueSymbols.map((sym) => (
                      <option key={sym} value={sym}>{sym}</option>
                    ))}
                  </select>

                  <span className="text-xs text-muted-foreground ml-2">
                    Showing {filteredTrades.length} of {tradesList.length}
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 border-b text-xs font-semibold uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Trader</th>
                        <th className="px-4 py-3">Contract</th>
                        <th className="px-4 py-3">Stake</th>
                        <th className="px-4 py-3">Entry Price</th>
                        <th className="px-4 py-3">Exit Price</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredTrades.map((tr) => (
                        <tr key={tr.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <div className="font-medium">@{tr.username || "user"}</div>
                            <div className="text-xs text-muted-foreground">{tr.userEmail}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {tr.symbol} • <span className="uppercase font-semibold">{tr.type}</span>
                          </td>
                          <td className="px-4 py-3 font-medium">${tr.stake}</td>
                          <td className="px-4 py-3 font-mono text-xs">{tr.entryPrice}</td>
                          <td className="px-4 py-3 font-mono text-xs">{tr.exitPrice || "—"}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                                tr.status === "won"
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : tr.status === "lost"
                                  ? "bg-red-500/10 text-red-500"
                                  : "bg-blue-500/10 text-blue-500"
                              }`}
                            >
                              {tr.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(tr.createdAt).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                      {filteredTrades.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                            No trades match the filter criteria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {tab === "finances" && (() => {
          const uniqueTypes = Array.from(new Set(txList.map((t) => t.type)));
          const filteredTx = txList.filter((tx) => {
            const matchesSearch = 
              (tx.username && tx.username.toLowerCase().includes(txSearch.toLowerCase())) ||
              (tx.userEmail && tx.userEmail.toLowerCase().includes(txSearch.toLowerCase())) ||
              (tx.mpesaReceiptNumber && tx.mpesaReceiptNumber.toLowerCase().includes(txSearch.toLowerCase())) ||
              (tx.phoneNumber && tx.phoneNumber.includes(txSearch)) ||
              (tx.description && tx.description.toLowerCase().includes(txSearch.toLowerCase()));
            const matchesType = txTypeFilter === "ALL" || tx.type === txTypeFilter;
            const matchesStatus = txStatusFilter === "ALL" || tx.status === txStatusFilter;
            return matchesSearch && matchesType && matchesStatus;
          });

          return (
            <div className="space-y-4">
              {/* Financial Policies & Withdrawal Controls Banner */}
              <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <Banknote className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">Minimum Withdrawal Threshold</h4>
                      <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        ${minWithdrawalSetting.toFixed(2)} USD
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Users must withdraw at least this amount. Configurable anytime in Platform Settings.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTab("settings")}
                  className="gap-1.5 text-xs shrink-0"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Configure Limit
                </Button>
              </div>

              {/* Filter Toolbar */}
              <div className="bg-card border rounded-xl p-3.5 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm">
                <div className="w-full sm:w-80 relative">
                  <input
                    type="text"
                    placeholder="Search receipt, phone, user, description..."
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    className="w-full bg-muted/50 border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                  <span className="text-xs text-muted-foreground font-medium">Type:</span>
                  <select
                    value={txTypeFilter}
                    onChange={(e) => setTxTypeFilter(e.target.value)}
                    className="bg-muted/50 border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="ALL">All Types</option>
                    {uniqueTypes.map((typ) => (
                      <option key={typ} value={typ}>{typ.toUpperCase()}</option>
                    ))}
                  </select>

                  <span className="text-xs text-muted-foreground font-medium ml-1">Status:</span>
                  <select
                    value={txStatusFilter}
                    onChange={(e) => setTxStatusFilter(e.target.value)}
                    className="bg-muted/50 border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                  </select>

                  <span className="text-xs text-muted-foreground ml-2">
                    Showing {filteredTx.length} of {txList.length}
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 border-b text-xs font-semibold uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Receipt / Details</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Balance After</th>
                        <th className="px-4 py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredTx.map((tx) => (
                        <tr key={tx.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <div className="font-medium">@{tx.username || "user"}</div>
                            <div className="text-xs text-muted-foreground">{tx.userEmail}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs uppercase">{tx.type}</td>
                          <td className={`px-4 py-3 font-semibold ${tx.direction === "credit" ? "text-emerald-500" : "text-foreground"}`}>
                            {tx.direction === "credit" ? "+" : "-"}${tx.amount}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <div className="font-mono">{tx.mpesaReceiptNumber || "—"}</div>
                            <div className="text-muted-foreground truncate max-w-xs">{tx.description}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 rounded bg-muted font-medium uppercase">
                              {tx.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {tx.balanceAfter ? `$${tx.balanceAfter}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {filteredTx.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                            No transactions match the filter criteria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {tab === "settings" && (
          <div className="max-w-xl">
            <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-3 border-b">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-emerald-500" /> Minimum Withdrawal Limit
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Current:</span>
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    ${minWithdrawalSetting.toFixed(2)} USD
                  </span>
                </div>
              </div>

              {/* Status alerts */}
              {settingSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{settingSuccess}</span>
                </div>
              )}

              {settingError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-xs flex items-center gap-2 animate-in fade-in">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{settingError}</span>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveMinWithdrawal();
                }}
                className="space-y-4"
              >
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Amount (USD)
                  </label>
                  <div className="relative max-w-xs">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold font-mono">
                      $
                    </span>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      max="1500"
                      value={inputMinWithdrawal}
                      onChange={(e) => setInputMinWithdrawal(e.target.value)}
                      className="w-full bg-muted/40 border rounded-lg pl-8 pr-16 py-2.5 text-sm font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                      placeholder="5.00"
                      required
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">
                      USD
                    </span>
                  </div>
                </div>

                {/* Quick Presets (Clicking sets input without auto-saving) */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Quick Presets
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[5, 10, 15, 20, 25, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setInputMinWithdrawal(preset.toFixed(2))}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          parseFloat(inputMinWithdrawal) === preset
                            ? "bg-primary text-primary-foreground border-primary font-bold"
                            : "bg-muted/30 border-border hover:bg-muted text-foreground"
                        }`}
                      >
                        ${preset}.00
                      </button>
                    ))}
                  </div>
                </div>

                {/* Save Button */}
                <div className="pt-2 flex items-center gap-3">
                  <Button
                    type="submit"
                    disabled={isSavingSetting || !inputMinWithdrawal || isNaN(parseFloat(inputMinWithdrawal))}
                    className="gap-2 font-semibold"
                  >
                    <Save className="h-4 w-4" />
                    {isSavingSetting ? "Saving..." : "Save"}
                  </Button>
                  {parseFloat(inputMinWithdrawal) !== minWithdrawalSetting && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setInputMinWithdrawal(minWithdrawalSetting.toFixed(2));
                        setSettingError(null);
                      }}
                      className="text-xs text-muted-foreground"
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Role Change Confirmation Modal */}
      {pendingRoleChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-card border rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${pendingRoleChange.newRole === "ADMIN" ? "bg-purple-500/10 text-purple-500" : "bg-amber-500/10 text-amber-500"}`}>
                {pendingRoleChange.newRole === "ADMIN" ? (
                  <ShieldCheck className="h-6 w-6" />
                ) : (
                  <AlertTriangle className="h-6 w-6" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-base">
                  {pendingRoleChange.newRole === "ADMIN" ? "Promote User to Admin" : "Demote Admin to User"}
                </h3>
                <p className="text-xs text-muted-foreground">Action requires confirmation</p>
              </div>
            </div>

            <div className="text-sm bg-muted/50 p-4 rounded-xl space-y-2 border">
              <div>
                <span className="text-muted-foreground text-xs block">Target User:</span>
                <span className="font-semibold">{pendingRoleChange.user.firstName} {pendingRoleChange.user.secondName}</span>
                <span className="text-xs text-muted-foreground ml-1.5">(@{pendingRoleChange.user.username})</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs block">Email Address:</span>
                <span className="font-mono text-xs">{pendingRoleChange.user.email}</span>
              </div>
              <div className="pt-2 border-t text-xs">
                {pendingRoleChange.newRole === "ADMIN" ? (
                  <span className="text-purple-600 dark:text-purple-400 font-medium">
                    ⚠️ This user will gain full access to view all live platform trades, financials, user balances, and system metrics.
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    This user will lose administrative monitoring privileges and will only have access to regular trading.
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setPendingRoleChange(null)}
                disabled={isUpdatingRole}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmRoleChange}
                disabled={isUpdatingRole}
                className={pendingRoleChange.newRole === "ADMIN" ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
              >
                {isUpdatingRole ? "Updating..." : `Confirm ${pendingRoleChange.newRole === "ADMIN" ? "Promotion" : "Demotion"}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Real Balance Modal */}
      {selectedUserForBalance && (() => {
        const activeSelectedUser = usersList.find((u) => u.id === selectedUserForBalance.id) || selectedUserForBalance;
        const currentBal = parseFloat(activeSelectedUser.balance || "0");
        const parsedVal = parseFloat(balanceEditValue);
        const isValidVal = Number.isFinite(parsedVal);

        let projectedBal = currentBal;
        if (isValidVal) {
          if (balanceEditMode === "set") {
            projectedBal = Math.max(0, parsedVal);
          } else if (balanceEditMode === "add") {
            projectedBal = currentBal + Math.max(0, parsedVal);
          } else if (balanceEditMode === "subtract") {
            projectedBal = Math.max(0, currentBal - Math.max(0, parsedVal));
          }
        }
        const delta = projectedBal - currentBal;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-card border rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
                    <Pencil className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">Edit Account Balance</h3>
                    <p className="text-xs text-muted-foreground">Change user's real balance to any value (no limitation)</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!isUpdatingBalance) setSelectedUserForBalance(null);
                  }}
                  disabled={isUpdatingBalance}
                  className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* User Information Card */}
              <div className="bg-muted/40 border rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm">
                      {activeSelectedUser.firstName} {activeSelectedUser.secondName}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1.5 font-mono">
                      (@{activeSelectedUser.username})
                    </span>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      activeSelectedUser.role === "ADMIN"
                        ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                        : "bg-muted text-muted-foreground border"
                    }`}
                  >
                    {activeSelectedUser.role}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
                  <span className="text-muted-foreground font-mono truncate max-w-[200px]">
                    {activeSelectedUser.email}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Current Balance:</span>
                    <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      ${currentBal.toFixed(2)} USD
                    </span>
                  </div>
                </div>
              </div>

              {/* Mode Selector Tabs */}
              <div className="grid grid-cols-3 gap-1.5 bg-muted/50 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setBalanceEditMode("set");
                    setBalanceEditValue(currentBal.toFixed(2));
                    setBalanceModalError(null);
                  }}
                  disabled={isUpdatingBalance}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                    balanceEditMode === "set"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Set Exact
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBalanceEditMode("add");
                    setBalanceEditValue("");
                    setBalanceModalError(null);
                  }}
                  disabled={isUpdatingBalance}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    balanceEditMode === "add"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <PlusCircle className="h-3 w-3" />
                  <span>Add (+)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBalanceEditMode("subtract");
                    setBalanceEditValue("");
                    setBalanceModalError(null);
                  }}
                  disabled={isUpdatingBalance}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    balanceEditMode === "subtract"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <MinusCircle className="h-3 w-3" />
                  <span>Deduct (-)</span>
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleUpdateBalanceSubmit} className="space-y-4">
                {/* Amount Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>
                      {balanceEditMode === "set"
                        ? "New Account Balance (USD) *"
                        : balanceEditMode === "add"
                        ? "Amount to Add (USD) *"
                        : "Amount to Deduct (USD) *"}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-normal">
                      {balanceEditMode === "set"
                        ? "Any amount ($0.00+)"
                        : balanceEditMode === "add"
                        ? "No upper limitation"
                        : `Max $${currentBal.toFixed(2)}`}
                    </span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground font-bold font-mono">
                      $
                    </div>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={balanceEditValue}
                      onChange={(e) => {
                        setBalanceEditValue(e.target.value);
                        setBalanceModalError(null);
                      }}
                      disabled={isUpdatingBalance}
                      autoFocus
                      className="w-full bg-muted/50 border rounded-xl pl-8 pr-4 py-2.5 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>

                  {/* Preset Shortcuts */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-muted-foreground mr-1">Presets:</span>
                    {balanceEditMode === "set" && (
                      <>
                        {[0, 50, 100, 500, 1000, 5000, 10000, 50000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              setBalanceEditValue(preset.toFixed(2));
                              setBalanceModalError(null);
                            }}
                            disabled={isUpdatingBalance}
                            className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 border transition-colors cursor-pointer"
                          >
                            ${preset === 0 ? "0.00" : preset.toLocaleString()}
                          </button>
                        ))}
                      </>
                    )}
                    {balanceEditMode === "add" && (
                      <>
                        {[10, 50, 100, 500, 1000, 5000, 10000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              const cur = parseFloat(balanceEditValue) || 0;
                              setBalanceEditValue((cur + preset).toFixed(2));
                              setBalanceModalError(null);
                            }}
                            disabled={isUpdatingBalance}
                            className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 border transition-colors cursor-pointer"
                          >
                            +${preset.toLocaleString()}
                          </button>
                        ))}
                      </>
                    )}
                    {balanceEditMode === "subtract" && (
                      <>
                        {[10, 50, 100, 500].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              const cur = parseFloat(balanceEditValue) || 0;
                              setBalanceEditValue((cur + preset).toFixed(2));
                              setBalanceModalError(null);
                            }}
                            disabled={isUpdatingBalance}
                            className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 border transition-colors cursor-pointer"
                          >
                            -${preset}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setBalanceEditValue(currentBal.toFixed(2));
                            setBalanceModalError(null);
                          }}
                          disabled={isUpdatingBalance}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors cursor-pointer"
                        >
                          Clear All (${currentBal.toFixed(2)})
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Real-time Calculation Summary Card */}
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-xs space-y-1.5">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Current Real Balance:</span>
                    <span className="font-mono">${currentBal.toFixed(2)} USD</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="text-muted-foreground">Balance Adjustment:</span>
                    <span className={`font-mono ${delta > 0 ? "text-emerald-500" : delta < 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                      {delta > 0 ? `+$${delta.toFixed(2)}` : delta < 0 ? `-$${Math.abs(delta).toFixed(2)}` : "$0.00"} USD
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-emerald-500/20 text-sm font-bold">
                    <span className="text-foreground">Projected Real Balance:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono text-base">
                      ${projectedBal.toFixed(2)} USD
                    </span>
                  </div>
                </div>

                {/* Reason / Audit Note */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Reason / Audit Note (Optional)</span>
                    <span className="text-[11px] text-muted-foreground font-normal">Recorded in ledger</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Balance override, deposit correction, bonus, manual adjustment..."
                    value={balanceEditReason}
                    onChange={(e) => setBalanceEditReason(e.target.value)}
                    disabled={isUpdatingBalance}
                    className="w-full bg-muted/50 border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {["Admin balance override", "Promotional Bonus", "Dispute Resolution", "Manual adjustment"].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setBalanceEditReason(tag)}
                        disabled={isUpdatingBalance}
                        className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded bg-muted/60 hover:bg-muted border transition-colors cursor-pointer"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error Message */}
                {balanceModalError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-3 text-xs flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{balanceModalError}</span>
                  </div>
                )}

                {/* Modal Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedUserForBalance(null)}
                    disabled={isUpdatingBalance}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      isUpdatingBalance ||
                      !balanceEditValue ||
                      !Number.isFinite(parseFloat(balanceEditValue))
                    }
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-semibold cursor-pointer"
                  >
                    {isUpdatingBalance ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Pencil className="h-4 w-4" /> Save Balance (${projectedBal.toFixed(2)})
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
