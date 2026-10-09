import express from "express";
import { getUsdToKesRate } from "../services/exchange.service.js";
import { eq, and, or, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, transactions, mpesaPendingStk, cryptoPendingPayments, signalSubscriptions } from "../db/schema.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { CryptoPaymentService, SUPPORTED_CRYPTO_NETWORKS } from "../services/crypto.service.js";
import {
  getMpesaService,
  parseStkCallback,
  parseB2CCallback,
  handleC2BValidation,
  handleC2BConfirmation,
  normalizeKenyanPhone,
  type C2BValidationPayload,
  type C2BConfirmationPayload,
  type StkCallbackPayload,
  type B2CCallbackPayload,
} from "../services/mpesa.service.js";
import { getMinWithdrawalUSD } from "../services/settings.service.js";
import { getPlanDurationDays } from "./subscriptions.js";

const router = express.Router();

router.get("/api/payments/exchange-rate", async (req, res) => {
  try {
    const rate = await getUsdToKesRate();
    const minWithdrawalUSD = await getMinWithdrawalUSD();
    res.json({ rate, minWithdrawalUSD });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch exchange rate" });
  }
});

router.get("/api/payments/config", async (req, res) => {
  try {
    const rate = await getUsdToKesRate();
    const minWithdrawalUSD = await getMinWithdrawalUSD();
    res.json({
      rate,
      minWithdrawalUSD,
      maxWithdrawalUSD: 1500,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch payment configuration" });
  }
});


// ─── POST /api/payments/mpesa/deposit ────────────────────────────────────────
//
// Authenticated. Initiates an STK push to the user's registered phone number.
// Creates a PENDING transaction + pending_stk row before calling Daraja, so
// we can reconcile if the callback is delayed or missed.
//
// Body: { amount: number, phoneNumber?: string }
//   phoneNumber defaults to the user's registered phone number.
//
router.post("/api/payments/mpesa/deposit", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { amount, phoneNumber } = req.body;

    if (!amount || typeof amount !== "number" || amount < 5) {
      return res.status(400).json({ error: "Amount must be a number ≥ 5 USD" });
    }

    const rate = await getUsdToKesRate();
    const kesAmount = Math.floor(amount * rate);

    if (kesAmount < 10) {
      return res.status(400).json({ error: "Amount must be at least 10 KES equivalent" });
    }

    // Fetch user to get phone number if not provided
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    const phone = phoneNumber || user.phoneNumber;
    if (!phone) {
      return res.status(400).json({
        error: "No phone number on your account. Provide one in the request body.",
      });
    }

    // Check for an existing pending push (avoid duplicate spam)
    const [existing] = await db
      .select()
      .from(mpesaPendingStk)
      .where(
        and(
          eq(mpesaPendingStk.userId, userId),
          sql`${mpesaPendingStk.expiresAt} > now()`
        )
      );

    if (existing) {
      return res.status(429).json({
        error: "You already have a pending M-Pesa prompt. Please complete or wait for it to expire.",
        expiresAt: existing.expiresAt,
      });
    }

    // Create the pending transaction row first
    const [pendingTx] = await db
      .insert(transactions)
      .values({
        userId,
        amount: amount.toFixed(2),
        direction: "credit",
        type: "mpesa_stk",
        status: "pending",
        phoneNumber: phone,
        description: `STK Push deposit – ${amount} (approx ${kesAmount} KES)`,
      })
      .returning();

    // Initiate STK push
    const mpesa = getMpesaService();
    let stkResponse;
    try {
      stkResponse = await mpesa.initiateSTKPush(
        phone,
        kesAmount,
        pendingTx.id, // use tx ID as AccountReference so we can link callback → tx
        `Deposit ${amount} to GlobalInk`
      );
    } catch (stkErr: any) {
      // Roll back the pending transaction on STK failure
      await db
        .update(transactions)
        .set({ status: "failed", description: `STK Push failed: ${stkErr.message}` })
        .where(eq(transactions.id, pendingTx.id));
      return res.status(400).json({ error: stkErr.message || "M-Pesa request failed" });
    }

    // Record the pending STK push for callback reconciliation
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Safaricom expires in ~5 min
    await db.insert(mpesaPendingStk).values({
      userId,
      transactionId: pendingTx.id,
      merchantRequestId: stkResponse.MerchantRequestID,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      amount: amount.toFixed(2),
      phoneNumber: phone,
      expiresAt,
    });

    res.json({
      message: "M-Pesa prompt sent to your phone. Enter your PIN to complete the deposit.",
      checkoutRequestId: stkResponse.CheckoutRequestID,
      transactionId: pendingTx.id,
      amount,
      expiresAt,
    });
  } catch (err) {
    console.error("[payments] deposit error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/payments/mpesa/stk-callback ───────────────────────────────────
//
// PUBLIC – called by Safaricom, not the user. No auth header.
// Parses the result of an STK push and credits/fails the pending transaction.
//
router.post("/api/payments/mpesa/stk-callback", async (req, res) => {
  // Always respond 200 fast – Safaricom retries if we don't
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const result = parseStkCallback(req.body as StkCallbackPayload);

    if (!result.success) {
      console.warn("[STK callback] Payment not completed:", result.message);

      // Find and fail the pending row
      const [pending] = await db
        .select()
        .from(mpesaPendingStk)
        .where(
          eq(mpesaPendingStk.checkoutRequestId, req.body?.Body?.stkCallback?.CheckoutRequestID ?? "")
        );

      if (pending) {
        await db
          .update(transactions)
          .set({ status: "failed", description: result.message })
          .where(eq(transactions.id, pending.transactionId));

        await db
          .update(signalSubscriptions)
          .set({ status: "failed" })
          .where(eq(signalSubscriptions.transactionId, pending.transactionId));

        await db.delete(mpesaPendingStk).where(eq(mpesaPendingStk.id, pending.id));
      }
      return;
    }

    // Successful payment – find the pending record and process atomically
    await db.transaction(async (tx) => {
      const [pending] = await tx
        .select()
        .from(mpesaPendingStk)
        .where(eq(mpesaPendingStk.checkoutRequestId, result.checkoutRequestId));

      if (!pending) {
        console.warn("[STK callback] No pending record or already processed:", result.checkoutRequestId);
        return;
      }

      // Guard against duplicate callback by receipt number
      if (result.mpesaReceiptNumber) {
        const [existingCompleted] = await tx
          .select()
          .from(transactions)
          .where(eq(transactions.mpesaReceiptNumber, result.mpesaReceiptNumber));

        if (existingCompleted) {
          console.warn("[STK callback] Duplicate callback ignored for receipt:", result.mpesaReceiptNumber);
          await tx.delete(mpesaPendingStk).where(eq(mpesaPendingStk.id, pending.id));
          return;
        }
      }

      // Fetch the pending transaction ensuring it is still pending
      const [pendingTx] = await tx
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.id, pending.transactionId),
            eq(transactions.status, "pending")
          )
        );

      if (!pendingTx) {
        console.warn("[STK callback] Transaction already settled or not found:", pending.transactionId);
        await tx.delete(mpesaPendingStk).where(eq(mpesaPendingStk.id, pending.id));
        return;
      }

      // Subscription payment: activate the plan instead of crediting balance
      if (pendingTx.type === "subscription") {
        const [subscription] = await tx
          .select()
          .from(signalSubscriptions)
          .where(eq(signalSubscriptions.transactionId, pendingTx.id))
          .limit(1);

        if (subscription) {
          const startedAt = new Date();
          const expiresAt = new Date(
            startedAt.getTime() + getPlanDurationDays(subscription.plan) * 24 * 60 * 60 * 1000
          );
          await tx
            .update(signalSubscriptions)
            .set({ status: "active", startedAt, expiresAt })
            .where(eq(signalSubscriptions.id, subscription.id));
        }

        await tx
          .update(transactions)
          .set({
            status: "completed",
            mpesaReceiptNumber: result.mpesaReceiptNumber,
            mpesaTransactionId: result.checkoutRequestId,
            phoneNumber: result.phoneNumber,
            completedAt: new Date(),
            description: `Signal subscription payment - receipt ${result.mpesaReceiptNumber}`,
          })
          .where(eq(transactions.id, pendingTx.id));

        await tx.delete(mpesaPendingStk).where(eq(mpesaPendingStk.id, pending.id));

        console.log(
          `[STK callback] Activated subscription for user ${pending.userId} (receipt ${result.mpesaReceiptNumber})`
        );
        return;
      }

      // Atomically credit user balance with original USD amount
      const [updatedUser] = await tx
        .update(users)
        .set({
          balance: sql`${users.balance} + ${pendingTx.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, pending.userId))
        .returning({ balance: users.balance });

      const newBalance = updatedUser?.balance ?? "0";

      // Mark transaction completed
      await tx
        .update(transactions)
        .set({
          status: "completed",
          mpesaReceiptNumber: result.mpesaReceiptNumber,
          mpesaTransactionId: result.checkoutRequestId,
          phoneNumber: result.phoneNumber,
          balanceAfter: newBalance,
          completedAt: new Date(),
          description: `Deposit via M-Pesa STK (KES ${result.amount}) – receipt ${result.mpesaReceiptNumber}`,
        })
        .where(eq(transactions.id, pending.transactionId));

      // Clean up the pending row
      await tx.delete(mpesaPendingStk).where(eq(mpesaPendingStk.id, pending.id));

      console.log(
        `[STK callback] ✅ Credited USD ${pendingTx.amount} (from KES ${result.amount}) to user ${pending.userId}. New balance: ${newBalance}`
      );
    });
  } catch (err) {
    console.error("[STK callback] Processing error:", err);
  }
});

// ─── POST /api/payments/mpesa/withdraw ───────────────────────────────────────
//
// Authenticated. Initiates a B2C payout to the user's M-Pesa phone number.
// Atomically locks & deducts USD from user's balance and creates a PENDING withdrawal transaction.
// If Safaricom call fails synchronously, the balance is immediately refunded.
// If Safaricom call succeeds asynchronously, b2c-result callback marks completed.
// If Safaricom rejects asynchronously, b2c-result callback refunds balance back to user.
//
router.post("/api/payments/mpesa/withdraw", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { amount, phoneNumber } = req.body;

    const numAmount = typeof amount === "string" ? parseFloat(amount) : Number(amount);
    const minWithdrawal = await getMinWithdrawalUSD();
    if (!Number.isFinite(numAmount) || numAmount < minWithdrawal) {
      return res.status(400).json({
        error: `Minimum withdrawal amount is $${minWithdrawal.toFixed(2)} USD`,
      });
    }
    if (numAmount > 1500) {
      return res.status(400).json({
        error: "Maximum single withdrawal amount is $1,500 USD (M-Pesa transaction limit)",
      });
    }

    // Fetch user
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    const currentBalance = parseFloat(user.balance ?? "0");
    if (currentBalance < numAmount) {
      return res.status(400).json({
        error: `Insufficient balance. Available: $${currentBalance.toFixed(2)} USD`,
      });
    }

    const rawPhone = phoneNumber || user.phoneNumber;
    if (!rawPhone) {
      return res.status(400).json({
        error: "M-Pesa phone number required. Please provide a phone number.",
      });
    }

    let phone: string;
    try {
      phone = normalizeKenyanPhone(rawPhone);
    } catch (e: any) {
      return res.status(400).json({ error: e.message || "Invalid Kenyan phone number" });
    }

    const rate = await getUsdToKesRate();
    const kesAmount = Math.floor(numAmount * rate);

    if (kesAmount < 10) {
      return res.status(400).json({ error: "Amount must be at least 10 KES equivalent" });
    }

    // Check for rapid concurrent withdrawal requests (prevent double clicks)
    const [existingPending] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "withdrawal"),
          eq(transactions.status, "pending"),
          sql`${transactions.createdAt} > now() - interval '2 minutes'`
        )
      )
      .limit(1);

    if (existingPending) {
      return res.status(429).json({
        error: "You already have a withdrawal in progress. Please wait a moment for it to complete.",
      });
    }

    // Step 1: Atomic balance deduction & create pending transaction
    let pendingTx: any;
    let newBalanceVal: string;
    try {
      const result = await db.transaction(async (tx) => {
        const [updatedUser] = await tx
          .update(users)
          .set({
            balance: sql`${users.balance} - ${numAmount.toFixed(2)}::numeric`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(users.id, userId),
              sql`${users.balance} >= ${numAmount.toFixed(2)}::numeric`
            )
          )
          .returning({ balance: users.balance });

        if (!updatedUser) {
          throw new Error("INSUFFICIENT_FUNDS");
        }

        const [createdTx] = await tx
          .insert(transactions)
          .values({
            userId,
            amount: numAmount.toFixed(2),
            direction: "debit",
            type: "withdrawal",
            status: "pending",
            phoneNumber: phone,
            description: `M-Pesa withdrawal – $${numAmount.toFixed(2)} (approx KES ${kesAmount}) to ${phone}`,
            balanceAfter: updatedUser.balance,
          })
          .returning();

        return { updatedUser, createdTx };
      });

      pendingTx = result.createdTx;
      newBalanceVal = result.updatedUser.balance;
    } catch (txErr: any) {
      if (txErr.message === "INSUFFICIENT_FUNDS") {
        return res.status(400).json({ error: "Insufficient balance for this withdrawal" });
      }
      throw txErr;
    }

    // Step 2: Trigger Daraja B2C
    const mpesa = getMpesaService();
    let b2cResponse;
    try {
      b2cResponse = await mpesa.initiateB2CPayment({
        amount: kesAmount,
        phoneNumber: phone,
        commandId: "BusinessPayment",
        remarks: "Withdrawal from GlobalLink",
        occasion: `Payout ${pendingTx.id.slice(0, 8)}`,
      });
    } catch (apiErr: any) {
      b2cResponse = { success: false, errorMessage: apiErr.message };
    }

    // Step 3: Handle B2C initiation outcome
    if (!b2cResponse.success) {
      console.error("[B2C withdrawal] Initiation failed, refunding balance:", b2cResponse.errorMessage);

      // Refund the user balance immediately
      await db.transaction(async (tx) => {
        const [refunded] = await tx
          .update(users)
          .set({
            balance: sql`${users.balance} + ${numAmount.toFixed(2)}::numeric`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId))
          .returning({ balance: users.balance });

        await tx
          .update(transactions)
          .set({
            status: "failed",
            balanceAfter: refunded?.balance,
            description: `Withdrawal failed: ${b2cResponse.errorMessage ?? "Payment request failed"} – refunded to balance`,
          })
          .where(eq(transactions.id, pendingTx.id));
      });

      return res.status(502).json({
        error: b2cResponse.errorMessage || "Failed to contact M-Pesa. Your funds have been refunded to your wallet balance.",
      });
    }

    // Record conversation IDs returned by Daraja
    const conversationId = b2cResponse.response?.ConversationID || b2cResponse.response?.OriginatorConversationID;
    if (conversationId) {
      await db
        .update(transactions)
        .set({
          mpesaTransactionId: conversationId,
        })
        .where(eq(transactions.id, pendingTx.id));
    }

    return res.json({
      success: true,
      message: `Withdrawal of $${numAmount.toFixed(2)} (approx KES ${kesAmount.toLocaleString()}) initiated to ${phone}.`,
      transactionId: pendingTx.id,
      conversationId,
      newBalance: parseFloat(newBalanceVal),
    });
  } catch (err: any) {
    console.error("[M-Pesa withdrawal] Error:", err);
    res.status(500).json({ error: "Internal server error processing withdrawal" });
  }
});

// ─── POST /api/payments/mpesa/b2c-result ─────────────────────────────────────
//
// PUBLIC – called by Safaricom when a B2C payment completes or fails.
//
router.post("/api/payments/mpesa/b2c-result", async (req, res) => {
  // Always ack Safaricom immediately
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const parsed = parseB2CCallback(req.body);
    console.log("[B2C result callback] Received:", {
      success: parsed.success,
      conversationId: parsed.conversationId,
      originatorConversationId: parsed.originatorConversationId,
      receipt: (parsed as any).mpesaReceiptNumber,
      resultDesc: parsed.resultDesc,
    });

    if (!parsed.conversationId && !parsed.originatorConversationId) {
      console.warn("[B2C callback] Received callback with neither ConversationID nor OriginatorConversationID");
      return;
    }

    const [pendingTx] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.type, "withdrawal"),
          eq(transactions.status, "pending"),
          or(
            eq(transactions.mpesaTransactionId, parsed.conversationId),
            eq(transactions.mpesaTransactionId, parsed.originatorConversationId)
          )
        )
      )
      .limit(1);

    if (!pendingTx) {
      console.warn(
        "[B2C callback] No matching pending withdrawal transaction found for conversation ID:",
        parsed.conversationId || parsed.originatorConversationId
      );
      return;
    }

    if (parsed.success) {
      // Payout succeeded
      await db
        .update(transactions)
        .set({
          status: "completed",
          mpesaReceiptNumber: parsed.mpesaReceiptNumber,
          completedAt: new Date(),
          description: `Withdrawal completed – Receipt ${parsed.mpesaReceiptNumber}`,
        })
        .where(eq(transactions.id, pendingTx.id));

      console.log(`[B2C callback] ✅ Payout confirmed for tx ${pendingTx.id}, receipt: ${parsed.mpesaReceiptNumber}`);
    } else {
      // Payout failed on Safaricom's end (e.g. insufficient funds in B2C float, invalid phone, etc.)
      console.warn(`[B2C callback] ❌ Payout failed for tx ${pendingTx.id}: ${parsed.resultDesc}. Refunding user.`);

      await db.transaction(async (tx) => {
        const [refunded] = await tx
          .update(users)
          .set({
            balance: sql`${users.balance} + ${pendingTx.amount}::numeric`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, pendingTx.userId))
          .returning({ balance: users.balance });

        await tx
          .update(transactions)
          .set({
            status: "failed",
            balanceAfter: refunded?.balance,
            completedAt: new Date(),
            description: `Withdrawal failed: ${parsed.resultDesc} – refunded to wallet`,
          })
          .where(eq(transactions.id, pendingTx.id));
      });
    }
  } catch (err) {
    console.error("[B2C callback] Processing error:", err);
  }
});

// ─── POST /api/payments/mpesa/b2c-timeout ────────────────────────────────────
//
// PUBLIC – called by Safaricom when B2C request times out in their internal queue.
//
router.post("/api/payments/mpesa/b2c-timeout", async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  try {
    const parsed = parseB2CCallback(req.body);
    console.warn("[B2C timeout callback] Request timed out at Safaricom:", {
      conversationId: parsed.conversationId,
      originatorConversationId: parsed.originatorConversationId,
      resultDesc: parsed.resultDesc,
    });

    if (!parsed.conversationId && !parsed.originatorConversationId) return;

    const [pendingTx] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.type, "withdrawal"),
          eq(transactions.status, "pending"),
          or(
            eq(transactions.mpesaTransactionId, parsed.conversationId),
            eq(transactions.mpesaTransactionId, parsed.originatorConversationId)
          )
        )
      )
      .limit(1);

    if (pendingTx) {
      console.warn(`[B2C timeout] Refunding timed out transaction ${pendingTx.id} to user ${pendingTx.userId}`);
      await db.transaction(async (tx) => {
        const [refunded] = await tx
          .update(users)
          .set({
            balance: sql`${users.balance} + ${pendingTx.amount}::numeric`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, pendingTx.userId))
          .returning({ balance: users.balance });

        await tx
          .update(transactions)
          .set({
            status: "failed",
            balanceAfter: refunded?.balance,
            completedAt: new Date(),
            description: `Withdrawal timed out in M-Pesa queue – refunded to wallet`,
          })
          .where(eq(transactions.id, pendingTx.id));
      });
    }
  } catch (err) {
    console.error("[B2C timeout callback] Processing error:", err);
  }
});

// ─── POST /api/payments/c2b/validate ─────────────────────────────────────────
//
// PUBLIC – called by Safaricom before confirming a manual Paybill payment.
// Validates that BillRefNumber matches a registered user (phone or username).
// Returning ResultCode 0 = accept, 1 = reject.
//
router.post("/api/payments/c2b/validate", async (req, res) => {
  const payload = req.body as C2BValidationPayload;

  const result = await handleC2BValidation(payload, async (p) => {
    const ref = p.BillRefNumber?.trim();

    if (!ref) {
      // No ref provided — reject to prevent lost funds going to unknown account
      return { valid: false, message: "Account reference required. Use your username or phone number." };
    }

    // Try match by phone number (normalized: strip leading 0 or +254)
    const normalizedRef = ref.replace(/^\+?254/, "0").replace(/^0?/, "0");

    const byPhone = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneNumber, ref))
      .limit(1);

    if (byPhone.length > 0) return { valid: true, message: "Accepted" };

    // Try match by username (case-insensitive)
    const byUsername = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${ref})`)
      .limit(1);

    if (byUsername.length > 0) return { valid: true, message: "Accepted" };

    console.warn(`[C2B validation] Unknown ref: ${ref} from phone ${p.MSISDN}`);
    return {
      valid: false,
      message: `No account found for "${ref}". Use your registered phone number or username.`,
    };
  });

  res.json(result);
});

// ─── POST /api/payments/c2b/confirm ──────────────────────────────────────────
//
// PUBLIC – called by Safaricom after a manual Paybill payment is confirmed.
// Credits the matched user's balance and records the transaction.
//
router.post("/api/payments/c2b/confirm", async (req, res) => {
  const payload = req.body as C2BConfirmationPayload;

  // Ack Safaricom immediately
  res.json(handleC2BConfirmation(payload));

  try {
    const amount = parseFloat(payload.TransAmount);
    const ref = payload.BillRefNumber?.trim() ?? "";
    const mpesaReceiptNumber = payload.TransID;
    const senderPhone = payload.MSISDN;

    // Guard against duplicate confirmations
    const [dupe] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.mpesaReceiptNumber, mpesaReceiptNumber));

    if (dupe) {
      console.warn("[C2B confirmation] Duplicate ignored:", mpesaReceiptNumber);
      return;
    }

    // Resolve user by phone or username (same logic as validation)
    let userId: string | null = null;

    const byPhone = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneNumber, ref))
      .limit(1);

    if (byPhone.length > 0) {
      userId = byPhone[0].id;
    } else {
      const byUsername = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.username}) = lower(${ref})`)
        .limit(1);
      if (byUsername.length > 0) userId = byUsername[0].id;
    }

    if (!userId) {
      console.error("[C2B confirmation] Could not resolve user for ref:", ref, "receipt:", mpesaReceiptNumber);
      return;
    }

    // Get exchange rate to convert KES to USD
    const rate = await getUsdToKesRate();
    const usdAmount = (Number(amount) / rate).toFixed(2);

    // Credit balance in USD
    const [updatedUser] = await db
      .update(users)
      .set({
        balance: sql`${users.balance} + ${usdAmount}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ balance: users.balance });

    const newBalance = updatedUser?.balance ?? "0";

    // Record the transaction
    await db.insert(transactions).values({
      userId,
      amount: amount.toFixed(2),
      direction: "credit",
      type: "mpesa_c2b",
      status: "completed",
      mpesaReceiptNumber,
      mpesaTransactionId: payload.TransID,
      phoneNumber: senderPhone,
      balanceAfter: newBalance,
      completedAt: new Date(),
      description: `Manual Paybill deposit – receipt ${mpesaReceiptNumber}`,
    });

    console.log(
      `[C2B confirmation] ✅ Credited KES ${amount} to user ${userId}. New balance: ${newBalance}`
    );
  } catch (err) {
    console.error("[C2B confirmation] Processing error:", err);
  }
});

// ─── GET /api/payments/balance ────────────────────────────────────────────────
//
// Authenticated. Returns the current user's balance and recent transactions.
//
router.get("/api/payments/balance", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const [user] = await db
      .select({ balance: users.balance })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) return res.status(404).json({ error: "User not found" });

    const recentTx = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(sql`${transactions.createdAt} DESC`)
      .limit(20);

    res.json({
      balance: parseFloat(user.balance ?? "0"),
      currency: "USD",
      transactions: recentTx.map((tx) => ({
        id: tx.id,
        amount: parseFloat(tx.amount),
        direction: tx.direction,
        type: tx.type,
        status: tx.status,
        mpesaReceiptNumber: tx.mpesaReceiptNumber,
        description: tx.description,
        createdAt: tx.createdAt,
        completedAt: tx.completedAt,
      })),
    });
  } catch (err) {
    console.error("[payments] balance error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/payments/mpesa/register-c2b ───────────────────────────────────
//
// Admin only. Registers C2B webhook URLs with Safaricom (run once, or on URL change).
//
router.post("/api/payments/mpesa/register-c2b", authMiddleware, async (req: AuthRequest, res) => {
  if (req.user!.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin only" });
  }

  try {
    const mpesa = getMpesaService();
    const result = await mpesa.registerC2BURLs();
    res.json({ message: "C2B URLs registered", result });
  } catch (err: any) {
    console.error("[payments] C2B registration error:", err);
    res.status(502).json({ error: err.message || "Failed to register C2B URLs" });
  }
});

// ─── CRYPTO PAYMENTS (USDT via NOWPayments) ──────────────────────────────────

// GET /api/payments/crypto/config
// Returns supported networks and deposit minimums
router.get("/api/payments/crypto/config", (_req, res) => {
  res.json({
    networks: Object.values(SUPPORTED_CRYPTO_NETWORKS),
    defaultNetwork: "TRC20",
    minDepositUSD: 10,
  });
});

// GET /api/payments/crypto/currencies
// Admin only. Lists gateway currencies and which configured networks are usable.
router.get("/api/payments/crypto/currencies", authMiddleware, async (req: AuthRequest, res) => {
  if (req.user!.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin only" });
  }

  try {
    const cryptoService = CryptoPaymentService.getInstance();
    const currencies = await cryptoService.getEnabledCurrencies();
    if (!currencies) {
      return res.status(502).json({ error: "Could not fetch currencies from the payment gateway." });
    }

    res.json({
      count: currencies.length,
      currencies,
      supported: Object.values(SUPPORTED_CRYPTO_NETWORKS).map((network) => ({
        network: network.id,
        currency: network.currency,
        enabled: currencies.includes(network.currency),
      })),
    });
  } catch (err: any) {
    console.error("[payments] crypto currencies error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch currencies" });
  }
});

// POST /api/payments/crypto/deposit
// Authenticated. Creates a pending transaction and crypto invoice with a deposit address.
router.post("/api/payments/crypto/deposit", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { amount, network = "TRC20" } = req.body;

    const netKey = (network || "TRC20").toUpperCase();
    const netConfig = SUPPORTED_CRYPTO_NETWORKS[netKey];
    if (!netConfig) {
      return res.status(400).json({ error: `Unsupported crypto network: ${network}. Choose TRC20, BEP20, or POLYGON.` });
    }

    const numAmount = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(numAmount) || numAmount < netConfig.minDepositUSD) {
      return res.status(400).json({ error: `Minimum deposit is ${netConfig.minDepositUSD} USD` });
    }

    // Check user exists
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    // Step 1: Create a pending ledger entry in transactions
    const [txRecord] = await db
      .insert(transactions)
      .values({
        userId,
        amount: numAmount.toFixed(2),
        direction: "credit",
        type: "crypto_deposit",
        status: "pending",
        description: `Pending USDT deposit via ${netConfig.name}`,
      })
      .returning();

    // Step 2: Create payment invoice via CryptoPaymentService
    const host = req.get("host") || "localhost:3001";
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const ipnCallbackUrl = `${protocol}://${host}/api/payments/crypto/ipn`;

    const cryptoService = CryptoPaymentService.getInstance();
    const invoice = await cryptoService.createInvoice({
      userId,
      transactionId: txRecord.id,
      amountUSD: numAmount,
      networkKey: netConfig.id,
      ipnCallbackUrl,
    });

    // Step 3: Record pending crypto payment
    await db.insert(cryptoPendingPayments).values({
      userId,
      transactionId: txRecord.id,
      paymentId: invoice.paymentId,
      payAddress: invoice.payAddress,
      payCurrency: invoice.payCurrency,
      network: invoice.network,
      amountUSD: numAmount.toFixed(2),
      payAmount: invoice.payAmount.toFixed(8),
      status: "waiting",
    });

    res.json({
      success: true,
      transactionId: txRecord.id,
      paymentId: invoice.paymentId,
      payAddress: invoice.payAddress,
      payAmount: invoice.payAmount,
      payCurrency: invoice.payCurrency,
      network: invoice.network,
      qrCodeUrl: invoice.qrCodeUrl,
      isSandbox: invoice.isSandbox,
      confirmationsNeeded: netConfig.confirmationsNeeded,
      message: `Send ${invoice.payAmount} USDT via ${netConfig.name} to the address provided.`,
    });
  } catch (err: any) {
    console.error("[payments] crypto deposit error:", err);
    res.status(500).json({ error: err.message || "Failed to initiate crypto deposit" });
  }
});

// GET /api/payments/crypto/status/:paymentId
// Authenticated. Checks on-chain / gateway status of an invoice.
router.get("/api/payments/crypto/status/:paymentId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { paymentId } = req.params;
    const userId = req.user!.id;

    const [pending] = await db
      .select()
      .from(cryptoPendingPayments)
      .where(and(eq(cryptoPendingPayments.paymentId, paymentId), eq(cryptoPendingPayments.userId, userId)));

    if (!pending) {
      return res.status(404).json({ error: "Payment record not found" });
    }

    // If still waiting and connected to live gateway, query gateway status
    if (pending.status === "waiting" || pending.status === "confirming") {
      const cryptoService = CryptoPaymentService.getInstance();
      const statusData = await cryptoService.getPaymentStatus(paymentId);
      if (statusData && statusData.payment_status) {
        const gwStatus = statusData.payment_status; // "confirming", "finished", "failed", etc.
        if (gwStatus !== pending.status) {
          if (gwStatus === "finished" || gwStatus === "confirmed") {
            // Apply atomic settlement
            await settleCryptoPayment(paymentId, {
              actuallyPaid: Number(statusData.actually_paid),
              priceAmount: Number(statusData.price_amount),
              payAmount: Number(statusData.pay_amount),
              txHash: statusData.tx_hash,
            });
            pending.status = "finished";
          } else {
            await db
              .update(cryptoPendingPayments)
              .set({ status: gwStatus, updatedAt: new Date() })
              .where(eq(cryptoPendingPayments.id, pending.id));
            pending.status = gwStatus;
          }
        }
      }
    }

    res.json({
      paymentId: pending.paymentId,
      status: pending.status,
      payAddress: pending.payAddress,
      payCurrency: pending.payCurrency,
      network: pending.network,
      amountUSD: Number(pending.amountUSD),
      txHash: pending.txHash,
      isCompleted: pending.status === "finished",
    });
  } catch (err: any) {
    console.error("[payments] crypto status error:", err);
    res.status(500).json({ error: "Failed to fetch crypto payment status" });
  }
});

interface CryptoPaymentData {
  actuallyPaid?: number;
  priceAmount?: number;
  payAmount?: number;
  txHash?: string;
}

function resolveCreditedUsd(requestedUsd: number, data: CryptoPaymentData): number {
  const baseUsd = data.priceAmount && data.priceAmount > 0 ? data.priceAmount : requestedUsd;
  const paid = data.actuallyPaid;
  const quoted = data.payAmount;
  if (paid && paid > 0 && quoted && quoted > 0) {
    const paidUsd = baseUsd * (paid / quoted);
    return Math.max(0, Math.min(paidUsd, requestedUsd));
  }
  return requestedUsd;
}

// Helper: Settles crypto payment atomically
async function settleCryptoPayment(paymentId: string, data: CryptoPaymentData = {}) {
  return await db.transaction(async (tx) => {
    const [pending] = await tx
      .select()
      .from(cryptoPendingPayments)
      .where(eq(cryptoPendingPayments.paymentId, paymentId));

    if (!pending) {
      console.warn(`[CryptoSettle] No pending record for paymentId: ${paymentId}`);
      return false;
    }

    if (pending.status === "finished") {
      return true;
    }

    const requestedUsd = parseFloat(pending.amountUSD);
    const creditedUsd = resolveCreditedUsd(requestedUsd, data);

    const [locked] = await tx
      .update(cryptoPendingPayments)
      .set({
        status: "finished",
        txHash: data.txHash || pending.txHash,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cryptoPendingPayments.id, pending.id),
          ne(cryptoPendingPayments.status, "finished")
        )
      )
      .returning({ id: cryptoPendingPayments.id });

    if (!locked) {
      return true;
    }

    const [pendingTx] = await tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, pending.transactionId), eq(transactions.status, "pending")));

    if (!pendingTx) {
      console.warn(`[CryptoSettle] Transaction already settled or not found: ${pending.transactionId}`);
      return true;
    }

    const [updatedUser] = await tx
      .update(users)
      .set({
        balance: sql`${users.balance} + ${creditedUsd.toFixed(2)}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, pending.userId))
      .returning({ balance: users.balance });

    const newBalance = updatedUser?.balance ?? "0";

    await tx
      .update(transactions)
      .set({
        status: "completed",
        amount: creditedUsd.toFixed(2),
        balanceAfter: newBalance,
        completedAt: new Date(),
        description: `Deposit via USDT (${pending.network}) - Invoice ${paymentId}`,
      })
      .where(eq(transactions.id, pendingTx.id));

    console.log(`[CryptoSettle] Credited ${creditedUsd.toFixed(2)} USD to user ${pending.userId} for invoice ${paymentId}`);
    return true;
  });
}

// POST /api/payments/crypto/ipn
// Public webhook from NOWPayments
router.post("/api/payments/crypto/ipn", async (req, res) => {
  try {
    const cryptoService = CryptoPaymentService.getInstance();
    const signature = req.headers["x-nowpayments-sig"] as string | undefined;

    const isValid = cryptoService.verifyIpnSignature(req.body, signature);
    if (!isValid) {
      console.warn("[CryptoIPN] Invalid webhook signature rejected");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const { payment_id, payment_status, actually_paid, pay_amount, pay_address } = req.body;
    console.log(`[CryptoIPN] Received webhook for payment ${payment_id}: status=${payment_status}`);

    if (!payment_id) {
      return res.status(400).json({ error: "Missing payment_id" });
    }

    const stringPaymentId = String(payment_id);

    if (payment_status === "finished" || payment_status === "confirmed") {
      await settleCryptoPayment(stringPaymentId, {
        actuallyPaid: Number(actually_paid),
        priceAmount: Number(req.body.price_amount),
        payAmount: Number(req.body.pay_amount ?? pay_amount),
        txHash: req.body.tx_hash,
      });
    } else {
      // Update intermediate status (e.g., "confirming", "partially_paid", "failed")
      await db
        .update(cryptoPendingPayments)
        .set({
          status: payment_status,
          updatedAt: new Date(),
        })
        .where(eq(cryptoPendingPayments.paymentId, stringPaymentId));
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("[CryptoIPN] Error handling IPN callback:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/payments/crypto/simulate-pay
// Authenticated testing endpoint for development / sandbox testing
router.post("/api/payments/crypto/simulate-pay", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { paymentId } = req.body;
    const userId = req.user!.id;

    if (!paymentId) {
      return res.status(400).json({ error: "paymentId is required" });
    }

    const [pending] = await db
      .select()
      .from(cryptoPendingPayments)
      .where(and(eq(cryptoPendingPayments.paymentId, paymentId), eq(cryptoPendingPayments.userId, userId)));

    if (!pending) {
      return res.status(404).json({ error: "Pending payment not found" });
    }

    const fakeTxHash = `0xsim_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const settled = await settleCryptoPayment(paymentId, { txHash: fakeTxHash });

    if (settled) {
      res.json({
        success: true,
        message: "Payment simulation completed. Balance updated successfully!",
        txHash: fakeTxHash,
      });
    } else {
      res.status(400).json({ error: "Payment was already settled or cannot be processed" });
    }
  } catch (err: any) {
    console.error("[payments] simulate-pay error:", err);
    res.status(500).json({ error: "Simulation failed" });
  }
});

export default router;
