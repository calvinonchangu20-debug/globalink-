import WebSocket from "ws";
import { DEFAULT_SYMBOL } from "./config.js";
import type { Granularity, CandleResponse, TicksHistoryResponse } from "./types.js";

const APP_ID = process.env.DERIV_APP_ID || "1089";
const WS_BASE = process.env.DERIV_WS_URL || "wss://ws.derivws.com/websockets/v3";
const DERIV_WS_URL = `${WS_BASE}?app_id=${APP_ID}`;
const DEFAULT_TIMEOUT = 10_000;

let requestCounter = 0;

function sendRequest<T>(payload: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(DERIV_WS_URL);
    const reqId = ++requestCounter;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Deriv API timeout after ${DEFAULT_TIMEOUT}ms`));
    }, DEFAULT_TIMEOUT);

    ws.on("open", () => {
      ws.send(JSON.stringify({ ...payload, req_id: reqId }));
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as T & { req_id?: number; error?: { code: string; message: string } };

      if (msg.req_id !== undefined && msg.req_id !== reqId) return;

      clearTimeout(timer);
      ws.close();

      if (msg.error) {
        reject(new Error(`Deriv API error: ${msg.error.code} - ${msg.error.message}`));
        return;
      }

      resolve(msg);
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function getTicksHistory(
  symbol: string,
  count: number,
  style: "ticks" | "candles" = "ticks"
): Promise<TicksHistoryResponse> {
  return sendRequest<TicksHistoryResponse>({
    ticks_history: symbol,
    adjust_start_time: 1,
    count,
    end: "latest",
    start: 0,
    style,
  });
}

export async function getCandles(
  symbol: string,
  granularity: Granularity,
  count: number
): Promise<CandleResponse> {
  return sendRequest<CandleResponse>({
    ticks_history: symbol,
    adjust_start_time: 1,
    count,
    end: "latest",
    start: 0,
    style: "candles",
    granularity,
  });
}
