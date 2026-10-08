import { useTrades, type Trade } from "@/hooks/use-trades"
import { useAccount } from "@/contexts/AccountContext"
import { Clock, CheckCircle2, XCircle, RotateCcw, FlaskConical, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

function CountdownTimer({ expiryTime }: { expiryTime: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(0)

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, Math.ceil((new Date(expiryTime).getTime() - Date.now()) / 1000))
      setTimeLeft(diff)
    }
    update()
    const timer = setInterval(update, 500)
    return () => clearInterval(timer)
  }, [expiryTime])

  return (
    <span className="text-xs font-mono font-bold text-amber-500 flex items-center gap-1">
      <Clock className="h-3 w-3 animate-spin" /> {timeLeft}s
    </span>
  )
}

export function PositionsPanel({ type }: { type: "open" | "closed" }) {
  const { openTrades, closedTrades, loading, clearDemoHistory } = useTrades()
  const { isDemo } = useAccount()
  const tradesList = type === "open" ? openTrades : closedTrades

  // Compute closed session stats
  const totalClosed = closedTrades.length
  const totalWins = closedTrades.filter((t) => t.status === "won").length
  const totalLosses = closedTrades.filter((t) => t.status === "lost").length
  const sessionPnL = closedTrades.reduce((acc, t) => {
    if (t.status === "won") {
      return acc + Number(t.stake) * (Number(t.payoutMultiplier) - 1)
    }
    if (t.status === "lost") {
      return acc - Number(t.stake)
    }
    return acc
  }, 0)

  if (loading && tradesList.length === 0) {
    return (
      <div className="space-y-2 py-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Account Mode Header Bar */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50 text-[11px] shrink-0">
        <div className="flex items-center gap-1.5">
          <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] tracking-wide flex items-center gap-1 ${
            isDemo 
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30" 
              : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
          }`}>
            {isDemo ? <><FlaskConical className="h-2.5 w-2.5" /> Demo</> : "Real"}
          </span>
          <span className="text-muted-foreground font-medium capitalize">{type} Trades</span>
        </div>
        {isDemo && type === "closed" && totalClosed > 0 && clearDemoHistory && (
          <button
            type="button"
            onClick={clearDemoHistory}
            className="text-[10px] text-muted-foreground hover:text-red-500 flex items-center gap-1 transition-colors cursor-pointer"
            title="Clear demo trade history"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
        {tradesList.length === 0 ? (
          <div className="text-center py-10">
            <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No {type} positions ({isDemo ? "Demo" : "Real"})</p>
          </div>
        ) : (
          tradesList.map((t: Trade) => {
            const isCall = t.type === "call" || t.type === "even" || t.type === "match"
            const isWin = t.status === "won"
            const isLoss = t.status === "lost"
            const isDemoTrade = t.id.startsWith("demo_")

            return (
              <div key={t.id} className="p-3 bg-muted/40 border border-border rounded-xl flex flex-col gap-1.5 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground">{t.symbol}</span>
                    {isDemoTrade && (
                      <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono">
                        DEMO
                      </span>
                    )}
                    <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                      isCall ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"
                    }`}>
                      {t.type}
                    </span>
                  </div>

                  {type === "open" ? (
                    <CountdownTimer expiryTime={t.expiryTime} />
                  ) : (
                    <span className={`text-xs font-bold flex items-center gap-1 ${
                      isWin ? "text-emerald-600 dark:text-emerald-400" : isLoss ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                    }`}>
                      {isWin && <><CheckCircle2 className="h-3 w-3" /> +${(Number(t.stake) * (Number(t.payoutMultiplier) - 1)).toFixed(2)}</>}
                      {isLoss && <><XCircle className="h-3 w-3" /> -${Number(t.stake).toFixed(2)}</>}
                      {t.status === "tie" && <><RotateCcw className="h-3 w-3" /> Refunded</>}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Entry: <span className="font-mono text-foreground font-medium">{Number(t.entryPrice).toFixed(2)}</span></span>
                  {t.exitPrice && (
                    <span>Exit: <span className="font-mono text-foreground font-medium">{Number(t.exitPrice).toFixed(2)}</span></span>
                  )}
                  <span>Stake: <span className="font-semibold text-foreground">${Number(t.stake).toFixed(2)}</span></span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Persistent Bottom Session Stats Bar */}
      {type === "closed" && totalClosed > 0 && (
        <div className="pt-3 mt-2 border-t border-border flex items-center justify-between text-[11px]">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Last Session</div>
            <div className="text-foreground font-bold">{totalClosed} trades ({totalWins}W / {totalLosses}L)</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Session P/L</div>
            <div className={`font-mono font-bold ${sessionPnL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {sessionPnL >= 0 ? `+$${sessionPnL.toFixed(2)}` : `-$${Math.abs(sessionPnL).toFixed(2)}`} USD
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
