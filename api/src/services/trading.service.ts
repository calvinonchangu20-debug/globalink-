import { db } from "../db/index.js";
import { users, transactions, trades, tradeTypeEnum } from "../db/schema.js";
import { eq, and, lte, sql } from "drizzle-orm";
import { getTicksHistory } from "../deriv-client.js";

export const PAYOUT_MULTIPLIER = 1.9522; // 95.22% default profit on win
const SETTLEMENT_INTERVAL_MS = 1000; // Check every second

export type TradeType = (typeof tradeTypeEnum.enumValues)[number];

export class TradingService {
  private static instance: TradingService;
  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;

  public static getInstance(): TradingService {
    if (!TradingService.instance) {
      TradingService.instance = new TradingService();
    }
    return TradingService.instance;
  }

  public startSettlementEngine() {
    if (this.timer) return;
    console.log("[TradingEngine] Starting background settlement engine...");
    this.timer = setInterval(() => this.processExpiredTrades(), SETTLEMENT_INTERVAL_MS);
  }

  public stopSettlementEngine() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Evaluates if a trade is won, lost, or tied based on type and prices.
   */
  public evaluateOutcome(type: TradeType, entryPrice: number, exitPrice: number): "won" | "lost" | "tie" {
    // Extract the very last digit from decimal price string
    const getDigit = (price: number) => {
      const str = price.toFixed(3);
      return parseInt(str[str.length - 1], 10) || 0;
    };
    const entryDigit = getDigit(entryPrice);
    const exitDigit = getDigit(exitPrice);

    switch (type) {
      case "call":
        if (exitPrice > entryPrice) return "won";
        if (exitPrice < entryPrice) return "lost";
        return "tie";
      case "put":
        if (exitPrice < entryPrice) return "won";
        if (exitPrice > entryPrice) return "lost";
        return "tie";
      case "even":
        return exitDigit % 2 === 0 ? "won" : "lost";
      case "odd":
        return exitDigit % 2 !== 0 ? "won" : "lost";
      case "over":
        return exitDigit > 5 ? "won" : "lost";
      case "under":
        return exitDigit < 5 ? "won" : "lost";
      case "match":
        return exitDigit === entryDigit ? "won" : "lost";
      case "differ":
        return exitDigit !== entryDigit ? "won" : "lost";
      default:
        return exitPrice > entryPrice ? "won" : "lost";
    }
  }

  /**
   * Places a trade: checks balance, gets latest price, debits stake, creates open trade row.
   * Wrapped in an ACID database transaction for consistency.
   */
  public async placeTrade(params: {
    userId: string;
    symbol: string;
    type: TradeType;
    stake: number;
    durationSeconds: number;
    accountType?: "demo" | "real";
  }) {
    const { userId, symbol, type, stake, durationSeconds, accountType = "real" } = params;

    if (stake <= 0) throw new Error("Stake must be greater than $0");
    if (durationSeconds < 1 || durationSeconds > 3600) throw new Error("Duration must be between 1s and 1 hour");

    // Get current live tick from Deriv for accurate entry price
    let entryPrice = 0;
    try {
      const tickHistory = await getTicksHistory(symbol, 1, "ticks");
      const prices = tickHistory?.history?.prices;
      if (prices && prices.length > 0) {
        entryPrice = prices[prices.length - 1];
      }
    } catch (err) {
      console.error("[TradingEngine] Could not fetch live tick for placement:", err);
    }

    if (!entryPrice) {
      throw new Error("Live market data feed currently unavailable. Please retry in a few moments.");
    }

    const now = new Date();
    const expiryTime = new Date(now.getTime() + durationSeconds * 1000);
    const multiplier = type === "match" ? 9.50 : (type === "differ" ? 1.056 : PAYOUT_MULTIPLIER);

    // Execute atomic placement and ledger balance update in a transaction
    const result = await db.transaction(async (tx) => {
      // Fetch user inside transaction to guarantee consistency and fresh connection
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user) throw new Error("User not found");

      const currentBalance = parseFloat(user.balance);
      if (accountType === "real" && currentBalance < stake) {
        throw new Error(`Insufficient balance ($${currentBalance.toFixed(2)}). Minimum required: $${stake.toFixed(2)}`);
      }

      let updatedBalance = user.balance;

      if (accountType === "real") {
        const [updatedUser] = await tx
          .update(users)
          .set({
            balance: sql`${users.balance} - ${stake.toFixed(2)}`,
            updatedAt: now,
          })
          .where(eq(users.id, userId))
          .returning({ balance: users.balance });

        updatedBalance = updatedUser?.balance ?? "0";

        await tx.insert(transactions).values({
          userId,
          amount: stake.toFixed(2),
          direction: "debit",
          type: "trade_stake",
          status: "completed",
          balanceAfter: updatedBalance,
          description: `Stake for ${type.toUpperCase()} trade on ${symbol}`,
        });
      }

      const [newTrade] = await tx
        .insert(trades)
        .values({
          userId,
          symbol,
          type,
          stake: stake.toFixed(2),
          payoutMultiplier: multiplier.toFixed(4),
          entryPrice: entryPrice.toFixed(6),
          entryTime: now,
          expiryTime,
          status: "open",
        })
        .returning();

      return {
        trade: newTrade,
        newBalance: parseFloat(updatedBalance),
      };
    });

    console.log(`[TradingEngine] Trade opened: ${result.trade.id} (${symbol} ${type}) for user ${userId}`);
    return result;
  }

  /**
   * Background process to settle expired open trades.
   * Uses ACID transaction per trade to ensure balance credit and status update succeed atomically.
   */
  public async processExpiredTrades() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      const openExpiredTrades = await db
        .select()
        .from(trades)
        .where(
          and(
            eq(trades.status, "open"),
            lte(trades.expiryTime, now)
          )
        )
        .limit(20);

      for (const trade of openExpiredTrades) {
        try {
          // Fetch current price at expiry
          let exitPrice = 0;
          try {
            const tickHistory = await getTicksHistory(trade.symbol, 1, "ticks");
            const prices = tickHistory?.history?.prices;
            if (prices && prices.length > 0) {
              exitPrice = prices[prices.length - 1];
            }
          } catch (tickErr) {
            console.error(`[TradingEngine] Tick fetch failed during settlement for trade ${trade.id}:`, tickErr);
          }

          const entryPrice = parseFloat(trade.entryPrice);
          const stake = parseFloat(trade.stake);
          const multiplier = parseFloat(trade.payoutMultiplier);
          const settleTime = new Date();

          // If exit price could not be retrieved from the market, issue a full refund
          if (!exitPrice) {
            console.warn(`[TradingEngine] Market feed unavailable for trade ${trade.id}. Refunding stake $${stake.toFixed(2)}.`);
            
            await db.transaction(async (tx) => {
              const [updatedUser] = await tx
                .update(users)
                .set({
                  balance: sql`${users.balance} + ${stake.toFixed(2)}`,
                  updatedAt: settleTime,
                })
                .where(eq(users.id, trade.userId))
                .returning({ balance: users.balance });

              const newBalance = updatedUser?.balance ?? "0";

              await tx.insert(transactions).values({
                userId: trade.userId,
                amount: stake.toFixed(2),
                direction: "credit",
                type: "trade_payout",
                status: "completed",
                balanceAfter: newBalance,
                description: `Refund for ${trade.type.toUpperCase()} trade on ${trade.symbol} due to feed unavailability`,
              });

              await tx
                .update(trades)
                .set({
                  status: "refunded",
                  updatedAt: settleTime,
                })
                .where(eq(trades.id, trade.id));
            });
            continue;
          }

          const outcome = this.evaluateOutcome(trade.type as TradeType, entryPrice, exitPrice);

          let payout = 0;
          if (outcome === "won") {
            payout = stake * multiplier;
          } else if (outcome === "tie") {
            payout = stake;
          }

          // Settle trade and credit user within an atomic transaction
          await db.transaction(async (tx) => {
            if (payout > 0) {
              const [updatedUser] = await tx
                .update(users)
                .set({
                  balance: sql`${users.balance} + ${payout.toFixed(2)}`,
                  updatedAt: settleTime,
                })
                .where(eq(users.id, trade.userId))
                .returning({ balance: users.balance });

              const newBalance = updatedUser?.balance ?? "0";

              await tx.insert(transactions).values({
                userId: trade.userId,
                amount: payout.toFixed(2),
                direction: "credit",
                type: "trade_payout",
                status: "completed",
                balanceAfter: newBalance,
                description: `Payout for ${trade.type.toUpperCase()} trade on ${trade.symbol} (${outcome.toUpperCase()})`,
              });
            }

            await tx
              .update(trades)
              .set({
                exitPrice: exitPrice.toFixed(6),
                status: outcome,
                updatedAt: settleTime,
              })
              .where(eq(trades.id, trade.id));
          });

          console.log(
            `[TradingEngine] Settled trade ${trade.id} (${trade.symbol} ${trade.type}): Outcome=${outcome.toUpperCase()} (Entry: ${entryPrice}, Exit: ${exitPrice}, Payout: $${payout.toFixed(2)})`
          );
        } catch (err) {
          console.error(`[TradingEngine] Error settling trade ${trade.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[TradingEngine] Loop error:", err);
    } finally {
      this.isProcessing = false;
    }
  }
}
