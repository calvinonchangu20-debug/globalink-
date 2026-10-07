import axios from "axios";
import crypto from "crypto";

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

export class CryptoPaymentService {
  private static instance: CryptoPaymentService;
  private apiKey: string | null;
  private ipnSecret: string | null;
  private apiUrl: string;

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

  /**
   * Creates a crypto payment invoice with a dedicated deposit address.
   */
  public async createInvoice(params: CreateCryptoInvoiceParams): Promise<CryptoInvoiceResult> {
    const network = SUPPORTED_CRYPTO_NETWORKS[params.networkKey] || SUPPORTED_CRYPTO_NETWORKS.TRC20;
    const isSandbox = !this.apiKey || this.apiKey.trim() === "";

    if (isSandbox) {
      // Deterministic mock test address for local development / testing
      const hash = crypto
        .createHash("sha256")
        .update(params.transactionId)
        .digest("hex");
      
      let payAddress = "";
      if (network.id === "TRC20") {
        payAddress = `TX${hash.substring(0, 32)}`;
      } else {
        payAddress = `0x${hash.substring(0, 40)}`;
      }

      const mockPaymentId = `now_${Date.now()}_${params.transactionId.substring(0, 8)}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payAddress)}`;

      return {
        paymentId: mockPaymentId,
        payAddress,
        payAmount: params.amountUSD,
        payCurrency: network.currency,
        network: network.id,
        qrCodeUrl,
        isSandbox: true,
      };
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
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payAddress)}`;

      return {
        paymentId,
        payAddress,
        payAmount,
        payCurrency: network.currency,
        network: network.id,
        qrCodeUrl,
        isSandbox: false,
      };
    } catch (err: any) {
      console.error("[CryptoService] NOWPayments create payment error:", err?.response?.data || err.message);
      throw new Error(err?.response?.data?.message || "Failed to create crypto deposit invoice");
    }
  }

  /**
   * Verifies the HMAC-SHA512 signature from NOWPayments IPN webhook.
   */
  public verifyIpnSignature(rawBody: any, signatureHeader?: string): boolean {
    if (!this.ipnSecret) {
      // In development/test mode without an IPN secret configured, allow requests
      return true;
    }

    if (!signatureHeader) {
      return false;
    }

    try {
      // NOWPayments expects sorted JSON string
      const sortedKeys = Object.keys(rawBody).sort();
      const sortedObj: Record<string, any> = {};
      for (const key of sortedKeys) {
        sortedObj[key] = rawBody[key];
      }

      const payloadString = JSON.stringify(sortedObj);
      const hmac = crypto.createHmac("sha512", this.ipnSecret);
      hmac.update(payloadString);
      const digest = hmac.digest("hex");

      return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
    } catch (e) {
      console.error("[CryptoService] Signature verification exception:", e);
      return false;
    }
  }

  /**
   * Queries payment status directly from NOWPayments.
   */
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
