-- ─── Users: add trading engine selection ─────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "trading_engine" varchar(20) NOT NULL DEFAULT 'standard';