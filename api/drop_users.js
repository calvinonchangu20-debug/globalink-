import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);
async function run() {
  await sql`DROP TABLE IF EXISTS users CASCADE`;
  console.log("Users table dropped");
}
run();
