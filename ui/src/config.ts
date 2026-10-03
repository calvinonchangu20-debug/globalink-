export interface VolatilitySymbol {
  symbol: string;
  name: string;
  shortName: string;
}

export const VOLATILITY_SYMBOLS: VolatilitySymbol[] = [
  { symbol: "1HZ10V", name: "Volatility 10 (1s) Index", shortName: "Vol 10 (1s)" },
  { symbol: "1HZ25V", name: "Volatility 25 (1s) Index", shortName: "Vol 25 (1s)" },
  { symbol: "1HZ50V", name: "Volatility 50 (1s) Index", shortName: "Vol 50 (1s)" },
  { symbol: "1HZ75V", name: "Volatility 75 (1s) Index", shortName: "Vol 75 (1s)" },
  { symbol: "1HZ90V", name: "Volatility 90 (1s) Index", shortName: "Vol 90 (1s)" },
  { symbol: "1HZ100V", name: "Volatility 100 (1s) Index", shortName: "Vol 100 (1s)" },
  { symbol: "1HZ150V", name: "Volatility 150 (1s) Index", shortName: "Vol 150 (1s)" },
  { symbol: "1HZ250V", name: "Volatility 250 (1s) Index", shortName: "Vol 250 (1s)" },
  { symbol: "R_10", name: "Volatility 10 Index", shortName: "Vol 10" },
  { symbol: "R_25", name: "Volatility 25 Index", shortName: "Vol 25" },
  { symbol: "R_50", name: "Volatility 50 Index", shortName: "Vol 50" },
  { symbol: "R_75", name: "Volatility 75 Index", shortName: "Vol 75" },
  { symbol: "R_100", name: "Volatility 100 Index", shortName: "Vol 100" },
];

export const DEFAULT_SYMBOL = "1HZ10V";

export type ChartStyle = "candlestick" | "line" | "area" | "bar";

export const CHART_STYLES: { value: ChartStyle; label: string }[] = [
  { value: "area", label: "Area" },
  { value: "line", label: "Line" },
];
