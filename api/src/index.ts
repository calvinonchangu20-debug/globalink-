import express from "express";
import cors from "cors";
import { createServer } from "http";
import candlesRouter from "./routes/candles.js";
import ticksRouter from "./routes/ticks.js";
import symbolsRouter from "./routes/symbols.js";
import authRouter from "./routes/auth.js";
import paymentsRouter from "./routes/payments.js";
import tradesRouter from "./routes/trades.js";
import adminRouter from "./routes/admin.js";
import userRouter from "./routes/user.js";
import subscriptionsRouter from "./routes/subscriptions.js";
import { TradingService } from "./services/trading.service.js";
import { attachTicksWebSocket } from "./ws-ticks.js";
import { initSystemSettings } from "./services/settings.service.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://www.globalinktraders.com",
  "https://globalinktraders.com",
  ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : []),
];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Routes
app.use(authRouter);
app.use(userRouter);
app.use(subscriptionsRouter);
app.use(candlesRouter);
app.use(ticksRouter);
app.use(symbolsRouter);
app.use(paymentsRouter);
app.use(tradesRouter);
app.use(adminRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Fallback 404 handler for unmatched routes (always return JSON)
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler (always return JSON)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[api] Unhandled error:", err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// Create HTTP server and attach WebSocket
const server = createServer(app);
attachTicksWebSocket(server);

// Initialize platform configuration and system settings
initSystemSettings().catch((err) =>
  console.error("[api] Failed to initialize system settings:", err)
);

// Start background settlement engine
TradingService.getInstance().startSettlementEngine();

server.listen(PORT, () => {
  console.log(`[api] Server running on http://localhost:${PORT}`);
  console.log(`[api] Routes:`);
  console.log(`  GET  /api/health`);
  console.log(`  GET  /api/candles?symbol=R_10&granularity=60&count=100`);
  console.log(`  GET  /api/ticks?symbol=R_10&count=100`);
  console.log(`  GET  /api/symbols?market=synthetic_index`);
  console.log(`  WS   /ws/ticks?symbol=R_10`);
  console.log(`  GET  /api/payments/balance`);
  console.log(`  POST /api/payments/mpesa/deposit`);
  console.log(`  POST /api/payments/mpesa/stk-callback        (Safaricom webhook)`);
  console.log(`  POST /api/payments/mpesa/c2b-validation      (Safaricom webhook)`);
  console.log(`  POST /api/payments/mpesa/c2b-confirmation    (Safaricom webhook)`);
  console.log(`  POST /api/payments/mpesa/register-c2b        (Admin only)
  POST /api/trades/place
  GET  /api/trades/open
  GET  /api/trades/history`);
});
