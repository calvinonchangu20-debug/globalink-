import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { useTrades } from "@/hooks/use-trades"
import { useWallet } from "@/hooks/use-wallet"
import { WinModal } from "@/components/win-modal"
import {  Minus, Plus, Target, AlertTriangle, Zap, Square } from "lucide-react"

export type ContractCategory = "even_odd" | "match_differ" | "over_under"

interface TradingPanelProps {
  symbol: string
  isRightOpen?: boolean
  setIsRightOpen?: (open: boolean) => void
  inlineMobile?: boolean
  category?: ContractCategory
}

type Mode = "AUTO" | "MANUAL"
type StakeMode = "stake" | "payout"

export function TradingPanel({ 
  symbol, 
  isRightOpen = false, 
  // setIsRightOpen,
  inlineMobile = false,
  category: externalCategory,
}: TradingPanelProps) {
  const { placeTrade, placing, closedTrades } = useTrades()
  const { refetch: refetchWallet } = useWallet()

  const [mode, setMode] = useState<Mode>("AUTO")
  const category = externalCategory ?? "even_odd"

  const [stakeMode, setStakeMode] = useState<StakeMode>("stake")
  const [stake, setStake] = useState<number>(1)
  const [selectedDigit, setSelectedDigit] = useState<number>(5)
  
  // Bot/Auto Parameters
  const [targetProfit, setTargetProfit] = useState<number>(200)
  const [stopLoss, setStopLoss] = useState<number>(999)
  const [multiplier, setMultiplier] = useState<number>(2)
  const [isBotRunning, setIsBotRunning] = useState<boolean>(false)
  const [botTradeType, setBotTradeType] = useState<"even" | "odd" | "match" | "differ">("even")
  
  // Session tracking
  const [sessionPnL, setSessionPnL] = useState<number>(0)
  const [sessionTrades, setSessionTrades] = useState<number>(0)
  const [sessionWins, setSessionWins] = useState<number>(0)
  const [sessionLosses, setSessionLosses] = useState<number>(0)
  const [showWinModal, setShowWinModal] = useState<boolean>(false)
  const [isStopLossHit, setIsStopLossHit] = useState<boolean>(false)

  const [tradeMessage, setTradeMessage] = useState<{ text: string; type: "success" | "error" } | null>(null)

  const quickChips = [1, 5, 10, 25, 50, 100]
  
  // Dynamic payouts based on contract category
  const payoutMultiplier = category === "match_differ" 
    ? 9.50 // 850% return for Match
    : 1.9522 // 95.22% return for Even/Odd

  const payout = stakeMode === "stake" ? stake * payoutMultiplier : stake
  const currentStake = stakeMode === "stake" ? stake : stake / payoutMultiplier

  const botRunningRef = useRef(isBotRunning)
  botRunningRef.current = isBotRunning

  // Stepper handlers
  const handleDecrement = () => setStake((prev) => Math.max(1, prev - 1))
  const handleIncrement = () => setStake((prev) => prev + 1)

  // Leading-zero sanitizers so inputs don't format as 05, 067 etc.
  const handleNumericInput = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: number) => void
  ) => {
    let val = e.target.value;
    if (/^0+[1-9]/.test(val)) {
      val = val.replace(/^0+/, "");
      e.target.value = val;
    }
    setter(val === "" ? 0 : parseFloat(val) || 0);
  };

  const handleStakeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (/^0+[1-9]/.test(val)) {
      val = val.replace(/^0+/, "");
      e.target.value = val;
    }
    setStake(val === "" ? 0 : parseFloat(val) || 0);
  };

  const handleMultiplierInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (/^0+[1-9]/.test(val)) {
      val = val.replace(/^0+/, "");
      e.target.value = val;
    }
    setMultiplier(val === "" ? 0 : parseFloat(val) || 0);
  };

  // React to closed trades when bot is running or manual trade settles
  const lastProcessedTradeId = useRef<string | null>(null)
  const lastManualPlacedId = useRef<string | null>(null)

  // Single Manual Trade Execution
  const handleExecute = async (selectedType: "even" | "odd" | "match" | "differ" | "over" | "under") => {
    setTradeMessage(null)

    if (currentStake < 1) {
      setTradeMessage({ text: "Minimum stake is $1", type: "error" })
      return
    }

    const res = await placeTrade({
      symbol,
      type: selectedType,
      stake: Number(currentStake.toFixed(2)),
      durationSeconds: 1, // Fast 1-tick resolution
    })

    if (res.success && res.trade) {
      lastManualPlacedId.current = res.trade.id
      refetchWallet()
      setTradeMessage({ text: `Placed ${selectedType.toUpperCase()} order ($${currentStake.toFixed(2)})`, type: "success" })
    } else {
      setTradeMessage({ text: res.error || "Execution failed", type: "error" })
    }
  }

  // Automated Martingale Bot Loop
  const sessionPnLRef = useRef(0)
  const sessionTradesRef = useRef(0)
  const sessionWinsRef = useRef(0)
  const sessionLossesRef = useRef(0)
  const botTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startBot = async (type: "even" | "odd" | "match" | "differ") => {
    if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current)
    
    // Seed lastProcessedTradeId with the latest historical trade so old trades aren't re-processed
    if (closedTrades.length > 0) {
      lastProcessedTradeId.current = closedTrades[0].id
    } else {
      lastProcessedTradeId.current = null
    }

    sessionPnLRef.current = 0
    sessionTradesRef.current = 0
    sessionWinsRef.current = 0
    sessionLossesRef.current = 0

    setBotTradeType(type)
    setIsBotRunning(true)
    botRunningRef.current = true
    setIsStopLossHit(false)
    setSessionPnL(0)
    setSessionTrades(0)
    setSessionWins(0)
    setSessionLosses(0)
    setTradeMessage({ text: `Bot started on ${type.toUpperCase()} (Target: +$${targetProfit}, Stop: -$${stopLoss})`, type: "success" })

    // Instantly place the first trade!
    const firstRes = await placeTrade({
      symbol,
      type,
      stake: Number(stake.toFixed(2)),
      durationSeconds: 1,
    })

    if (!firstRes.success) {
      stopBot(firstRes.error || "Failed starting bot")
    } else {
      refetchWallet()
    }
  }

  const stopBot = (reason?: string, isTargetWin?: boolean, isStopLoss?: boolean) => {
    setIsBotRunning(false)
    botRunningRef.current = false
    if (botTimeoutRef.current) {
      clearTimeout(botTimeoutRef.current)
      botTimeoutRef.current = null
    }
    if (isTargetWin) {
      setIsStopLossHit(false)
      setShowWinModal(true)
    } else if (isStopLoss) {
      setIsStopLossHit(true)
      setShowWinModal(true)
    } else if (reason) {
      setTradeMessage({ text: `Bot stopped: ${reason}`, type: "error" })
    }
  }

  // Listener for trade settlements (for both Bot sessions and Manual trades)
  useEffect(() => {
    if (closedTrades.length === 0) return

    const latest = closedTrades[0]
    if (!latest || latest.id === lastProcessedTradeId.current) return

    // Case 1: Bot is running
    if (isBotRunning) {
      lastProcessedTradeId.current = latest.id

      const isWin = latest.status === "won"
      const multiplierUsed = latest.type === "match" ? 9.50 : (latest.type === "differ" ? 1.056 : 1.9522)
      const profitDelta = isWin ? Number(latest.stake) * (multiplierUsed - 1) : -Number(latest.stake)
      
      sessionPnLRef.current += profitDelta
      sessionTradesRef.current += 1
      if (isWin) {
        sessionWinsRef.current += 1
      } else {
        sessionLossesRef.current += 1
      }

      const currentSessionPnL = sessionPnLRef.current
      setSessionPnL(currentSessionPnL)
      setSessionTrades(sessionTradesRef.current)
      setSessionWins(sessionWinsRef.current)
      setSessionLosses(sessionLossesRef.current)

      // Stop conditions: Stop immediately on any Win, Target Profit, or Stop Loss
      if (isWin || currentSessionPnL >= targetProfit) {
        stopBot(isWin ? `Win achieved (+${profitDelta.toFixed(2)} USD)!` : `Target profit reached!`, true, false)
        return
      }
      if (currentSessionPnL <= -stopLoss) {
        stopBot(`Stop loss hit!`, false, true)
        return
      }

      // Martingale next stake calculation on loss
      const nextStake = Number(latest.stake) * multiplier

      // Schedule next bot trade in 1.2s
      botTimeoutRef.current = setTimeout(() => {
        if (botRunningRef.current) {
          placeTrade({
            symbol,
            type: botTradeType,
            stake: Number(nextStake.toFixed(2)),
            durationSeconds: 1,
          }).then((res) => {
            if (!res.success) {
              stopBot(res.error || "Failed placing bot trade")
            } else {
              refetchWallet()
            }
          })
        }
      }, 1200)
    } 
    // Case 2: Manual single trade settled
    else if (lastManualPlacedId.current === latest.id) {
      lastProcessedTradeId.current = latest.id
      lastManualPlacedId.current = null

      const isWin = latest.status === "won"
      const multiplierUsed = latest.type === "match" ? 9.50 : (latest.type === "differ" ? 1.056 : 1.9522)
      const pnl = isWin ? Number(latest.stake) * (multiplierUsed - 1) : -Number(latest.stake)

      setSessionPnL(pnl)
      setSessionTrades(1)
      setSessionWins(isWin ? 1 : 0)
      setSessionLosses(isWin ? 0 : 1)
      setIsStopLossHit(!isWin)
      setShowWinModal(true)
    }

    return () => {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current)
    }
  }, [closedTrades, isBotRunning])

  const Container = inlineMobile ? "div" : "aside"

  return (
    <>
      <WinModal
        isOpen={showWinModal}
        onClose={() => setShowWinModal(false)}
        sessionPnL={sessionPnL}
        totalTrades={sessionTrades}
        wins={sessionWins}
        losses={sessionLosses}
        isStopLoss={isStopLossHit}
      />

      <Container 
        className={
          inlineMobile 
            ? "w-full bg-card text-foreground flex flex-col p-2 space-y-1.5 font-sans" 
            : `absolute right-0 lg:relative z-20 h-full w-[310px] bg-card text-foreground border-l flex flex-col p-4 shrink-0 overflow-y-auto font-sans transition-transform duration-300 ease-in-out ${isRightOpen ? 'translate-x-0' : 'translate-x-full lg:hidden lg:w-0 lg:border-none lg:p-0 lg:overflow-hidden'}`
        }
      >

        {/* Mode Switcher */}
        <div className="mb-1.5">
          <div className="grid grid-cols-2 bg-muted p-0.5 rounded-lg border">
            <button
              onClick={() => { setMode("AUTO"); if (isBotRunning) stopBot(); }}
              className={`py-1 rounded-md text-xs font-bold transition-all ${
                mode === "AUTO"
                  ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
              }`}
            >
              AUTO
            </button>
            <button
              onClick={() => { setMode("MANUAL"); if (isBotRunning) stopBot(); }}
              className={`py-1 rounded-md text-xs font-bold transition-all ${
                mode === "MANUAL"
                  ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
              }`}
            >
              MANUAL
            </button>
          </div>
        </div>



        {/* Digit Selector Bar (For Match/Differ) */}
        {category === "match_differ" && (
          <div className="mb-3.5 p-2 bg-muted/40 border rounded-lg">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Select Digit</span>
              <span className="text-[10px] font-mono font-bold text-primary">{selectedDigit}</span>
            </div>
            <div className="grid grid-cols-10 gap-1">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <button
                  key={digit}
                  onClick={() => setSelectedDigit(digit)}
                  className={`py-1 rounded text-xs font-bold font-mono transition-colors ${
                    selectedDigit === digit
                      ? "bg-primary text-primary-foreground shadow"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {digit}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stake Amount Section */}
        <div className="mb-2">
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Stake Amount</label>
            <div className="flex bg-muted p-0.5 rounded border">
              <button
                onClick={() => setStakeMode("stake")}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                  stakeMode === "stake" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                Stake
              </button>
              <button
                onClick={() => setStakeMode("payout")}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                  stakeMode === "payout" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                Payout
              </button>
            </div>
          </div>

          {/* Stepper Input */}
          <div className="flex items-center justify-between bg-muted/40 border rounded-lg p-1 mb-1.5">
            <button
              onClick={handleDecrement}
              className="h-7 w-7 rounded flex items-center justify-center bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-primary">$</span>
              <input
                type="number"
                min="1"
                value={stake === 0 ? "" : stake}
                placeholder="1"
                onFocus={(e) => e.target.select()}
                onChange={handleStakeInput}
                onBlur={() => {
                  if (stake < 1) setStake(1);
                }}
                className="bg-transparent text-center font-bold text-base text-foreground w-16 focus:outline-none"
              />
            </div>
            <button
              onClick={handleIncrement}
              className="h-7 w-7 rounded flex items-center justify-center bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Quick Select Chips */}
          <div className="grid grid-cols-6 gap-1">
            {quickChips.map((val) => (
              <button
                key={val}
                onClick={() => setStake(val)}
                className={`py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                  stake === val
                    ? "bg-primary/15 border-primary text-primary"
                    : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                ${val}
              </button>
            ))}
          </div>
        </div>

        {/* Payout readout */}
        <div className="flex justify-between items-center py-1 px-1 mb-1.5 text-xs border-b">
          <span className="text-muted-foreground font-medium">Payout</span>
          <span className="font-bold text-emerald-500 dark:text-emerald-400 font-mono">${payout.toFixed(2)} USD</span>
        </div>

        {/* Risk Grid (Target Profit / Stop Loss / Multiplier) */}
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {/* Target Profit */}
          <div className="bg-muted/40 border rounded-lg p-1.5 flex flex-col justify-between">
            <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tight mb-0.5">
              <Target className="h-3 w-3" /> Target Profit
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">$</span>
              <input
                type="number"
                value={targetProfit === 0 ? "" : targetProfit}
                placeholder="0"
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleNumericInput(e, setTargetProfit)}
                className="w-full bg-transparent text-xs font-bold text-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Stop Loss */}
          <div className="bg-muted/40 border rounded-lg p-1.5 flex flex-col justify-between">
            <div className="flex items-center gap-1 text-[9px] font-bold text-red-600 dark:text-red-400 uppercase tracking-tight mb-0.5">
              <AlertTriangle className="h-3 w-3" /> Stop Loss
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">$</span>
              <input
                type="number"
                value={stopLoss === 0 ? "" : stopLoss}
                placeholder="0"
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleNumericInput(e, setStopLoss)}
                className="w-full bg-transparent text-xs font-bold text-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Multiplier */}
          <div className="bg-muted/40 border rounded-lg p-1.5 flex flex-col justify-between">
            <div className="flex items-center gap-1 text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-tight mb-0.5">
              <Zap className="h-3 w-3" /> Multiplier
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">x</span>
              <input
                type="number"
                step="0.1"
                value={multiplier === 0 ? "" : multiplier}
                placeholder="1"
                onFocus={(e) => e.target.select()}
                onChange={handleMultiplierInput}
                onBlur={() => {
                  if (multiplier <= 0) setMultiplier(1);
                }}
                className="w-full bg-transparent text-xs font-bold text-foreground focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Live Bot Session Status Pill */}
        {mode === "AUTO" && isBotRunning && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-2.5 mb-3 flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <div className="text-[11px] font-bold text-foreground">
                LIVE 1T · {sessionWins}W · {sessionLosses}L
              </div>
            </div>
            <div className={`text-xs font-bold font-mono ${sessionPnL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {sessionPnL >= 0 ? `+$${sessionPnL.toFixed(2)}` : `-$${Math.abs(sessionPnL).toFixed(2)}`}
            </div>
          </div>
        )}

        {tradeMessage && (
          <div className={`text-xs p-2 rounded-md mb-2 flex items-center gap-1.5 ${
            tradeMessage.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
          }`}>
            {tradeMessage.text}
          </div>
        )}

        {/* Action Cards (Bottom) */}
        <div className="mt-auto space-y-2 pt-1">
          {mode === "AUTO" && isBotRunning ? (
            <Button
              onClick={() => stopBot("User clicked Stop")}
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold h-12 flex items-center justify-center gap-2 rounded-xl shadow-lg shadow-amber-500/20"
            >
              <Square className="h-4 w-4 fill-current" /> STOP BOT
            </Button>
          ) : (
            <>
              {category === "even_odd" && (
                <div className="grid grid-cols-2 gap-2">
                  {/* Even Action Button */}
                  <button
                    disabled={placing}
                    onClick={() => (mode === "AUTO" ? startBot("even") : handleExecute("even"))}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] rounded-xl p-2.5 flex items-center justify-between text-white shadow-md transition-all cursor-pointer"
                  >
                    <div className="font-black text-base sm:text-lg text-white">Even</div>
                    <div className="text-right">
                      <div className="text-xs sm:text-sm font-bold font-mono text-emerald-100">${payout.toFixed(2)}</div>
                      <div className="text-[10px] opacity-90 font-bold text-emerald-100">95.22%</div>
                    </div>
                  </button>

                  {/* Odd Action Button */}
                  <button
                    disabled={placing}
                    onClick={() => (mode === "AUTO" ? startBot("odd") : handleExecute("odd"))}
                    className="w-full bg-red-500 hover:bg-red-600 active:scale-[0.98] rounded-xl p-2.5 flex items-center justify-between text-white shadow-md transition-all cursor-pointer"
                  >
                    <div className="font-black text-base sm:text-lg text-white">Odd</div>
                    <div className="text-right">
                      <div className="text-xs sm:text-sm font-bold font-mono text-emerald-300 dark:text-emerald-300">${payout.toFixed(2)}</div>
                      <div className="text-[10px] opacity-90 font-bold text-emerald-300 dark:text-emerald-300">95.22%</div>
                    </div>
                  </button>
                </div>
              )}

              {category === "match_differ" && (
                <div className="grid grid-cols-2 gap-2">
                  {/* Match Action Button */}
                  <button
                    disabled={placing}
                    onClick={() => (mode === "AUTO" ? startBot("match") : handleExecute("match"))}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] rounded-xl p-2.5 flex items-center justify-between text-white shadow-md transition-all cursor-pointer"
                  >
                    <div className="font-black text-sm sm:text-base text-white">Match {selectedDigit}</div>
                    <div className="text-right">
                      <div className="text-xs sm:text-sm font-bold font-mono text-emerald-100">${(stake * 9.5).toFixed(2)}</div>
                      <div className="text-[10px] opacity-90 font-bold text-emerald-100">850%</div>
                    </div>
                  </button>

                  {/* Differ Action Button */}
                  <button
                    disabled={placing}
                    onClick={() => (mode === "AUTO" ? startBot("differ") : handleExecute("differ"))}
                    className="w-full bg-red-500 hover:bg-red-600 active:scale-[0.98] rounded-xl p-2.5 flex items-center justify-between text-white shadow-md transition-all cursor-pointer"
                  >
                    <div className="font-black text-sm sm:text-base text-white">Differ {selectedDigit}</div>
                    <div className="text-right">
                      <div className="text-xs sm:text-sm font-bold font-mono text-emerald-300 dark:text-emerald-300">${(stake * 1.056).toFixed(2)}</div>
                      <div className="text-[10px] opacity-90 font-bold text-emerald-300 dark:text-emerald-300">5.6%</div>
                    </div>
                  </button>
                </div>
              )}

              {category === "over_under" && (
                <div className="grid grid-cols-2 gap-2">
                  {/* Over Action Button */}
                  <button
                    disabled={placing}
                    onClick={() => handleExecute("over")}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] rounded-xl p-2.5 flex items-center justify-between text-white shadow-md transition-all cursor-pointer"
                  >
                    <div className="font-black text-base sm:text-lg text-white">Over 5</div>
                    <div className="text-right">
                      <div className="text-xs sm:text-sm font-bold font-mono text-emerald-100">${(stake * 1.95).toFixed(2)}</div>
                      <div className="text-[10px] opacity-90 font-bold text-emerald-100">95.22%</div>
                    </div>
                  </button>

                  {/* Under Action Button */}
                  <button
                    disabled={placing}
                    onClick={() => handleExecute("under")}
                    className="w-full bg-red-500 hover:bg-red-600 active:scale-[0.98] rounded-xl p-2.5 flex items-center justify-between text-white shadow-md transition-all cursor-pointer"
                  >
                    <div className="font-black text-base sm:text-lg text-white">Under 5</div>
                    <div className="text-right">
                      <div className="text-xs sm:text-sm font-bold font-mono text-emerald-300 dark:text-emerald-300">${(stake * 1.95).toFixed(2)}</div>
                      <div className="text-[10px] opacity-90 font-bold text-emerald-300 dark:text-emerald-300">95.22%</div>
                    </div>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </Container>
    </>
  )
}


