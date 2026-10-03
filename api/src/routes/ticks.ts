import { Router } from "express";
import { getTicksHistory } from "../deriv-client.js";
import { DEFAULT_SYMBOL } from "../config.js";

const router = Router();

/**
 * GET /api/ticks
 * Query params:
 *   - symbol: string (e.g. "R_10", "R_10_1S")
 *   - count: number (default 100, max 5000)
 */
router.get("/api/ticks", async (req, res) => {
  try {
    const symbol = (req.query.symbol as string) || DEFAULT_SYMBOL;
    const count = Math.min(Number(req.query.count) || 100, 5000);

    const response = await getTicksHistory(symbol, count, "ticks");

    // Transform to TradingView format: { time, value }
    const ticks = response.history.prices.map((price, i) => ({
      time: response.history.times[i],
      value: price,
    }));

    res.json({
      symbol,
      count: ticks.length,
      ticks,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ticks]", message);
    res.status(502).json({ error: `Deriv API error: ${message}` });
  }
});

export default router;
