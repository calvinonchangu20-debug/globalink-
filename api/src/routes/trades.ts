import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { TradingService, TradeType } from "../services/trading.service.js";
import { db } from "../db/index.js";
import { trades } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";

const router = Router();
const tradingService = TradingService.getInstance();

/**
 * POST /api/trades/place
 * Places a trade and debits balance
 */
router.post("/api/trades/place", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { symbol, type, stake, durationSeconds, accountType } = req.body;

    if (!symbol || !type || stake === undefined) {
      return res.status(400).json({ error: "Missing required trade parameters (symbol, type, stake)" });
    }

    if (accountType === "demo") {
      return res.status(400).json({
        error: "Demo trades are simulated locally on the client and do not execute against the real balance.",
      });
    }

    const result = await tradingService.placeTrade({
      userId,
      symbol,
      type: type as TradeType,
      stake: Number(stake),
      durationSeconds: Number(durationSeconds) || 15,
      accountType: "real",
    });

    res.json({
      success: true,
      trade: result.trade,
      balance: result.newBalance,
    });
  } catch (err: any) {
    console.error("[trades] Error placing trade:", err.message);
    res.status(400).json({ error: err.message || "Failed to place trade" });
  }
});

/**
 * GET /api/trades/open
 * Gets all open trades for authenticated user
 */
router.get("/api/trades/open", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const openTrades = await db
      .select()
      .from(trades)
      .where(eq(trades.userId, userId))
      .orderBy(desc(trades.createdAt));

    const filtered = openTrades.filter((t) => t.status === "open");

    res.json({ trades: filtered });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch open trades" });
  }
});

/**
 * GET /api/trades/history
 * Gets closed/settled trades for authenticated user
 */
router.get("/api/trades/history", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const allTrades = await db
      .select()
      .from(trades)
      .where(eq(trades.userId, userId))
      .orderBy(desc(trades.createdAt))
      .limit(50);

    const closed = allTrades.filter((t) => t.status !== "open");

    res.json({ trades: closed });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch trade history" });
  }
});

export default router;
