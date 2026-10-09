import express, { Response } from "express";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, transactions, signalSubscriptions } from "../db/schema.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = express.Router();

const PLAN_DURATION_DAYS = 30;

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

const PLAN_BY_ID = new Map(
  SIGNAL_PLANS.map((plan) => [plan.id, plan] as const)
);

class SubscriptionError extends Error {
  constructor(
    public code: "INSUFFICIENT_FUNDS" | "ALREADY_SUBSCRIBED",
    public planName?: string,
    public expiresAt?: Date,
    public balance?: string
  ) {
    super(code);
    this.name = "SubscriptionError";
  }
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

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
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

      if (existing) {
        const activePlan = PLAN_BY_ID.get(existing.plan as SignalPlanId);
        throw new SubscriptionError(
          "ALREADY_SUBSCRIBED",
          activePlan?.name ?? existing.plan,
          existing.expiresAt
        );
      }

      const [updatedUser] = await tx
        .update(users)
        .set({
          balance: sql`${users.balance} - ${price}::numeric`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(users.id, userId), sql`${users.balance} >= ${price}::numeric`)
        )
        .returning({ balance: users.balance });

      if (!updatedUser) {
        const [account] = await tx
          .select({ balance: users.balance })
          .from(users)
          .where(eq(users.id, userId));
        throw new SubscriptionError("INSUFFICIENT_FUNDS", undefined, undefined, account?.balance);
      }

      const newBalance = updatedUser.balance;

      const [ledger] = await tx
        .insert(transactions)
        .values({
          userId,
          amount: price,
          direction: "debit",
          type: "subscription",
          status: "completed",
          balanceAfter: newBalance,
          description: `Signal subscription - ${plan.name} plan (${plan.durationDays} days)`,
        })
        .returning();

      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

      const [subscription] = await tx
        .insert(signalSubscriptions)
        .values({
          userId,
          plan: plan.id,
          amountUsd: price,
          status: "active",
          startedAt,
          expiresAt,
          transactionId: ledger.id,
        })
        .returning();

      return { subscription, newBalance };
    });

    res.json({
      success: true,
      message: `Subscribed to ${plan.name} plan for ${plan.durationDays} days.`,
      subscription: serializeSubscription(result.subscription),
      newBalance: parseFloat(result.newBalance),
    });
  } catch (error) {
    if (error instanceof SubscriptionError) {
      if (error.code === "INSUFFICIENT_FUNDS") {
        const balance = parseFloat(error.balance ?? "0").toFixed(2);
        return res.status(400).json({
          error: `Insufficient balance. This plan costs $${price} but your balance is $${balance}.`,
        });
      }
      const until = error.expiresAt ? error.expiresAt.toLocaleDateString() : "soon";
      return res.status(400).json({
        error: `You already have an active ${error.planName} subscription until ${until}.`,
      });
    }
    console.error("Subscribe error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
