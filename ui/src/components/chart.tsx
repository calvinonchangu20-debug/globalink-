import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import { init, dispose } from "klinecharts";
import type { Chart as KLineChartType } from "klinecharts";
import { useTheme } from "./theme-provider";
import { VOLATILITY_SYMBOLS, type ChartStyle } from "@/config";
import { AreaChart, LineChart, CandlestickChart } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";
const WS_BASE = import.meta.env.VITE_WS_URL || "ws://localhost:3001";
const GRANULARITY = 1;
const CANDLE_COUNT = 300; // Fetch enough history to scroll, but we will force zoom level to 40 bars

function isDarkTheme(theme: string): boolean {
  return theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export interface ChartHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fitContent: () => void;
}

interface ChartProps {
  symbol: string;
  onSymbolChange?: (symbol: string) => void;
  chartStyle: ChartStyle;
  onChartStyleChange?: (style: ChartStyle) => void;
}

export const Chart = forwardRef<ChartHandle, ChartProps>(function Chart({ symbol, onSymbolChange, chartStyle, onChartStyleChange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<KLineChartType | null>(null);
  const { theme } = useTheme();

  const getThemeOptions = useCallback(() => {
    const dark = isDarkTheme(theme);
    const gridColor = dark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.04)";
    const textColor = dark ? "#888888" : "#333333";
    const crosshairColor = dark ? "#555555" : "#999999";
    
    return {
      grid: {
        horizontal: { color: gridColor },
        vertical: { color: gridColor },
      },
      xAxis: {
        tickText: { color: textColor },
        axisLine: { color: gridColor },
      },
      yAxis: {
        tickText: { color: textColor },
        axisLine: { color: gridColor },
      },
      crosshair: {
        horizontal: { line: { color: crosshairColor }, text: { backgroundColor: crosshairColor } },
        vertical: { line: { color: crosshairColor }, text: { backgroundColor: crosshairColor } },
      },
      candle: {
        type: (chartStyle === "bar" ? "ohlc" : chartStyle === "area" ? "area" : chartStyle === "line" ? "area" : "candle_solid") as any,
        tooltip: {
          showRule: "none" as any, // Disables OHLC legend clutter completely!
        },
        area: {
          lineSize: 2,
          lineColor: "#39FF14",
          value: "close",
          smooth: false,
          backgroundColor: chartStyle === "line" 
            ? "transparent" 
            : dark ? "rgba(57, 255, 20, 0.12)" : "rgba(57, 255, 20, 0.15)",
        }
      }
    };
  }, [theme, chartStyle]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      chartRef.current?.scrollByDistance(50);
    },
    zoomOut: () => {
      chartRef.current?.scrollByDistance(-50);
    },
    fitContent: () => {
      chartRef.current?.resize();
    },
  }));

  // 1. Initialize Chart Engine Once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = init(containerRef.current);
    if (!chart) return;
    
    chartRef.current = chart;
    
    // Set base configurations
    chart.setPeriod({ span: 1, type: 'second' });
    chart.setMaxOffsetLeftDistance(0);
    chart.setMaxOffsetRightDistance(0);
    
    chart.setFormatter({
      formatDate: ({ timestamp, type }) => {
        const d = new Date(timestamp);
        const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
        if (type === 'xAxis') {
          return time;
        }
        const date = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
        return `${date} ${time}`;
      }
    });

    let activeWs: WebSocket | null = null;
    let currentBar: any = null;

    chart.setDataLoader({
      getBars: ({ type, symbol: klineSymbol, callback }) => {
        if (type === 'init') {
          // VERY IMPORTANT: Reset currentBar when symbol changes to prevent race conditions 
          // where the new WebSocket connects before the fetch finishes and merges with the old symbol's price!
          currentBar = null;
          
          const ticker = klineSymbol.ticker;
          const url = `${API_BASE}/api/ticks?symbol=${ticker}&count=${CANDLE_COUNT}`;
          
          fetch(url)
            .then((r) => r.json())
            .then((data) => {
              // PREVENT RACE CONDITION: If the user switched symbols while this fetch was in flight,
              // ignore this data entirely so it doesn't corrupt the new symbol's chart!
              if (chartRef.current?.getSymbol()?.ticker !== ticker) {
                return;
              }

              if (data.ticks) {
                const bars = data.ticks.map((t: any) => ({
                  timestamp: t.time * 1000,
                  open: t.value,
                  high: t.value,
                  low: t.value,
                  close: t.value,
                }));
                if (bars.length > 0) currentBar = { ...bars[bars.length - 1] };
                callback(bars, { forward: false, backward: false });
                
                // Force zoom level AFTER auto-fit completes (50ms buffer for render)
                setTimeout(() => {
                  chart.setBarSpace(20);
                  chart.scrollToRealTime();
                }, 50);
              } else {
                callback([], { forward: false, backward: false });
              }
            })
            .catch((err) => {
              if (chartRef.current?.getSymbol()?.ticker !== ticker) return;
              console.error("[chart] Failed to load data:", err);
              callback([], { forward: false, backward: false });
            });
        } else {
          callback([], { forward: false, backward: false });
        }
      },
      subscribeBar: ({ symbol: klineSymbol, callback }) => {
        const ticker = klineSymbol.ticker;
        activeWs = new WebSocket(`${WS_BASE}/ws/ticks?symbol=${ticker}`);
        
        activeWs.onmessage = (e) => {
          try {
            // PREVENT RACE CONDITION: Ignore ticks from old websockets that haven't fully closed yet
            if (chartRef.current?.getSymbol()?.ticker !== ticker) return;

            const tick = JSON.parse(e.data) as { time: number; value: number };
            if (typeof tick.value !== "number" || typeof tick.time !== "number") return;
            
            const tickTime = tick.time;
            const candleTime = Math.floor(tickTime / GRANULARITY) * GRANULARITY;
            const timestamp = candleTime * 1000;
            
            if (!currentBar || timestamp > currentBar.timestamp) {
              currentBar = {
                timestamp,
                open: tick.value,
                high: tick.value,
                low: tick.value,
                close: tick.value,
              };
            } else {
              currentBar.high = Math.max(currentBar.high, tick.value);
              currentBar.low = Math.min(currentBar.low, tick.value);
              currentBar.close = tick.value;
            }
            
            callback(currentBar);
          } catch (err) {
            console.error("Chart ws error", err);
          }
        };
      },
      unsubscribeBar: () => {
        if (activeWs) {
          activeWs.close();
          activeWs = null;
        }
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && containerRef.current.clientWidth > 0 && containerRef.current.clientHeight > 0) {
        chart.resize();
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (activeWs) activeWs.close();
      if (chartRef.current) {
        dispose(containerRef.current!);
        chartRef.current = null;
      }
    };
  }, []); // Run ONCE on mount

  // 2. React to Symbol Changes (Fast Swapping)
  useEffect(() => {
    if (chartRef.current && symbol) {
      chartRef.current.setSymbol({ ticker: symbol, pricePrecision: 2, volumePrecision: 0 });
    }
  }, [symbol]);

  // 3. React to Style/Theme Changes (Instant)
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setStyles(getThemeOptions());
    }
  }, [theme, getThemeOptions]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />

      {/* In-Chart Floating Index Selection Card (TagOption Style) */}
      {onSymbolChange && (
        <div className="absolute left-2.5 top-2.5 z-20 flex items-center gap-1.5 bg-card/85 backdrop-blur-md border border-border/70 rounded-xl px-2.5 py-1 shadow-md">
          {onChartStyleChange && (
            <button
              onClick={() => {
                const nextStyle = chartStyle === "area" ? "line" : chartStyle === "line" ? "candlestick" : "area";
                onChartStyleChange(nextStyle);
              }}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title={`Chart Style: ${chartStyle}`}
            >
              {chartStyle === "candlestick" ? (
                <CandlestickChart className="w-3.5 h-3.5 text-primary" />
              ) : chartStyle === "line" ? (
                <LineChart className="w-3.5 h-3.5 text-primary" />
              ) : (
                <AreaChart className="w-3.5 h-3.5 text-primary" />
              )}
            </button>
          )}

          <select
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value)}
            className="bg-transparent text-xs font-bold text-foreground cursor-pointer focus:outline-none pr-1"
          >
            <optgroup label="1s Indices">
              {VOLATILITY_SYMBOLS.filter((s) => s.symbol.startsWith("1HZ")).map((s) => (
                <option key={s.symbol} value={s.symbol} className="bg-card text-foreground">
                  {s.shortName}
                </option>
              ))}
            </optgroup>
            <optgroup label="Standard Indices">
              {VOLATILITY_SYMBOLS.filter((s) => s.symbol.startsWith("R_")).map((s) => (
                <option key={s.symbol} value={s.symbol} className="bg-card text-foreground">
                  {s.shortName}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      )}

      {/* Floating Zoom Controls */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex flex-col bg-card/80 backdrop-blur border border-border/80 rounded-lg p-0.5 shadow-md">
        <button
          onClick={() => chartRef.current?.scrollByDistance(50)}
          className="w-7 h-7 flex items-center justify-center text-foreground font-bold hover:bg-muted rounded text-sm transition-colors"
          title="Zoom In"
        >
          +
        </button>
        <div className="w-full h-[1px] bg-border/50" />
        <button
          onClick={() => chartRef.current?.scrollByDistance(-50)}
          className="w-7 h-7 flex items-center justify-center text-foreground font-bold hover:bg-muted rounded text-sm transition-colors"
          title="Zoom Out"
        >
          −
        </button>
      </div>
    </div>
  );
});
