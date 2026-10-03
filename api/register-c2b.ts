/**
 * One-shot script to register M-Pesa C2B callback URLs with Safaricom Daraja.
 * Run once after each new deployment or URL change.
 *
 * Usage (from api/ directory):
 *   npx tsx register-c2b.ts
 *   API_URL=https://api.globalinktraders.com npx tsx register-c2b.ts
 */
import "dotenv/config";
import { getMpesaService } from "./src/services/mpesa.service";

const apiBase = (() => {
  let url = (process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3001}`).trim();
  if (!/^https?:\/\//i.test(url)) {
    const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/i.test(url);
    url = `${isLocal ? "http" : "https"}://${url}`;
  }
  return url.replace(/\/+$/, "");
})();

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  M-Pesa C2B URL Registration");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`  Environment : ${process.env.MPESA_ENVIRONMENT ?? "sandbox"}`);
console.log(`  ShortCode   : ${process.env.MPESA_BUSINESS_SHORTCODE}`);
console.log(`  API base    : ${apiBase}`);
console.log(`  Validation  : ${apiBase}/api/payments/c2b/validate`);
console.log(`  Confirmation: ${apiBase}/api/payments/c2b/confirm`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

async function main() {
  try {
    const mpesa = getMpesaService();
    console.log("Sending registration request to Safaricom Daraja…\n");
    const result = await mpesa.registerC2BURLs();
    console.log("✅  Registration successful!");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("❌  Registration failed:", err.message ?? err);
    process.exit(1);
  }
}

main();
