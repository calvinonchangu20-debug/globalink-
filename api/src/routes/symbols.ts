import { Router } from "express";
import { VOLATILITY_SYMBOLS, CHART_STYLES } from "../config.js";

const router = Router();

/**
 * GET /api/symbols
 * Returns available volatility symbols and chart styles.
 */
router.get("/api/symbols", (_req, res) => {
  res.json({
    volatility_symbols: VOLATILITY_SYMBOLS,
    chart_styles: CHART_STYLES,
  });
});

export default router;
