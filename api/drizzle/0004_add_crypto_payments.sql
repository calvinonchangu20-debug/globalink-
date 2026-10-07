-- ─── Add crypto transaction types ──────────────────────────────────────────
DO $$ BEGIN
  ALTER TYPE "public"."tx_type" ADD VALUE IF NOT EXISTS 'crypto_deposit';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "public"."tx_type" ADD VALUE IF NOT EXISTS 'crypto_withdrawal';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── Crypto Pending Payments (NOWPayments) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "crypto_pending_payments" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"        uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "transaction_id" uuid NOT NULL REFERENCES "transactions"("id") ON DELETE CASCADE,
  "payment_id"     varchar(100) NOT NULL,
  "pay_address"    varchar(255) NOT NULL,
  "pay_currency"   varchar(30) NOT NULL,
  "network"        varchar(50) NOT NULL,
  "amount_usd"     numeric(14, 2) NOT NULL,
  "pay_amount"     numeric(18, 8),
  "status"         varchar(50) NOT NULL DEFAULT 'waiting',
  "tx_hash"        varchar(255),
  "created_at"     timestamp DEFAULT now() NOT NULL,
  "updated_at"     timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "crypto_pending_payment_id_idx"
  ON "crypto_pending_payments" ("payment_id");
