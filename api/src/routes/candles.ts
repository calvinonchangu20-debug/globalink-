import { Router } from "express";
import { getCandles } from "../deriv-client.js";
import { DEFAULT_SYMBOL } from "../config.js";
import type { Granularity } from "../types.js";

const router = Router();

const VALID_GRANULARITIES: readonly Granularity[] = [
  60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400,
];

/**
 * GET /api/candles
 * Query params:
 *   - symbol: string (e.g. "R10", "Volatility 10 (1s) Index")
 *   - granularity: number (seconds: 60, 300, 3600, etc.)
 *   - count: number (default 100, max 5000)
 */
router.get("/api/candles", async (req, res) => {
  try {
    const symbol = (req.query.symbol as string) || DEFAULT_SYMBOL;
    const granularity = Number(req.query.granularity) || 60;
    const count = Math.min(Number(req.query.count) || 100, 5000);

    if (!VALID_GRANULARITIES.includes(granularity as Granularity)) {
      res.status(400).json({
        error: `Invalid granularity. Valid: ${VALID_GRANULARITIES.join(", ")}`,
      });
      return;
    }

    const response = await getCandles(symbol, granularity as Granularity, count);

    // Transform to TradingView Lightweight Charts format: { time, open, high, low, close }
    const candles = response.candles.map((c) => ({
      time: c.epoch,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    res.json({
      symbol,
      granularity,
      count: candles.length,
      candles,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[candles]", message);
    res.status(502).json({ error: `Deriv API error: ${message}` });
  }
});

export default router;
