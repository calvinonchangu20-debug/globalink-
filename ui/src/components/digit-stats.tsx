import { useEffect, useState, useRef } from "react"

interface DigitStatsProps {
  symbol: string
}

export function DigitStats({ symbol }: DigitStatsProps) {
  const [ticks, setTicks] = useState<number[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    // Reset ticks when symbol changes
    setTicks([])

    const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:3001";
    const ws = new WebSocket(`${wsUrl}/ws/ticks?symbol=${symbol}`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { time: number; value: number }
        if (typeof data.value !== "number") return;
        // Extract last digit. Using toFixed(2) as a default heuristic
        const priceStr = data.value.toFixed(2)
        const lastChar = priceStr[priceStr.length - 1]
        const digit = parseInt(lastChar, 10)

        setTicks((prev) => {
          const next = [...prev, digit]
          if (next.length > 100) return next.slice(next.length - 100)
          return next
        })
      } catch (err) {
        console.error("Digit stats ws error", err)
      }
    }

    return () => {
      ws.close()
    }
  }, [symbol])

  // Calculate stats
  const counts = new Array(10).fill(0)
  ticks.forEach((d) => counts[d]++)
  
  const total = ticks.length > 0 ? ticks.length : 1
  const percentages = counts.map((c) => (c / total) * 100)
  
  const maxPercent = Math.max(...percentages)
  const minPercent = ticks.length >= 100 ? Math.min(...percentages) : -1 // Only show min if we have enough data

  const lastDigit = ticks.length > 0 ? ticks[ticks.length - 1] : null

  return (
    <div className="flex items-center justify-between w-full px-1 py-1 sm:py-2 gap-0.5 sm:gap-2">
      {percentages.map((pct, i) => {
        const isMax = pct === maxPercent && ticks.length > 0
        const isMin = pct === minPercent && ticks.length >= 100
        const isLast = lastDigit === i

        // Colors
        const textColor = isMax 
          ? "text-teal-600 dark:text-teal-400 font-bold" 
          : isMin 
            ? "text-red-600 dark:text-red-500 font-bold" 
            : "text-muted-foreground"
            
        const activeStrokeClass = isMax 
          ? "stroke-teal-500 dark:stroke-teal-400" 
          : isMin 
            ? "stroke-red-500 dark:stroke-red-500" 
            : "stroke-slate-300 dark:stroke-slate-700"
            
        const bgStrokeClass = "stroke-slate-100 dark:stroke-slate-800"

        // Circle math using viewBox 0 0 36 36
        const radius = 15
        const circumference = 2 * Math.PI * radius
        const offset = circumference - (pct / 100) * circumference

        return (
          <div key={i} className="flex flex-col items-center relative flex-1 min-w-0">
            <div className="relative w-8 h-8 xs:w-9 xs:h-9 sm:w-11 sm:h-11 flex items-center justify-center">
              {/* SVG Circular Progress */}
              <svg viewBox="0 0 36 36" className="absolute inset-0 w-full h-full transform -rotate-90">
                {/* Background Track */}
                <circle
                  cx="18"
                  cy="18"
                  r={radius}
                  strokeWidth="3"
                  fill="transparent"
                  className={bgStrokeClass}
                />
                {/* Progress Arc */}
                <circle
                  cx="18"
                  cy="18"
                  r={radius}
                  strokeWidth="3"
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={ticks.length > 0 ? offset : circumference}
                  className={`transition-all duration-300 ease-in-out ${activeStrokeClass}`}
                />
              </svg>

              {/* Text content */}
              <div className="z-10 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-foreground font-bold text-[11px] sm:text-xs leading-none mb-0.5">{i}</span>
                <span className={`text-[7px] sm:text-[9px] leading-none ${textColor}`}>
                  {ticks.length > 0 ? pct.toFixed(0) : "0"}%
                </span>
              </div>
            </div>

            {/* Last digit indicator triangle */}
            <div
              className={`absolute -bottom-2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-orange-500 transition-opacity ${
                isLast ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        )
      })}
    </div>
  )
}

