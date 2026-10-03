import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load .env from parent directory since the api is in a monorepo structure
dotenv.config({ path: "../.env" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!,
  },
});
