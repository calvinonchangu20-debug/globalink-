import { CheckCircle2, AlertOctagon, Trophy } from "lucide-react"

interface WinModalProps {
  isOpen: boolean
  onClose: () => void
  sessionPnL: number
  totalTrades: number
  wins: number
  losses: number
  isStopLoss?: boolean
}

export function WinModal({ isOpen, onClose, sessionPnL, totalTrades, wins, losses, isStopLoss }: WinModalProps) {
  if (!isOpen) return null

  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0.0"
  const isProfit = sessionPnL >= 0 && !isStopLoss

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card border rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6 text-center text-foreground">
        {/* Icon */}
        <div className={`inline-flex items-center justify-center p-3.5 rounded-2xl mb-4 ${
          isProfit ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"
        }`}>
          {isProfit ? (
            <CheckCircle2 className="h-9 w-9 stroke-[2.5]" />
          ) : (
            <AlertOctagon className="h-9 w-9 stroke-[2.5]" />
          )}
        </div>

        {/* Title */}
        <h2 className={`text-lg font-bold mb-1 flex items-center justify-center gap-1.5 ${
          isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        }`}>
          {isProfit ? (
            <><Trophy className="h-4 w-4" /> Target Profit Reached!</>
          ) : (
            <><AlertOctagon className="h-4 w-4" /> Stop Loss / Loss Reached</>
          )}
        </h2>

        {/* Amount */}
        <div className="text-3xl font-extrabold my-3 tracking-tight">
          <span className={isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
            {isProfit ? `+$${sessionPnL.toFixed(2)}` : `-$${Math.abs(sessionPnL).toFixed(2)}`}
          </span>{" "}
          <span className="text-xs font-semibold text-muted-foreground uppercase">USD</span>
        </div>

        {/* Breakdown Stats */}
        <div className="bg-muted/50 rounded-xl p-3.5 my-4 space-y-2 text-xs border">
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Trades</span>
            <span className="font-bold text-foreground">{totalTrades}</span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span>W / L</span>
            <span className="font-bold">
              <span className="text-emerald-600 dark:text-emerald-400">{wins}</span> / <span className="text-red-600 dark:text-red-400">{losses}</span>
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Win Rate</span>
            <span className="font-bold text-foreground font-mono">{winRate}%</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className={`w-full py-3 font-bold rounded-xl transition-all shadow-lg active:scale-[0.98] ${
            isProfit
              ? "bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-500/20"
              : "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20"
          }`}
        >
          Continue Trading
        </button>
      </div>
    </div>
  )
}
