import express from "express";
import { getUsdToKesRate } from "../services/exchange.service.js";
import { eq, and, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, transactions, mpesaPendingStk } from "../db/schema.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
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

export default router;
