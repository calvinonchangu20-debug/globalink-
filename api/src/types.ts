// Deriv API WebSocket response types

export interface DerivResponse {
  msg_type: string;
  req_id?: number;
  error?: { code: string; message: string };
}

export interface TicksHistoryResponse extends DerivResponse {
  msg_type: "ticks_history";
  history: {
    prices: number[];
    times: number[];
  };
  echo_req: {
    ticks_history: string;
    adjust_start_time: number;
    count: number;
    end: string;
    start: number;
    style: string;
    symbol: string;
  };
}

export interface CandleResponse extends DerivResponse {
  msg_type: "candles";
  candles: Candle[];
  echo_req: {
    candles: number;
    granularity: number;
    symbol: string;
  };
}

export interface Candle {
  close: number;
  epoch: number;
  high: number;
  low: number;
  open: number;
}

export interface ActiveSymbolsResponse extends DerivResponse {
  msg_type: "active_symbols";
  active_symbols: SymbolInfo[];
}

export interface SymbolInfo {
  symbol: string;
  display_name: string;
  exchange: string;
  market: string;
  market_display_name: string;
  submarket: string;
  submarket_display_name: string;
  instrument: string;
  instrument_display_name: string;
  exchange_is_open: number;
  is_trading_suspended: number;
  pip: string;
  payout: string;
}

export interface TicksResponse extends DerivResponse {
  msg_type: "tick";
  tick: {
    ask: number;
    bid: number;
    epoch: number;
    id: string;
    quote: number;
    symbol: string;
  };
}

// Granularity in seconds
export type Granularity = 60 | 120 | 300 | 600 | 900 | 1800 | 3600 | 7200 | 14400 | 28800 | 86400;
