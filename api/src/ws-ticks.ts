import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { DEFAULT_SYMBOL } from "./config.js";
import DerivAPIBasic from "@deriv/deriv-api/dist/DerivAPIBasic.js";
import DerivWebSocket from "ws";

const APP_ID = process.env.DERIV_APP_ID || "1089";
const WS_BASE = process.env.DERIV_WS_URL || "wss://ws.derivws.com/websockets/v3";
const DERIV_WS_URL = `${WS_BASE}?app_id=${APP_ID}`;

const derivConnections = new Map<string, any>();
const localSubscribers = new Map<string, Set<WebSocket>>();
const pollTimers = new Map<string, NodeJS.Timeout>();

export function attachTicksWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws/ticks" });

  wss.on("connection", (clientWs, req) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const symbol = url.searchParams.get("symbol") || DEFAULT_SYMBOL;

    console.log(`[ws] Client connected - listening to ${symbol}`);

    if (!localSubscribers.has(symbol)) {
      localSubscribers.set(symbol, new Set());
    }
    localSubscribers.get(symbol)!.add(clientWs);

    if (!derivConnections.has(symbol)) {
      const connection = new DerivWebSocket(DERIV_WS_URL);
      const api = new (DerivAPIBasic as any)({ connection });
      derivConnections.set(symbol, api);

      connection.on("open", () => {
        console.log(`[deriv] Starting centralized polling for ${symbol}`);
        
        let lastEpoch = 0;

        const timer = setInterval(async () => {
          try {
            // DO NOT use subscribe: 1, because Deriv blocks streaming for these symbols on app_id 1089.
            // But one-off history polling works!
            const reqHistory = { 
              ticks_history: symbol, 
              adjust_start_time: 1,
              count: 1,
              end: "latest", 
              start: 0,
              style: "ticks"
            };
            
            const response = await api.send(reqHistory);

            if (response.error) {
              console.error(`[deriv] Polling error for ${symbol}:`, response.error.message || response.error.code);
              return;
            }

            const times = response.history?.times;
            const prices = response.history?.prices;

            if (times?.length && prices?.length) {
              const epoch = times[times.length - 1];
              const price = prices[prices.length - 1];

              // Only broadcast if it's a new tick
              if (epoch > lastEpoch) {
                lastEpoch = epoch;
                
                const tickData = JSON.stringify({
                  time: epoch,
                  value: price,
                  symbol
                });

                const subs = localSubscribers.get(symbol);
                if (subs) {
                  subs.forEach(sub => {
                    if (sub.readyState === WebSocket.OPEN) {
                      sub.send(tickData);
                    }
                  });
                }
              }
            }
          } catch (err: any) {
             // Silence transient network errors during polling
             if (err?.error?.message) {
               console.error(`[deriv] Polling exception for ${symbol}:`, err.error.message);
             }
          }
        }, 1200); // Poll slightly slower than 1s to respect rate limits
        
        pollTimers.set(symbol, timer);
      });

      connection.on("close", () => {
        console.log(`[deriv] Connection closed for ${symbol}`);
        derivConnections.delete(symbol);
        if (pollTimers.has(symbol)) {
           clearInterval(pollTimers.get(symbol));
           pollTimers.delete(symbol);
        }
      });

      connection.on("error", (err: any) => {
        console.error(`[deriv] Connection error for ${symbol}:`, err);
      });
    }

    clientWs.on("close", () => {
      console.log(`[ws] Client disconnected from ${symbol}`);
      const subs = localSubscribers.get(symbol);
      if (subs) {
        subs.delete(clientWs);
        if (subs.size === 0) {
          const api = derivConnections.get(symbol);
          if (api && api.connection.readyState === WebSocket.OPEN) {
            api.connection.close();
          }
          derivConnections.delete(symbol);
          
          if (pollTimers.has(symbol)) {
             clearInterval(pollTimers.get(symbol));
             pollTimers.delete(symbol);
          }
        }
      }
    });
  });

  console.log(`[ws] WebSocket server attached at /ws/ticks (centralized polling mode)`);
}
