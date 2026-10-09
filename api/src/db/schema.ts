import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  numeric,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Direction of a ledger entry from the user's perspective */
export const txDirectionEnum = pgEnum("tx_direction", ["credit", "debit"]);

/**
 * How this transaction was initiated:
 *  - mpesa_stk  → user triggered STK push from the app
 *  - mpesa_c2b  → user sent manually via SIM toolkit / Paybill
 *  - withdrawal → user requested a payout (B2C)
 *  - adjustment → manual admin adjustment
 */
export const txTypeEnum = pgEnum("tx_type", [
  "mpesa_stk",
  "mpesa_c2b",
  "crypto_deposit",
  "crypto_withdrawal",
  "withdrawal",
  "adjustment",
  "trade_stake",
  "trade_payout",
  "subscription",
]);

/** Lifecycle of a wallet transaction */
export const txStatusEnum = pgEnum("tx_status", [
  "pending",    // STK push sent, awaiting callback
  "completed",  // Funds confirmed and balance updated
  "failed",     // Payment failed or was cancelled
  "reversed",   // Completed but later reversed (admin)
]);

export const tradeTypeEnum = pgEnum("trade_type", [
  "call", "put",
  "even", "odd",
  "match", "differ",
  "over", "under"
]);

export const tradeStatusEnum = pgEnum("trade_status", [
  "open",
  "won",
  "lost",
  "tie",
  "refunded"
]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  secondName: varchar("second_name", { length: 255 }).notNull(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  phoneNumber: varchar("phone_number", { length: 20 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash"),
  role: varchar("role", { length: 50 }).notNull().default("USER"),
  otp: varchar("otp", { length: 6 }),
  otpExpiry: timestamp("otp_expiry"),
  /**
   * Current wallet balance in USD (2 decimal places).
   * Always kept in sync with the sum of completed transactions.
   * Do NOT update directly – always go through the transactions table.
   */
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Transactions (Immutable Ledger) ─────────────────────────────────────────

/**
 * Every credit or debit to a user's balance is recorded here.
 * Records are never deleted; reversals are new rows with direction='debit'.
 */
export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),

  /** Amount in KES – always positive; direction tells you credit vs debit */
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  direction: txDirectionEnum("direction").notNull(),
  type: txTypeEnum("type").notNull(),
  status: txStatusEnum("status").notNull().default("pending"),

  /** Safaricom receipt number – unique per completed M-Pesa transaction */
  mpesaReceiptNumber: varchar("mpesa_receipt_number", { length: 50 }),

  /** CheckoutRequestID for STK push, or TransID for C2B */
  mpesaTransactionId: varchar("mpesa_transaction_id", { length: 100 }),

  /** Phone number the payment came from / was sent to */
  phoneNumber: varchar("phone_number", { length: 20 }),

  /** Human-readable note (e.g. "Deposit via STK", "Manual withdrawal") */
  description: text("description"),

  /** Balance snapshot after this transaction was applied (for audit trail) */
  balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }),

  /** If this row reverses a previous transaction, link it here */
  reversalOfId: uuid("reversal_of_id"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// ─── M-Pesa Pending STK Pushes ────────────────────────────────────────────────

/**
 * Tracks in-flight STK push requests. Created when we call initiateSTKPush,
 * deleted (or marked resolved) once the Safaricom callback arrives.
 *
 * This lets us:
 *  1. Avoid duplicate pushes for the same pending deposit.
 *  2. Recover missed callbacks via querySTKStatus polling.
 *  3. Link the callback back to the correct user + transaction.
 */
export const mpesaPendingStk = pgTable(
  "mpesa_pending_stk",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** The transaction row created when the STK push was initiated */
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),

    merchantRequestId: varchar("merchant_request_id", { length: 100 }).notNull(),
    checkoutRequestId: varchar("checkout_request_id", { length: 100 }).notNull(),

    /** Amount requested in KES */
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),

    /** Phone number the push was sent to */
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),

    /** STK pushes expire after ~5 minutes on Safaricom's end */
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [uniqueIndex("mpesa_pending_stk_checkout_idx").on(table.checkoutRequestId)]
);

// ─── Crypto Pending Payments (NOWPayments / USDT) ───────────────────────────

export const cryptoPendingPayments = pgTable(
  "crypto_pending_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),

    paymentId: varchar("payment_id", { length: 100 }).notNull(),
    payAddress: varchar("pay_address", { length: 255 }).notNull(),
    payCurrency: varchar("pay_currency", { length: 30 }).notNull(), // e.g. "usdttrc20", "usdtbsc", "usdtpolygon"
    network: varchar("network", { length: 50 }).notNull(), // e.g. "TRC20", "BEP20", "POLYGON"
    amountUSD: numeric("amount_usd", { precision: 14, scale: 2 }).notNull(),
    payAmount: numeric("pay_amount", { precision: 18, scale: 8 }),
    status: varchar("status", { length: 50 }).notNull().default("waiting"), // waiting, confirming, finished, failed, expired
    txHash: varchar("tx_hash", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("crypto_pending_payment_id_idx").on(table.paymentId)]
);

// ─── Trades (Binary Options Engine) ──────────────────────────────────────────

export const trades = pgTable("trades", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),

  symbol: varchar("symbol", { length: 50 }).notNull(),
  type: tradeTypeEnum("type").notNull(),
  
  /** Stake amount in USD */
  stake: numeric("stake", { precision: 14, scale: 2 }).notNull(),
  
  /** Multiplier for a win (e.g., 1.95 means a 95% profit on top of stake return) */
  payoutMultiplier: numeric("payout_multiplier", { precision: 5, scale: 4 }).notNull(),
  
  /** The price of the asset at entry time */
  entryPrice: numeric("entry_price", { precision: 20, scale: 6 }).notNull(),
  
  /** The price of the asset at expiry time (null until settled) */
  exitPrice: numeric("exit_price", { precision: 20, scale: 6 }),
  
  /** The exact timestamp when the trade was accepted and entry price was locked */
  entryTime: timestamp("entry_time").notNull(),
  
  /** The exact timestamp when the trade expires */
  expiryTime: timestamp("expiry_time").notNull(),
  
  status: tradeStatusEnum("status").notNull().default("open"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── System Settings ─────────────────────────────────────────────────────────

export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const signalSubscriptions = pgTable(
  "signal_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    plan: varchar("plan", { length: 20 }).notNull(),
    amountUsd: numeric("amount_usd", { precision: 14, scale: 2 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),

    startedAt: timestamp("started_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),

    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("signal_subscriptions_user_status_idx").on(table.userId, table.status),
  ]
);
