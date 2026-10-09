DO $$ BEGIN
  ALTER TYPE "public"."tx_type" ADD VALUE IF NOT EXISTS 'subscription';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "signal_subscriptions" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"        uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "plan"           varchar(20) NOT NULL,
  "amount_usd"     numeric(14, 2) NOT NULL,
  "status"         varchar(20) NOT NULL DEFAULT 'active',
  "started_at"     timestamp DEFAULT now() NOT NULL,
  "expires_at"     timestamp NOT NULL,
  "transaction_id" uuid REFERENCES "transactions"("id") ON DELETE SET NULL,
  "created_at"     timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "signal_subscriptions_user_status_idx"
  ON "signal_subscriptions" ("user_id", "status");
