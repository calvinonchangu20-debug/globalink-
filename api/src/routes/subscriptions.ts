import express, { Response } from "express";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, transactions, signalSubscriptions, mpesaPendingStk } from "../db/schema.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { getMpesaService, normalizeKenyanPhone } from "../services/mpesa.service.js";
import { getUsdToKesRate } from "../services/exchange.service.js";

const router = express.Router();

const PLAN_DURATION_DAYS = 30;
const STK_PENDING_TTL_MS = 5 * 60 * 1000;

export const SIGNAL_PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: 20,
    currency: "USD",
    durationDays: PLAN_DURATION_DAYS,
    tagline: "For getting started",
    popular: false,
    features: [
      "Daily signal alerts",
      "3-5 signals per week",
      "Entry & exit targets",
      "Email delivery",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: 30,
    currency: "USD",
    durationDays: PLAN_DURATION_DAYS,
    tagline: "Most popular",
    popular: true,
    features: [
      "Everything in Basic",
      "8-12 signals per week",
      "Real-time push alerts",
      "Risk & lot-size guidance",
      "Priority support",
    ],
  },
  {
    id: "vip",
    name: "VIP",
    price: 50,
    currency: "USD",
    durationDays: PLAN_DURATION_DAYS,
    tagline: "Maximum edge",
    popular: false,
    features: [
      "Everything in Premium",
      "Unlimited signals",
      "1-on-1 analyst chat",
      "Copy-trade signals",
      "VIP Telegram room",
    ],
  },
] as const;

type SignalPlanId = (typeof SIGNAL_PLANS)[number]["id"];

const PLAN_BY_ID = new Map(SIGNAL_PLANS.map((plan) => [plan.id, plan] as const));

export function getPlanDurationDays(planId: string): number {
  return PLAN_BY_ID.get(planId as SignalPlanId)?.durationDays ?? PLAN_DURATION_DAYS;
}

function serializeSubscription(row: typeof signalSubscriptions.$inferSelect) {
  const plan = PLAN_BY_ID.get(row.plan as SignalPlanId);
  return {
    id: row.id,
    plan: row.plan,
    planName: plan?.name ?? row.plan,
    amountUsd: row.amountUsd,
    status: row.status,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

router.get("/api/subscriptions", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [latest] = await db
      .select()
      .from(signalSubscriptions)
      .where(
        and(
          eq(signalSubscriptions.userId, userId),
          eq(signalSubscriptions.status, "active")
        )
      )
      .orderBy(desc(signalSubscriptions.createdAt))
      .limit(1);

    let current = null;

    if (latest) {
      if (latest.expiresAt.getTime() > Date.now()) {
        current = serializeSubscription(latest);
      } else {
        await db
          .update(signalSubscriptions)
          .set({ status: "expired" })
          .where(eq(signalSubscriptions.id, latest.id));
      }
    }

    res.json({ plans: SIGNAL_PLANS, current });
  } catch (error) {
    console.error("Fetch subscriptions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/api/subscriptions/subscribe", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const requestedPlan = req.body?.plan;
    const plan =
      typeof requestedPlan === "string"
        ? PLAN_BY_ID.get(requestedPlan as SignalPlanId)
        : undefined;

    if (!plan) {
      return res.status(400).json({ error: "Invalid plan. Choose one of: basic, premium, vip" });
    }

    const price = plan.price.toFixed(2);

    const [active] = await db
      .select()
      .from(signalSubscriptions)
      .where(
        and(
          eq(signalSubscriptions.userId, userId),
          eq(signalSubscriptions.status, "active"),
          gt(signalSubscriptions.expiresAt, new Date())
        )
      )
      .orderBy(desc(signalSubscriptions.createdAt))
      .limit(1);

    if (active) {
      const activePlan = PLAN_BY_ID.get(active.plan as SignalPlanId);
      return res.status(400).json({
        error: `You already have an active ${activePlan?.name ?? active.plan} subscription until ${active.expiresAt.toLocaleDateString()}.`,
      });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const providedPhone = typeof req.body?.phoneNumber === "string" ? req.body.phoneNumber.trim() : "";
    const rawPhone = providedPhone || user.phoneNumber;
    if (!rawPhone) {
      return res.status(400).json({ error: "Please provide an M-Pesa phone number." });
    }

    let phone: string;
    try {
      phone = normalizeKenyanPhone(rawPhone);
    } catch (phoneErr) {
      return res.status(400).json({
        error: phoneErr instanceof Error ? phoneErr.message : "Invalid M-Pesa phone number.",
      });
    }

    if (phone !== user.phoneNumber) {
      await db
        .update(users)
        .set({ phoneNumber: phone, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }

    const [existingPending] = await db
      .select()
      .from(mpesaPendingStk)
      .where(
        and(
          eq(mpesaPendingStk.userId, userId),
          sql`${mpesaPendingStk.expiresAt} > now()`
        )
      )
      .limit(1);

    if (existingPending) {
      return res.status(429).json({
        error: "You already have a pending M-Pesa prompt. Please complete or wait for it to expire.",
      });
    }

    const rate = await getUsdToKesRate();
    const kesAmount = Math.floor(plan.price * rate);
    if (kesAmount < 10) {
      return res.status(400).json({ error: "Amount is too small to process via M-Pesa." });
    }

    const pendingTxId = await db.transaction(async (tx) => {
      const [pendingTx] = await tx
        .insert(transactions)
        .values({
          userId,
          amount: price,
          direction: "debit",
          type: "subscription",
          status: "pending",
          phoneNumber: phone,
          description: `Signal subscription - ${plan.name} plan (${plan.durationDays} days)`,
        })
        .returning();

      await tx.insert(signalSubscriptions).values({
        userId,
        plan: plan.id,
        amountUsd: price,
        status: "pending",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
        transactionId: pendingTx.id,
      });

      return pendingTx.id;
    });

    const mpesa = getMpesaService();
    let stkResponse;
    try {
      stkResponse = await mpesa.initiateSTKPush(
        phone,
        kesAmount,
        pendingTxId,
        `Signal subscription - ${plan.name}`
      );
    } catch (stkErr) {
      const reason = stkErr instanceof Error ? stkErr.message : "M-Pesa request failed";
      await db.transaction(async (tx) => {
        await tx
          .update(transactions)
          .set({ status: "failed", description: `STK Push failed: ${reason}` })
          .where(eq(transactions.id, pendingTxId));
        await tx
          .update(signalSubscriptions)
          .set({ status: "failed" })
          .where(eq(signalSubscriptions.transactionId, pendingTxId));
      });
      return res.status(400).json({ error: reason });
    }

    const expiresAt = new Date(Date.now() + STK_PENDING_TTL_MS);
    await db.insert(mpesaPendingStk).values({
      userId,
      transactionId: pendingTxId,
      merchantRequestId: stkResponse.MerchantRequestID,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      amount: price,
      phoneNumber: phone,
      expiresAt,
    });

    return res.json({
      success: true,
      message: `M-Pesa prompt sent to ${phone} for $${plan.price}. Enter your PIN to activate the ${plan.name} plan.`,
      plan: plan.id,
      planName: plan.name,
      amount: plan.price,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      transactionId: pendingTxId,
      expiresAt,
    });
  } catch (error) {
    console.error("[subscriptions] subscribe error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
