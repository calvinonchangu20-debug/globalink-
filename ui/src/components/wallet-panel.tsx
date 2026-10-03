import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useWallet, type Transaction } from "@/hooks/use-wallet"
import {
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  PhoneCall,
  Loader2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Smartphone,
  ChevronRight,
  FlaskConical,
} from "lucide-react"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ─── Account type ─────────────────────────────────────────────────────────────

type AccountType = "demo" | "real"

// ─── Payment Method Modal ─────────────────────────────────────────────────────

type PaymentStep = "method" | "form" | "pending" | "success" | "error"

const PAYMENT_METHODS = [
  {
    id: "mpesa",
    label: "M-Pesa",
    description: "STK push to your Safaricom number",
    icon: Smartphone,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    disabled: false as boolean,
  },
  {
    id: "card",
    label: "Debit / Credit Card",
    description: "Visa, Mastercard (coming soon)",
    icon: CreditCard,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    disabled: true as boolean,
  },
] as const

type MethodId = (typeof PAYMENT_METHODS)[number]["id"]

function PaymentModal({ onClose }: { onClose: () => void }) {
  const { wallet, deposit } = useWallet()

  const [step, setStep] = useState<PaymentStep>("method")
  const [method, setMethod] = useState<MethodId | null>(null)

  // M-Pesa form state
  const [amount, setAmount] = useState("")
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [exchangeRate, setExchangeRate] = useState<number>(130) // fallback

  useEffect(() => {
    if (step === "form") {
      fetch(`${API_BASE}/api/payments/exchange-rate`)
        .then(res => res.json())
        .then(data => data.rate && setExchangeRate(data.rate))
        .catch(() => {})
    }
  }, [step])

  const quickAmounts = [10, 20, 50, 100, 200, 500]
  const kesAmount = amount ? Math.floor(parseFloat(amount) * exchangeRate) : 0

  function selectMethod(id: MethodId) {
    setMethod(id)
    setStep("form")
  }

  async function handleDeposit() {
    const amt = parseFloat(amount)
    if (!amt || amt < 10) {
      setMessage("Minimum deposit is $10")
      return
    }
    setStep("pending")
    setMessage("")

    const result = await deposit(amt, phone || undefined)
    if (result.success) {
      setStep("success")
      setMessage(result.message)
      setExpiresAt(result.expiresAt ?? null)
    } else {
      setStep("error")
      setMessage(result.message)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500/10 p-1.5 rounded-lg">
              <ArrowDownToLine className="h-4 w-4 text-emerald-500" />
            </div>
            <h2 className="font-semibold text-base">
              {step === "method" ? "Choose Payment Method" : "Deposit via M-Pesa"}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {step === "form" && (
              <button
                onClick={() => setStep("method")}
                className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-muted transition-colors"
              >
                ← Back
              </button>
            )}
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground rounded-full p-1 hover:bg-muted transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Current Balance */}
          {wallet && (
            <div className="bg-muted/50 rounded-lg px-4 py-2.5 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Current Balance</span>
              <span className="font-semibold text-sm">
                ${wallet.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Step: Choose payment method */}
          {step === "method" && (
            <div className="space-y-2">
              {PAYMENT_METHODS.map((pm) => (
                <button
                  key={pm.id}
                  disabled={pm.disabled}
                  onClick={() => !pm.disabled && selectMethod(pm.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all
                    ${pm.disabled
                      ? "opacity-40 cursor-not-allowed bg-muted/30"
                      : "hover:border-emerald-500/50 hover:bg-emerald-500/5 cursor-pointer active:scale-[0.98]"
                    }`}
                >
                  <div className={`${pm.bg} p-2 rounded-lg shrink-0`}>
                    <pm.icon className={`h-5 w-5 ${pm.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{pm.label}</div>
                    <div className="text-xs text-muted-foreground">{pm.description}</div>
                  </div>
                  {!pm.disabled && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  {pm.disabled && (
                    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
                      Soon
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Step: M-Pesa form */}
          {step === "form" && method === "mpesa" && (
            <>
              {/* Quick amounts */}
              <div>
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2 block">
                  Quick Select (USD)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {quickAmounts.map((q) => (
                    <button
                      key={q}
                      onClick={() => setAmount(String(q))}
                      className={`py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        amount === String(q)
                          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      ${q.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom amount */}
              <div>
                <div className="flex justify-between items-end mb-1.5">
                  <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block">
                    Amount (USD)
                  </label>
                  {amount && kesAmount > 0 && (
                    <span className="text-[10px] text-emerald-600 font-medium">≈ KES {kesAmount.toLocaleString()}</span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                    $
                  </span>
                  <input
                    type="number"
                    min="10"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="10.00"
                    className="w-full bg-muted border rounded-md pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Phone number (optional override) */}
              <div>
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">
                  M-Pesa Phone{" "}
                  <span className="font-normal normal-case text-muted-foreground/60">(leave blank to use account phone)</span>
                </label>
                <div className="relative">
                  <PhoneCall className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07xx xxx xxx"
                    className="w-full bg-muted border rounded-md pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>

              {message && (
                <p className="text-xs text-red-500 bg-red-500/10 rounded-md px-3 py-2">{message}</p>
              )}

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                onClick={handleDeposit}
                disabled={!amount}
              >
                Send M-Pesa Prompt
              </Button>
            </>
          )}

          {/* Pending state */}
          {step === "pending" && (
            <div className="py-6 flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-emerald-500/10 animate-ping" />
                <div className="bg-emerald-500/10 p-4 rounded-full relative">
                  <PhoneCall className="h-8 w-8 text-emerald-500" />
                </div>
              </div>
              <div>
                <p className="font-semibold">Check Your Phone</p>
                <p className="text-sm text-muted-foreground mt-1">
                  An M-Pesa prompt has been sent. Enter your PIN to confirm the deposit.
                </p>
              </div>
              <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
            </div>
          )}

          {/* Success state */}
          {step === "success" && (
            <div className="py-6 flex flex-col items-center gap-4 text-center">
              <div className="bg-emerald-500/10 p-4 rounded-full">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <div>
                <p className="font-semibold">Prompt Sent!</p>
                <p className="text-sm text-muted-foreground mt-1">{message}</p>
                {expiresAt && (
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Expires at {new Date(expiresAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          )}

          {/* Error state */}
          {step === "error" && (
            <div className="py-6 flex flex-col items-center gap-4 text-center">
              <div className="bg-red-500/10 p-4 rounded-full">
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-red-600 dark:text-red-400">Deposit Failed</p>
                <p className="text-sm text-muted-foreground mt-1">{message}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("form")}>
                  Try Again
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Transaction Row ───────────────────────────────────────────────────────────

function TxRow({ tx }: { tx: Transaction }) {
  const isCredit = tx.direction === "credit"
  const statusIcon = {
    completed: <CheckCircle2 className="h-3 w-3 text-emerald-500" />,
    pending: <Clock className="h-3 w-3 text-amber-500" />,
    failed: <XCircle className="h-3 w-3 text-red-500" />,
    reversed: <XCircle className="h-3 w-3 text-muted-foreground" />,
  }[tx.status]

  const typeLabel: Record<string, string> = {
    mpesa_stk: "STK Push",
    mpesa_c2b: "Paybill",
    withdrawal: "Withdrawal",
    adjustment: "Adjustment",
  }

  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={`p-1.5 rounded-full shrink-0 ${
            isCredit ? "bg-emerald-500/10" : "bg-red-500/10"
          }`}
        >
          <ArrowDownToLine
            className={`h-3 w-3 ${
              isCredit
                ? "text-emerald-500"
                : "text-red-500 rotate-180"
            }`}
          />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium truncate">{typeLabel[tx.type] ?? tx.type}</span>
            {statusIcon}
          </div>
          <span className="text-[10px] text-muted-foreground">
            {new Date(tx.createdAt).toLocaleDateString("en-KE", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
      <span
        className={`text-xs font-semibold shrink-0 ml-2 ${
          isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
        }`}
      >
        {isCredit ? "+" : "−"}$ {tx.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </span>
    </div>
  )
}

// ─── Wallet Panel (for left sidebar "Transactions" tab) ───────────────────────

export function WalletPanel() {
  const { wallet, loading, error, refetch } = useWallet()
  const [showAll, setShowAll] = useState(false)
  const [showDeposit, setShowDeposit] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)

  // Show completed and pending transactions
  const txList = wallet?.transactions ?? []
  const displayed = showAll ? txList : txList.slice(0, 5)

  return (
    <div className="flex flex-col gap-3">
      {showDeposit && <PaymentModal onClose={() => setShowDeposit(false)} />}
      {showWithdraw && <WithdrawModal onClose={() => setShowWithdraw(false)} />}

      {/* Quick Action Wallet Controls */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-xl border">
        <Button
          size="sm"
          onClick={() => setShowDeposit(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 gap-1.5 shadow-xs"
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
          Deposit
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowWithdraw(true)}
          className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500 font-semibold text-xs h-8 gap-1.5 shadow-xs"
        >
          <ArrowUpFromLine className="h-3.5 w-3.5" />
          Withdraw
        </Button>
      </div>

      {error && (
        <div className="text-xs text-red-500 bg-red-500/10 rounded-md px-3 py-2 flex items-center gap-2">
          <XCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Transactions
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={refetch}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </button>
            {txList.length > 0 && (
              <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                {txList.length}
              </span>
            )}
          </div>
        </div>

        {loading && !wallet ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-6">
            <Wallet className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No transactions yet</p>
          </div>
        ) : (
          <div>
            {displayed.map((tx) => (
              <TxRow key={tx.id} tx={tx} />
            ))}
            {txList.length > 5 && (
              <button
                onClick={() => setShowAll((p) => !p)}
                className="w-full mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                {showAll ? (
                  <>Show less <ChevronUp className="h-3 w-3" /></>
                ) : (
                  <>Show {txList.length - 5} more <ChevronDown className="h-3 w-3" /></>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Account Balance Badge (Demo / Real switcher + balance display) ───────────

export function BalanceBadge() {
  const { wallet, loading } = useWallet()
  const [accountType, setAccountType] = useState<AccountType>("real")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const demoBalance = 10000 // fixed demo balance

  const displayBalance =
    accountType === "demo"
      ? demoBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })
      : (wallet?.balance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`${accountType === "demo" ? "Demo" : "Real"} Balance: $${displayBalance} (Click to switch)`}
        className={`flex items-center gap-1 sm:gap-1.5 text-white text-xs font-semibold px-2 sm:px-2.5 h-8 rounded-md transition-colors shrink-0
          ${accountType === "demo"
            ? "bg-amber-500 hover:bg-amber-600"
            : "bg-emerald-600 hover:bg-emerald-700"
          }`}
      >
        {accountType === "demo" ? (
          <FlaskConical className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Wallet className="h-3.5 w-3.5 shrink-0" />
        )}
        {loading && accountType === "real" && !wallet ? (
          <span className="hidden sm:inline text-[11px]">...</span>
        ) : (
          <span className="hidden sm:inline text-[11px] sm:text-xs font-mono font-bold">${displayBalance}</span>
        )}
        <span className={`text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded
          ${accountType === "demo" ? "bg-amber-400/40" : "bg-emerald-500/40"}`}>
          {accountType === "demo" ? "DEMO" : "REAL"}
        </span>
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-card border rounded-xl shadow-xl overflow-hidden z-50">
          <div className="px-3 py-2 border-b">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Switch Account</p>
          </div>
          {/* Real account option */}
          <button
            onClick={() => { setAccountType("real"); setOpen(false) }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted transition-colors
              ${accountType === "real" ? "bg-emerald-500/5" : ""}`}
          >
            <div className="bg-emerald-500/10 p-1.5 rounded-md">
              <Wallet className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold">Real Account</span>
                {accountType === "real" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                ${(wallet?.balance ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </button>

          {/* Demo account option */}
          <button
            onClick={() => { setAccountType("demo"); setOpen(false) }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted transition-colors
              ${accountType === "demo" ? "bg-amber-500/5" : ""}`}
          >
            <div className="bg-amber-500/10 p-1.5 rounded-md">
              <FlaskConical className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold">Demo Account</span>
                {accountType === "demo" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                ${demoBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })} (virtual)
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Deposit Button (opens centered payment method modal) ─────────────────────

export function DepositButton() {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      {showModal && <PaymentModal onClose={() => setShowModal(false)} />}
      <Button
        size="sm"
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 h-8 px-2.5 sm:px-3 text-xs shrink-0 shadow-sm transition-colors active:scale-95"
        onClick={() => setShowModal(true)}
        title="Deposit Funds"
      >
        <ArrowDownToLine className="h-3.5 w-3.5 shrink-0" />
        <span className="font-semibold text-xs">Deposit</span>
      </Button>
    </>
  )
}

// ─── Withdraw Modal (B2C Payout to M-Pesa) ───────────────────────────────────

export function WithdrawModal({ onClose }: { onClose: () => void }) {
  const { wallet, withdraw } = useWallet()
  const [step, setStep] = useState<"form" | "pending" | "success" | "error">("form")
  const [amount, setAmount] = useState("")
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [exchangeRate, setExchangeRate] = useState<number>(130)
  const [minWithdrawal, setMinWithdrawal] = useState<number>(5)

  useEffect(() => {
    fetch(`${API_BASE}/api/payments/config`)
      .then((res) => res.json())
      .then((data) => {
        if (data.rate) setExchangeRate(data.rate)
        if (typeof data.minWithdrawalUSD === "number") setMinWithdrawal(data.minWithdrawalUSD)
      })
      .catch(() => {
        fetch(`${API_BASE}/api/payments/exchange-rate`)
          .then((res) => res.json())
          .then((data) => {
            if (data.rate) setExchangeRate(data.rate)
            if (typeof data.minWithdrawalUSD === "number") setMinWithdrawal(data.minWithdrawalUSD)
          })
          .catch(() => {})
      })
  }, [])

  const currentBal = wallet?.balance ?? 0
  const baseQuick = [10, 25, 50, 100]
  const quickAmounts = Array.from(new Set([minWithdrawal, ...baseQuick]))
    .filter((q) => q >= minWithdrawal)
    .sort((a, b) => a - b)
    .slice(0, 4)
  const numAmount = parseFloat(amount) || 0
  const kesAmount = Math.floor(numAmount * exchangeRate)

  async function handleWithdraw() {
    if (!numAmount || numAmount < minWithdrawal) {
      setMessage(`Minimum withdrawal is $${minWithdrawal.toFixed(2)} USD`)
      return
    }
    if (numAmount > currentBal) {
      setMessage(`Amount exceeds available balance ($${currentBal.toFixed(2)})`)
      return
    }

    setStep("pending")
    setMessage("")

    const result = await withdraw(numAmount, phone.trim() || undefined)
    if (result.success) {
      setStep("success")
      setMessage(result.message)
    } else {
      setStep("error")
      setMessage(result.message)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <div className="bg-amber-500/10 p-1.5 rounded-lg">
              <ArrowUpFromLine className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <h2 className="font-semibold text-base leading-tight">Withdraw to M-Pesa</h2>
              <span className="text-[10px] text-muted-foreground">Instant B2C Payout to Safaricom</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-full p-1 hover:bg-muted transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Current Balance card */}
          <div className="bg-muted/50 rounded-xl p-3 flex justify-between items-center border">
            <div>
              <span className="text-[10px] text-muted-foreground block uppercase tracking-wider font-semibold">Available Balance</span>
              <span className="font-bold text-base font-mono text-emerald-600 dark:text-emerald-400">
                ${currentBal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground block uppercase tracking-wider font-semibold">Rate</span>
              <span className="text-xs font-semibold text-foreground font-mono">
                1 USD ≈ KES {exchangeRate.toFixed(2)}
              </span>
            </div>
          </div>

          {step === "form" && (
            <>
              {/* Quick presets */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                    Quick Select
                  </label>
                  <button
                    type="button"
                    onClick={() => setAmount(String(currentBal))}
                    disabled={currentBal <= 0}
                    className="text-[11px] font-bold text-amber-500 hover:text-amber-600 transition-colors uppercase tracking-wider disabled:opacity-40"
                  >
                    Max (${currentBal.toFixed(2)})
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {quickAmounts.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={q > currentBal}
                      onClick={() => setAmount(String(q))}
                      className={`py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        amount === String(q)
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400"
                          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                      }`}
                    >
                      ${q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount input */}
              <div>
                <div className="flex justify-between items-end mb-1.5">
                  <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block">
                    Withdraw Amount (USD)
                  </label>
                  {numAmount > 0 && kesAmount > 0 && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 font-bold font-mono">
                      ≈ KES {kesAmount.toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                    $
                  </span>
                  <input
                    type="number"
                    min={minWithdrawal}
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={minWithdrawal.toFixed(2)}
                    className="w-full bg-muted border rounded-md pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-mono"
                  />
                </div>
                <div className="flex justify-between items-center mt-1 text-[10px] text-muted-foreground">
                  <span>Min: ${minWithdrawal.toFixed(2)}</span>
                  <span>M-Pesa B2C tariff may apply</span>
                </div>
              </div>

              {/* Phone number */}
              <div>
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">
                  M-Pesa Phone Number{" "}
                  <span className="font-normal normal-case text-muted-foreground/60">(optional)</span>
                </label>
                <div className="relative">
                  <PhoneCall className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07xx xxx xxx (leave blank for account phone)"
                    className="w-full bg-muted border rounded-md pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
              </div>

              {message && (
                <p className="text-xs text-red-500 bg-red-500/10 rounded-md px-3 py-2">{message}</p>
              )}

              <Button
                onClick={handleWithdraw}
                disabled={!numAmount || numAmount < 5 || numAmount > currentBal}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 shadow-sm transition-transform active:scale-[0.99]"
              >
                Withdraw to M-Pesa
              </Button>
            </>
          )}

          {step === "pending" && (
            <div className="text-center py-6 space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-amber-500 mx-auto" />
              <div>
                <p className="font-semibold text-sm">Processing Withdrawal</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Connecting to Safaricom M-Pesa B2C payout gateway...
                </p>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="text-center py-5 space-y-3">
              <div className="bg-emerald-500/10 text-emerald-500 rounded-full p-3 w-fit mx-auto">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <p className="font-semibold text-base text-emerald-600 dark:text-emerald-400">Withdrawal Initiated!</p>
                <p className="text-xs text-muted-foreground mt-1 px-4">{message}</p>
              </div>
              <Button onClick={onClose} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                Done
              </Button>
            </div>
          )}

          {step === "error" && (
            <div className="text-center py-5 space-y-3">
              <div className="bg-red-500/10 text-red-500 rounded-full p-3 w-fit mx-auto">
                <XCircle className="h-8 w-8" />
              </div>
              <div>
                <p className="font-semibold text-base text-red-600 dark:text-red-400">Withdrawal Failed</p>
                <p className="text-xs text-muted-foreground mt-1 px-4">{message}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setStep("form")}>
                  Try Again
                </Button>
                <Button variant="ghost" size="sm" className="flex-1" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Withdraw Button ─────────────────────────────────────────────────────────

export function WithdrawButton() {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      {showModal && <WithdrawModal onClose={() => setShowModal(false)} />}
      <Button
        size="sm"
        variant="outline"
        className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500 font-semibold gap-1.5 h-8 px-2 sm:px-3 text-xs shrink-0 shadow-xs"
        onClick={() => setShowModal(true)}
        title="Withdraw Funds"
      >
        <ArrowUpFromLine className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden md:inline">Withdraw</span>
      </Button>
    </>
  )
}
