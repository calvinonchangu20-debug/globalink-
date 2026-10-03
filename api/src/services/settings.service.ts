import { db } from "../db/index.js";
import { systemSettings } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

let cachedMinWithdrawal: number | null = null;
let cacheExpiry = 0;

/**
 * Initializes the system_settings table if it doesn't exist and seeds default values.
 * Called on application startup.
 */
export async function initSystemSettings(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "system_settings" (
        "key" varchar(100) PRIMARY KEY NOT NULL,
        "value" text NOT NULL,
        "description" text,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    await db.execute(sql`
      INSERT INTO "system_settings" ("key", "value", "description")
      VALUES ('min_withdrawal_usd', '5.00', 'Minimum withdrawal amount in USD')
      ON CONFLICT ("key") DO NOTHING;
    `);

    console.log("[settings] System settings table verified & initialized.");
  } catch (err: any) {
    console.error("[settings] Error during system_settings initialization:", err.message);
  }
}

/**
 * Retrieves a setting value by key with fallback.
 */
export async function getSetting(key: string, defaultValue: string): Promise<string> {
  try {
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key));

    return row?.value ?? defaultValue;
  } catch (err: any) {
    console.error(`[settings] Error reading setting '${key}':`, err.message);
    return defaultValue;
  }
}

/**
 * Sets or updates a setting by key.
 */
export async function setSetting(
  key: string,
  value: string,
  description?: string
): Promise<void> {
  await db
    .insert(systemSettings)
    .values({
      key,
      value,
      description,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value,
        description: description ?? sql`${systemSettings.description}`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Returns the currently configured minimum withdrawal limit in USD.
 * Uses a short in-memory cache to avoid repeated DB queries on hot paths.
 */
export async function getMinWithdrawalUSD(): Promise<number> {
  const now = Date.now();
  if (cachedMinWithdrawal !== null && now < cacheExpiry) {
    return cachedMinWithdrawal;
  }

  const rawVal = await getSetting("min_withdrawal_usd", "5.00");
  const parsed = parseFloat(rawVal);
  const result = Number.isFinite(parsed) && parsed > 0 ? parsed : 5.0;

  cachedMinWithdrawal = result;
  cacheExpiry = now + 30000; // 30 seconds TTL
  return result;
}

/**
 * Updates the minimum withdrawal limit in USD.
 */
export async function setMinWithdrawalUSD(amount: number): Promise<void> {
  cachedMinWithdrawal = amount;
  cacheExpiry = Date.now() + 30000;

  await setSetting(
    "min_withdrawal_usd",
    amount.toFixed(2),
    "Minimum withdrawal amount in USD"
  );
}

/**
 * Retrieves all platform settings for the admin panel.
 */
export async function getAllSettings(): Promise<
  Array<{ key: string; value: string; description: string | null; updatedAt: Date }>
> {
  try {
    return await db.select().from(systemSettings);
  } catch (err: any) {
    console.error("[settings] Error reading all settings:", err.message);
    return [
      {
        key: "min_withdrawal_usd",
        value: "5.00",
        description: "Minimum withdrawal amount in USD",
        updatedAt: new Date(),
      },
    ];
  }
}
