-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "public"."tx_direction" AS ENUM('credit', 'debit');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."tx_type" AS ENUM('mpesa_stk', 'mpesa_c2b', 'withdrawal', 'adjustment');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."tx_status" AS ENUM('pending', 'completed', 'failed', 'reversed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Users: add balance column ────────────────────────────────────────────────

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "balance" numeric(14, 2) NOT NULL DEFAULT 0.00;

-- ─── Transactions (immutable ledger) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "transactions" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"              uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "amount"               numeric(14, 2) NOT NULL,
  "direction"            "tx_direction" NOT NULL,
  "type"                 "tx_type" NOT NULL,
  "status"               "tx_status" NOT NULL DEFAULT 'pending',
  "mpesa_receipt_number" varchar(50),
  "mpesa_transaction_id" varchar(100),
  "phone_number"         varchar(20),
  "description"          text,
  "balance_after"        numeric(14, 2),
  "reversal_of_id"       uuid,
  "created_at"           timestamp DEFAULT now() NOT NULL,
  "completed_at"         timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "transactions_mpesa_receipt_idx"
  ON "transactions" ("mpesa_receipt_number")
  WHERE "mpesa_receipt_number" IS NOT NULL;

-- ─── M-Pesa Pending STK Pushes ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "mpesa_pending_stk" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"             uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "transaction_id"      uuid NOT NULL REFERENCES "transactions"("id") ON DELETE CASCADE,
  "merchant_request_id" varchar(100) NOT NULL,
  "checkout_request_id" varchar(100) NOT NULL,
  "amount"              numeric(14, 2) NOT NULL,
  "phone_number"        varchar(20) NOT NULL,
  "created_at"          timestamp DEFAULT now() NOT NULL,
  "expires_at"          timestamp NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "mpesa_pending_stk_checkout_idx"
  ON "mpesa_pending_stk" ("checkout_request_id");
