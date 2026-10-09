import axios from "axios";
import crypto from "crypto";
import QRCode from "qrcode";

export interface CryptoNetworkConfig {
  id: string; // e.g., 'TRC20'
  name: string; // e.g., 'Tron (TRC-20)'
  currency: string; // NOWPayments code: 'usdttrc20'
  symbol: string; // 'USDT'
  minDepositUSD: number;
  confirmationsNeeded: number;
}

export const SUPPORTED_CRYPTO_NETWORKS: Record<string, CryptoNetworkConfig> = {
  TRC20: {
    id: "TRC20",
    name: "Tron (TRC-20)",
    currency: "usdttrc20",
    symbol: "USDT",
    minDepositUSD: 10,
    confirmationsNeeded: 1,
  },
  BEP20: {
    id: "BEP20",
    name: "BNB Smart Chain (BEP-20)",
    currency: "usdtbsc",
    symbol: "USDT",
    minDepositUSD: 10,
    confirmationsNeeded: 3,
  },
  POLYGON: {
    id: "POLYGON",
    name: "Polygon (MATIC)",
    currency: "usdtmatic",
    symbol: "USDT",
    minDepositUSD: 10,
    confirmationsNeeded: 12,
  },
};

export interface CreateCryptoInvoiceParams {
  userId: string;
  transactionId: string;
  amountUSD: number;
  networkKey: string; // 'TRC20' | 'BEP20' | 'POLYGON'
  ipnCallbackUrl?: string;
}

export interface CryptoInvoiceResult {
  paymentId: string;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  network: string;
  qrCodeUrl: string;
  isSandbox: boolean;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysDeep(source[key]);
    }
    return sorted;
  }
  return value;
}

async function buildQrDataUrl(address: string): Promise<string> {
  return QRCode.toDataURL(address, { width: 250, margin: 1 });
}

export class CryptoPaymentService {
  private static instance: CryptoPaymentService;
  private apiKey: string | null;
  private ipnSecret: string | null;
  private apiUrl: string;
  private currencyCache: { fetchedAt: number; currencies: string[] } | null = null;

  private constructor() {
    this.apiKey = process.env.NOWPAYMENTS_API_KEY || null;
    this.ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET || null;
    this.apiUrl = process.env.NOWPAYMENTS_API_URL || "https://api.nowpayments.io/v1";
  }

  public static getInstance(): CryptoPaymentService {
    if (!CryptoPaymentService.instance) {
      CryptoPaymentService.instance = new CryptoPaymentService();
    }
    return CryptoPaymentService.instance;
  }

  public async getEnabledCurrencies(): Promise<string[] | null> {
    if (!this.apiKey) return null;
    const now = Date.now();
    if (this.currencyCache && now - this.currencyCache.fetchedAt < 60 * 60 * 1000) {
      return this.currencyCache.currencies;
    }
    try {
      const { data } = await axios.get(`${this.apiUrl}/currencies`, {
        headers: { "x-api-key": this.apiKey },
      });
      const currencies: string[] = Array.isArray(data?.currencies) ? data.currencies : [];
      this.currencyCache = { fetchedAt: now, currencies };
      return currencies;
    } catch (err: any) {
      console.error(
        "[CryptoService] Failed to fetch enabled currencies:",
        err?.response?.data || err.message
      );
      return null;
    }
  }

  public async createInvoice(params: CreateCryptoInvoiceParams): Promise<CryptoInvoiceResult> {
    const network = SUPPORTED_CRYPTO_NETWORKS[params.networkKey];
    if (!network) {
      throw new Error(`Unsupported crypto network: ${params.networkKey}`);
    }

    const isSandbox = !this.apiKey || this.apiKey.trim() === "";

    if (isSandbox) {
      const hash = crypto.createHash("sha256").update(params.transactionId).digest("hex");

      let payAddress = "";
      if (network.id === "TRC20") {
        payAddress = `TX${hash.substring(0, 32)}`;
      } else {
        payAddress = `0x${hash.substring(0, 40)}`;
      }

      const mockPaymentId = `now_${Date.now()}_${params.transactionId.substring(0, 8)}`;

      return {
        paymentId: mockPaymentId,
        payAddress,
        payAmount: params.amountUSD,
        payCurrency: network.currency,
        network: network.id,
        qrCodeUrl: await buildQrDataUrl(payAddress),
        isSandbox: true,
      };
    }

    const enabledCurrencies = await this.getEnabledCurrencies();
    if (enabledCurrencies && !enabledCurrencies.includes(network.currency)) {
      throw new Error(
        `Currency "${network.currency}" is not enabled on the payment gateway account.`
      );
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/payment`,
        {
          price_amount: params.amountUSD,
          price_currency: "usd",
          pay_currency: network.currency,
          ipn_callback_url: params.ipnCallbackUrl,
          order_id: params.transactionId,
          order_description: `Deposit ${params.amountUSD} USD via ${network.name}`,
        },
        {
          headers: {
            "x-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
        }
      );

      const data = response.data;
      const payAddress = data.pay_address;
      const paymentId = String(data.payment_id);
      const payAmount = Number(data.pay_amount || params.amountUSD);

      return {
        paymentId,
        payAddress,
        payAmount,
        payCurrency: network.currency,
        network: network.id,
        qrCodeUrl: await buildQrDataUrl(payAddress),
        isSandbox: false,
      };
    } catch (err: any) {
      console.error("[CryptoService] NOWPayments create payment error:", err?.response?.data || err.message);
      throw new Error(err?.response?.data?.message || "Failed to create crypto deposit invoice");
    }
  }

  public verifyIpnSignature(rawBody: unknown, signatureHeader?: string): boolean {
    if (!this.ipnSecret) {
      console.error("[CryptoService] NOWPAYMENTS_IPN_SECRET not configured; rejecting IPN");
      return false;
    }

    if (!signatureHeader) {
      return false;
    }

    try {
      const payloadString = JSON.stringify(sortKeysDeep(rawBody));
      const hmac = crypto.createHmac("sha512", this.ipnSecret);
      hmac.update(payloadString);
      const digest = hmac.digest("hex");

      const expected = Buffer.from(digest, "utf8");
      const received = Buffer.from(signatureHeader, "utf8");
      if (expected.length !== received.length) {
        return false;
      }

      return crypto.timingSafeEqual(expected, received);
    } catch (e) {
      console.error("[CryptoService] Signature verification exception:", e);
      return false;
    }
  }

  public async getPaymentStatus(paymentId: string): Promise<any> {
    if (!this.apiKey) {
      return null;
    }

    try {
      const response = await axios.get(`${this.apiUrl}/payment/${paymentId}`, {
        headers: {
          "x-api-key": this.apiKey,
        },
      });
      return response.data;
    } catch (err: any) {
      console.error(`[CryptoService] Failed to check status for ${paymentId}:`, err?.response?.data || err.message);
      return null;
    }
  }
}
