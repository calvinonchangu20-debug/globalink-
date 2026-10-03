import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize, CandlestickChart, LineChart, AreaChart, BarChart } from "lucide-react";
import {
  VOLATILITY_SYMBOLS,
  type ChartStyle,
} from "@/config";

interface ChartControlsProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  chartStyle: ChartStyle;
  onChartStyleChange: (style: ChartStyle) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitContent: () => void;
}

const STYLE_ICONS = {
  candlestick: CandlestickChart,
  line: LineChart,
  area: AreaChart,
  bar: BarChart,
};

const STYLE_LABELS = {
  candlestick: "Candles",
  line: "Line",
  area: "Area",
  bar: "Bars",
};

export function ChartControls({
  symbol,
  onSymbolChange,
  chartStyle,
  onChartStyleChange,
  onZoomIn,
  onZoomOut,
  onFitContent,
}: ChartControlsProps) {
  const currentSymbol = VOLATILITY_SYMBOLS.find((s) => s.symbol === symbol);
  
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const CurrentStyleIcon = STYLE_ICONS[chartStyle];

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-card border-b shrink-0">
      
      {/* Chart Style Dropdown - Far Left */}
      <div className="relative" ref={dropdownRef}>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 relative"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          title={`Chart Type: ${STYLE_LABELS[chartStyle]}`}
        >
          <CurrentStyleIcon className="w-4 h-4" />
        </Button>
        
        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-1 bg-card border rounded shadow-lg z-50 flex flex-col p-1 gap-1 min-w-max">
            {(Object.keys(STYLE_ICONS) as ChartStyle[]).map((style) => {
              const Icon = STYLE_ICONS[style];
              const isSelected = style === chartStyle;
              return (
                <Button
                  key={style}
                  variant={isSelected ? "secondary" : "ghost"}
                  size="icon"
                  className="w-8 h-8"
                  onClick={() => {
                    onChartStyleChange(style);
                    setDropdownOpen(false);
                  }}
                  title={STYLE_LABELS[style]}
                >
                  <Icon className="w-4 h-4" />
                </Button>
              );
            })}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-border mx-1" />

      <select
        value={symbol}
        onChange={(e) => onSymbolChange(e.target.value)}
        className="bg-background border border-border rounded px-3 py-1.5 text-sm font-medium text-foreground cursor-pointer hover:border-muted-foreground/50 transition-colors outline-none focus:ring-1 focus:ring-ring"
      >
        <optgroup label="1s Indices (Fast)">
          {VOLATILITY_SYMBOLS.filter((s) => s.symbol.startsWith("1HZ")).map((s) => (
            <option key={s.symbol} value={s.symbol}>
              {s.shortName}
            </option>
          ))}
        </optgroup>
        <optgroup label="Standard Indices">
          {VOLATILITY_SYMBOLS.filter((s) => s.symbol.startsWith("R_")).map((s) => (
            <option key={s.symbol} value={s.symbol}>
              {s.shortName}
            </option>
          ))}
        </optgroup>
      </select>

      {currentSymbol && (
        <span className="text-xs text-muted-foreground hidden lg:inline">
          {currentSymbol.name}
        </span>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onZoomOut} title="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onZoomIn} title="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onFitContent} title="Fit to content">
          <Maximize className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
