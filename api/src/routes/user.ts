import express, { Response } from "express";
import bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, trades, transactions } from "../db/schema.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { normalizeKenyanPhone } from "../services/mpesa.service.js";

const router = express.Router();

/**
 * GET /api/user/profile
 * Retrieves full user profile and summarized trading/finance stats using SQL aggregates.
 */
router.get("/api/user/profile", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [user] = await db.select({
      id: users.id,
      firstName: users.firstName,
      secondName: users.secondName,
      username: users.username,
      phoneNumber: users.phoneNumber,
      email: users.email,
      role: users.role,
      balance: users.balance,
      createdAt: users.createdAt,
      hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
    }).from(users).where(eq(users.id, userId));

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Compute user trade stats via SQL aggregation
    const [tradeStats] = await db.select({
      totalTrades: sql<number>`coalesce(count(*), 0)::int`,
      wonTrades: sql<number>`coalesce(count(*) filter (where ${trades.status} = 'won'), 0)::int`,
      lostTrades: sql<number>`coalesce(count(*) filter (where ${trades.status} = 'lost'), 0)::int`,
      openTrades: sql<number>`coalesce(count(*) filter (where ${trades.status} = 'open'), 0)::int`,
      totalStakeUSD: sql<string>`coalesce(sum(${trades.stake}), 0)::numeric(14,2)::text`,
    }).from(trades).where(eq(trades.userId, userId));

    const totalTrades = tradeStats?.totalTrades ?? 0;
    const wonTrades = tradeStats?.wonTrades ?? 0;
    const lostTrades = tradeStats?.lostTrades ?? 0;
    const openTrades = tradeStats?.openTrades ?? 0;
    const settled = totalTrades - openTrades;
    const winRate = settled > 0 ? Math.round((wonTrades / settled) * 100) : 0;
    const totalStakeUSD = tradeStats?.totalStakeUSD ?? "0.00";

    // Compute user transaction stats via SQL aggregation (strictly M-Pesa deposits in USD)
    const [txStats] = await db.select({
      totalDepositedUSD: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.direction} = 'credit' and ${transactions.status} = 'completed' and ${transactions.type} in ('mpesa_stk', 'mpesa_c2b')), 0)::numeric(14,2)::text`,
    }).from(transactions).where(eq(transactions.userId, userId));

    const totalDepositedUSD = txStats?.totalDepositedUSD ?? "0.00";

    res.json({
      profile: user,
      stats: {
        totalTrades,
        wonTrades,
        lostTrades,
        openTrades,
        winRate,
        totalStakeUSD,
        totalDepositedUSD,
      }
    });
  } catch (error) {
    console.error("Fetch profile error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/user/profile
 * Updates personal info: firstName, secondName, username, phoneNumber.
 */
router.put("/api/user/profile", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { firstName, secondName, username, phoneNumber } = req.body;

    const trimmedFirstName = typeof firstName === "string" ? firstName.trim() : "";
    const trimmedSecondName = typeof secondName === "string" ? secondName.trim() : "";
    const trimmedUsername = typeof username === "string" ? username.trim() : "";

    if (!trimmedFirstName || !trimmedSecondName || !trimmedUsername) {
      return res.status(400).json({ error: "First name, last name, and username are required" });
    }

    if (trimmedUsername.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters long" });
    }

    let normalizedPhone: string | null = null;
    if (phoneNumber && typeof phoneNumber === "string" && phoneNumber.trim().length > 0) {
      try {
        normalizedPhone = normalizeKenyanPhone(phoneNumber.trim());
      } catch (err: any) {
        return res.status(400).json({ 
          error: "Invalid Kenyan phone number format. Expected format: 07XXXXXXXX, 01XXXXXXXX, or 254XXXXXXXX" 
        });
      }
    }

    // Check if username is taken by another user
    const existingUsername = await db.select({ id: users.id }).from(users).where(eq(users.username, trimmedUsername));
    if (existingUsername.length > 0 && existingUsername[0].id !== userId) {
      return res.status(400).json({ error: "Username is already taken" });
    }

    const [updatedUser] = await db.update(users)
      .set({
        firstName: trimmedFirstName,
        secondName: trimmedSecondName,
        username: trimmedUsername,
        phoneNumber: normalizedPhone,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        firstName: users.firstName,
        secondName: users.secondName,
        username: users.username,
        phoneNumber: users.phoneNumber,
        email: users.email,
        role: users.role,
        balance: users.balance,
      });

    res.json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: "Username already in use" });
    }
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/user/change-password
 * Allows logged-in users to update their password.
 */
router.put("/api/user/change-password", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { currentPassword, newPassword } = req.body;
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters long" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // If user already has a passwordHash, verify currentPassword
    if (user.passwordHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required" });
      }
      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch) {
        return res.status(400).json({ error: "Incorrect current password" });
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
