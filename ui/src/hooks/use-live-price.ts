import { useState, useEffect, useRef } from "react"

const WS_BASE = import.meta.env.VITE_WS_URL || "ws://localhost:3001"

export function useLivePrice(symbol: string) {
  const [price, setPrice] = useState<number | null>(null)
  const [prevPrice, setPrevPrice] = useState<number | null>(null)
  const [percentageChange, setPercentageChange] = useState<number | null>(null)
  const initialPriceRef = useRef<number | null>(null)

  useEffect(() => {
    setPrice(null)
    setPrevPrice(null)
    setPercentageChange(null)
    initialPriceRef.current = null

    const ws = new WebSocket(`${WS_BASE}/ws/ticks?symbol=${symbol}`)

    ws.onmessage = (e) => {
      try {
        const tick = JSON.parse(e.data) as { time: number; value: number }
        if (typeof tick.value !== "number") return

        setPrice((currentPrice) => {
          if (initialPriceRef.current === null) {
            initialPriceRef.current = tick.value
          }
          
          if (currentPrice !== null && currentPrice !== tick.value) {
            setPrevPrice(currentPrice)
          }

          if (initialPriceRef.current !== null && initialPriceRef.current > 0) {
            const change = ((tick.value - initialPriceRef.current) / initialPriceRef.current) * 100
            setPercentageChange(change)
          }

          return tick.value
        })
      } catch (err) {
        console.error("Live price ws error", err)
      }
    }

    return () => {
      ws.close()
    }
  }, [symbol])

  return { price, prevPrice, percentageChange }
}
