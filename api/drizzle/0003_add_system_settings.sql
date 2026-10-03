-- ─── System Settings Table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "system_settings" (
  "key" varchar(100) PRIMARY KEY NOT NULL,
  "value" text NOT NULL,
  "description" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Seed default minimum withdrawal ($5.00 USD)
INSERT INTO "system_settings" ("key", "value", "description")
VALUES ('min_withdrawal_usd', '5.00', 'Minimum withdrawal amount in USD')
ON CONFLICT ("key") DO NOTHING;
