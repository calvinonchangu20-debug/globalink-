import axios from 'axios';

let cachedRate: number | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

export async function getUsdToKesRate(): Promise<number> {
  const now = Date.now();
  if (cachedRate !== null && (now - lastFetchTime) < CACHE_DURATION_MS) {
    return cachedRate;
  }

  try {
    const response = await axios.get('https://open.er-api.com/v6/latest/USD');
    const rate = response.data?.rates?.KES;
    if (rate && typeof rate === 'number') {
      cachedRate = rate;
      lastFetchTime = now;
      console.log(`[Exchange] Fetched new USD->KES rate: ${rate}`);
      return rate;
    }
    throw new Error("Invalid response from exchange rate API");
  } catch (error) {
    console.error("[Exchange] Failed to fetch real-time exchange rate:", error);
    // Fallback to a sensible default if the API is down
    return cachedRate || 130.0;
  }
}
