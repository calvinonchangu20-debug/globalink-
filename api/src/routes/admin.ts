import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { users, trades, transactions } from "../db/schema.js";
import { desc, count, sql, eq, and } from "drizzle-orm";
import {
  getMinWithdrawalUSD,
  setMinWithdrawalUSD,
  getAllSettings,
} from "../services/settings.service.js";

const router = Router();

// Middleware ensuring ADMIN role
const requireAdmin = (req: AuthRequest, res: any, next: any) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }
  next();
};

/**
 * GET /api/admin/metrics
 * Returns real-time application and business monitoring metrics
 */
router.get("/api/admin/metrics", authMiddleware, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    // 1. Total Users
    const [userStats] = await db
      .select({
        totalUsers: count(users.id),
      })
      .from(users);

    // 2. Trades volume and counts
    const [tradeStats] = await db
      .select({
        totalTrades: count(trades.id),
        totalVolume: sql<string>`coalesce(sum(${trades.stake}), 0)`,
        openTrades: sql<number>`count(case when ${trades.status} = 'open' then 1 end)`,
        wonTrades: sql<number>`count(case when ${trades.status} = 'won' then 1 end)`,
        lostTrades: sql<number>`count(case when ${trades.status} = 'lost' then 1 end)`,
      })
      .from(trades);

    // 3. Transactions / Financials
    const [financeStats] = await db
      .select({
        totalDeposits: sql<string>`coalesce(sum(case when ${transactions.type} in ('mpesa_stk', 'mpesa_c2b', 'crypto_deposit') and ${transactions.status} = 'completed' then ${transactions.amount} else 0 end), 0)`,
        totalPayouts: sql<string>`coalesce(sum(case when ${transactions.type} = 'trade_payout' and ${transactions.status} = 'completed' then ${transactions.amount} else 0 end), 0)`,
        totalWithdrawals: sql<string>`coalesce(sum(case when ${transactions.type} in ('withdrawal', 'crypto_withdrawal') and ${transactions.status} = 'completed' then ${transactions.amount} else 0 end), 0)`,
        pendingDeposits: sql<number>`count(case when ${transactions.type} in ('mpesa_stk', 'mpesa_c2b', 'crypto_deposit') and ${transactions.status} = 'pending' then 1 end)`,
        pendingWithdrawals: sql<number>`count(case when ${transactions.type} in ('withdrawal', 'crypto_withdrawal') and ${transactions.status} = 'pending' then 1 end)`,
      })
      .from(transactions);

    res.json({
      metrics: {
        users: {
          total: Number(userStats?.totalUsers ?? 0),
        },
        trades: {
          total: Number(tradeStats?.totalTrades ?? 0),
          open: Number(tradeStats?.openTrades ?? 0),
          won: Number(tradeStats?.wonTrades ?? 0),
          lost: Number(tradeStats?.lostTrades ?? 0),
          totalVolumeUSD: Number(tradeStats?.totalVolume ?? 0),
        },
        finances: {
          totalDepositsUSD: Number(financeStats?.totalDeposits ?? 0),
          totalPayoutsUSD: Number(financeStats?.totalPayouts ?? 0),
          totalWithdrawalsUSD: Number(financeStats?.totalWithdrawals ?? 0),
          pendingDeposits: Number(financeStats?.pendingDeposits ?? 0),
          pendingWithdrawals: Number(financeStats?.pendingWithdrawals ?? 0),
          minWithdrawalUSD: await getMinWithdrawalUSD(),
        },
        system: {
          serverTime: new Date().toISOString(),
          uptimeSeconds: Math.floor(process.uptime()),
          nodeMemoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
      },
    });
  } catch (err: any) {
    console.error("[admin] Error fetching metrics:", err);
    res.status(500).json({ error: err.message || "Failed to fetch admin metrics" });
  }
});

/**
 * GET /api/admin/users
 * Returns list of platform users with balances and activity count
 */
router.get("/api/admin/users", authMiddleware, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        secondName: users.secondName,
        username: users.username,
        email: users.email,
        phoneNumber: users.phoneNumber,
        role: users.role,
        balance: users.balance,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(100);

    res.json({ users: allUsers });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list users" });
  }
});

/**
 * GET /api/admin/trades
 * Returns real-time global trade activity across all users
 */
router.get("/api/admin/trades", authMiddleware, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const recentTrades = await db
      .select({
        id: trades.id,
        userId: trades.userId,
        symbol: trades.symbol,
        type: trades.type,
        stake: trades.stake,
        payoutMultiplier: trades.payoutMultiplier,
        entryPrice: trades.entryPrice,
        exitPrice: trades.exitPrice,
        status: trades.status,
        entryTime: trades.entryTime,
        expiryTime: trades.expiryTime,
        createdAt: trades.createdAt,
        userEmail: users.email,
        username: users.username,
      })
      .from(trades)
      .leftJoin(users, eq(trades.userId, users.id))
      .orderBy(desc(trades.createdAt))
      .limit(100);

    res.json({ trades: recentTrades });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch live trades" });
  }
});

/**
 * GET /api/admin/transactions
 * Returns global financial ledger events (deposits, payouts, stakes)
 */
router.get("/api/admin/transactions", authMiddleware, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const recentTxs = await db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        amount: transactions.amount,
        direction: transactions.direction,
        type: transactions.type,
        status: transactions.status,
        mpesaReceiptNumber: transactions.mpesaReceiptNumber,
        phoneNumber: transactions.phoneNumber,
        description: transactions.description,
        balanceAfter: transactions.balanceAfter,
        createdAt: transactions.createdAt,
        userEmail: users.email,
        username: users.username,
      })
      .from(transactions)
      .leftJoin(users, eq(transactions.userId, users.id))
      .orderBy(desc(transactions.createdAt))
      .limit(100);

    res.json({ transactions: recentTxs });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch transactions" });
  }
});

/**
 * PATCH /api/admin/users/:id/role
 * Allows an existing ADMIN to promote or demote user roles directly from the UI
 */
router.patch("/api/admin/users/:id/role", authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const targetUserId = req.params.id;
    const { role } = req.body;

    if (!role || !["USER", "ADMIN"].includes(role)) {
      return res.status(400).json({ error: "Invalid role. Allowed values: USER, ADMIN" });
    }

    const [updatedUser] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, targetUserId))
      .returning({ id: users.id, username: users.username, role: users.role });

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      message: `User ${updatedUser.username} role updated to ${updatedUser.role}`,
      user: updatedUser,
    });
  } catch (err: any) {
    console.error("[admin] Error updating user role:", err);
    res.status(500).json({ error: err.message || "Failed to update role" });
  }
});


/**
 * POST /api/admin/users/:id/balance
 * Allows an ADMIN full control over a user's real account balance:
 *   - operation: "add"      -> increase balance by `value`
 *   - operation: "subtract" -> decrease balance by `value`
 *   - operation: "set"      -> replace balance with `value` (absolute override)
 *
 * Every change is recorded in the transactions ledger as an adjustment.
 */
router.post("/api/admin/users/:id/balance", authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const targetUserId = req.params.id;
    const { amount, value, description, reason, operation: rawOperation } = req.body;

    // ---------------------------------------------------------------
    // 1. Resolve & validate the operation
    // ---------------------------------------------------------------
    const operation = String(rawOperation ?? "add").toLowerCase().trim();
    const ALLOWED_OPERATIONS = ["add", "subtract", "set"] as const;
    type Operation = (typeof ALLOWED_OPERATIONS)[number];

    if (!ALLOWED_OPERATIONS.includes(operation as Operation)) {
      return res.status(400).json({
        error: `Invalid operation "${rawOperation}". Must be one of: ${ALLOWED_OPERATIONS.join(", ")}.`,
      });
    }

    // Accept either `value` or `amount` (backwards compatible with old "add only" API)
    const rawValue = value !== undefined ? value : amount;
    const numValue = typeof rawValue === "string" ? parseFloat(rawValue) : Number(rawValue);

    if (!Number.isFinite(numValue)) {
      return res.status(400).json({
        error: "A valid numeric `value` is required.",
      });
    }

    // ---------------------------------------------------------------
    // 2. Per-operation validation
    // ---------------------------------------------------------------
    if (operation === "set") {
      // An override to 0 is legal (freeze/zero out an account)
      if (numValue < 0) {
        return res.status(400).json({
          error: "New balance cannot be negative.",
        });
      }
    } else {
      // add / subtract must be a strictly positive delta
      if (numValue <= 0) {
        return res.status(400).json({
          error: `Amount to ${operation} must be a valid positive number greater than 0.`,
        });
      }
    }

    // No upper limitation: Admin can set or adjust balance to any finite numeric value.

    // ---------------------------------------------------------------
    // 3. Apply the change atomically
    // ---------------------------------------------------------------
    const result = await db.transaction(async (tx) => {
      // 3a. Verify user exists & capture the pre-change balance
      const [targetUser] = await tx
        .select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          secondName: users.secondName,
          email: users.email,
          balance: users.balance,
        })
        .from(users)
        .where(eq(users.id, targetUserId));

      if (!targetUser) {
        return { error: "not_found" as const };
      }

      const formattedValue = numValue.toFixed(2);
      const previousBalance = Number(targetUser.balance);

      // 3b. Build the balance expression + guard clause
      let balanceExpression: ReturnType<typeof sql>;
      let whereClause;

      switch (operation as Operation) {
        case "add":
          balanceExpression = sql`${users.balance} + ${formattedValue}::numeric`;
          whereClause = eq(users.id, targetUserId);
          break;

        case "subtract":
          balanceExpression = sql`${users.balance} - ${formattedValue}::numeric`;
          // Atomic guard: only succeed if there are enough funds
          whereClause = and(
            eq(users.id, targetUserId),
            sql`${users.balance} >= ${formattedValue}::numeric`,
          );
          break;

        case "set":
        default:
          balanceExpression = sql`${formattedValue}::numeric`;
          whereClause = eq(users.id, targetUserId);
          break;
      }

      const [updatedUser] = await tx
        .update(users)
        .set({
          balance: balanceExpression,
          updatedAt: new Date(),
        })
        .where(whereClause)
        .returning({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          secondName: users.secondName,
          email: users.email,
          balance: users.balance,
        });

      // Guard tripped => subtract would have gone negative
      if (!updatedUser) {
        return { error: "insufficient_funds" as const, previousBalance };
      }

      // 3c. Derive the signed delta for an accurate ledger entry
      const newBalance = Number(updatedUser.balance);
      const delta = newBalance - previousBalance;
      const direction = delta >= 0 ? "credit" : "debit";

      const defaultNote =
        operation === "add"
          ? "Admin balance credit"
          : operation === "subtract"
            ? "Admin balance debit"
            : "Admin balance override";

      const note = (description || reason || defaultNote).trim();

      // 3d. Record the change in the ledger
      const [newTx] = await tx
        .insert(transactions)
        .values({
          userId: targetUserId,
          amount: Math.abs(delta).toFixed(2),
          direction,
          type: "adjustment",
          status: "completed",
          balanceAfter: updatedUser.balance,
          completedAt: new Date(),
          description: note,
        })
        .returning();

      return {
        updatedUser,
        transaction: newTx,
        previousBalance,
        newBalance,
        delta,
      };
    });

    // ---------------------------------------------------------------
    // 4. Handle transaction outcomes
    // ---------------------------------------------------------------
    if ("error" in result && result.error === "not_found") {
      return res.status(404).json({ error: "User not found." });
    }

    if ("error" in result && result.error === "insufficient_funds") {
      return res.status(400).json({
        error: `Insufficient funds. User balance is $${Number(result.previousBalance).toFixed(2)} USD; cannot subtract $${numValue.toFixed(2)} USD.`,
      });
    }

    const { updatedUser, transaction, previousBalance, newBalance, delta } = result;

    const actionLabel =
      operation === "add" ? "added to" : operation === "subtract" ? "subtracted from" : "set for";

    const message =
      operation === "set"
        ? `Successfully set ${updatedUser.username}'s balance to $${newBalance.toFixed(2)} USD (was $${previousBalance.toFixed(2)} USD).`
        : `Successfully ${operation === "add" ? "added" : "subtracted"} $${numValue.toFixed(2)} USD ${operation === "add" ? "to" : "from"} ${updatedUser.username}'s balance.`;

    res.json({
      message,
      operation,
      previousBalance: previousBalance.toFixed(2),
      newBalance: newBalance.toFixed(2),
      delta: delta.toFixed(2),
      user: updatedUser,
      transaction,
    });
  } catch (err: any) {
    console.error("[admin] Error changing user balance:", err);
    res.status(500).json({ error: err.message || "Failed to change user balance." });
  }
});

/**
 * GET /api/admin/settings
 * Returns platform settings including minimum withdrawal limit
 */
router.get("/api/admin/settings", authMiddleware, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const minWithdrawalUSD = await getMinWithdrawalUSD();
    const all = await getAllSettings();
    res.json({
      settings: {
        minWithdrawalUSD,
        all,
      },
    });
  } catch (err: any) {
    console.error("[admin] Error fetching settings:", err);
    res.status(500).json({ error: err.message || "Failed to fetch settings" });
  }
});

/**
 * PUT /api/admin/settings/withdrawal-limit
 * Customizes the minimum withdrawal threshold in USD
 */
router.put("/api/admin/settings/withdrawal-limit", authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { minWithdrawalUSD } = req.body;
    const num = typeof minWithdrawalUSD === "string" ? parseFloat(minWithdrawalUSD) : Number(minWithdrawalUSD);

    if (!Number.isFinite(num) || num <= 0 || num > 1500) {
      return res.status(400).json({
        error: "Minimum withdrawal limit must be a number between $0.01 and $1,500 USD",
      });
    }

    await setMinWithdrawalUSD(num);

    res.json({
      message: `Minimum withdrawal limit updated successfully to $${num.toFixed(2)} USD`,
      minWithdrawalUSD: num,
    });
  } catch (err: any) {
    console.error("[admin] Error updating withdrawal limit:", err);
    res.status(500).json({ error: err.message || "Failed to update withdrawal limit" });
  }
});

// Also support PATCH /api/admin/settings for flexibility
router.patch("/api/admin/settings", authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { minWithdrawalUSD } = req.body;
    if (minWithdrawalUSD !== undefined) {
      const num = typeof minWithdrawalUSD === "string" ? parseFloat(minWithdrawalUSD) : Number(minWithdrawalUSD);
      if (!Number.isFinite(num) || num <= 0 || num > 1500) {
        return res.status(400).json({
          error: "Minimum withdrawal limit must be a number between $0.01 and $1,500 USD",
        });
      }
      await setMinWithdrawalUSD(num);
    }

    const currentMin = await getMinWithdrawalUSD();
    res.json({
      message: "Platform settings updated successfully",
      settings: {
        minWithdrawalUSD: currentMin,
      },
    });
  } catch (err: any) {
    console.error("[admin] Error patching settings:", err);
    res.status(500).json({ error: err.message || "Failed to patch settings" });
  }
});

export default router;
