DO $$ BEGIN
  CREATE TYPE "public"."trade_type" AS ENUM('call', 'put', 'even', 'odd', 'match', 'differ', 'over', 'under');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."trade_status" AS ENUM('open', 'won', 'lost', 'tie', 'refunded');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "public"."tx_type" ADD VALUE IF NOT EXISTS 'trade_stake';
ALTER TYPE "public"."tx_type" ADD VALUE IF NOT EXISTS 'trade_payout';

CREATE TABLE IF NOT EXISTS "trades" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "symbol" varchar(50) NOT NULL,
  "type" "trade_type" NOT NULL,
  "stake" numeric(14, 2) NOT NULL,
  "payout_multiplier" numeric(5, 4) NOT NULL,
  "entry_price" numeric(20, 6) NOT NULL,
  "exit_price" numeric(20, 6),
  "entry_time" timestamp NOT NULL,
  "expiry_time" timestamp NOT NULL,
  "status" "trade_status" NOT NULL DEFAULT 'open',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
