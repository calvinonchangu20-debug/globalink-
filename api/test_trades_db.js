import { db } from "./dist/db/index.js";
import { trades, users } from "./dist/db/schema.js";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

async function check() {
  const allUsers = await db.select().from(users);
  console.log("USERS:", allUsers.map(u => ({ id: u.id, username: u.username, balance: u.balance })));
  
  const allTrades = await db.select().from(trades);
  console.log("TRADES_IN_DB:", allTrades);
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
