import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';

// ─── Daraja Types ─────────────────────────────────────────────────────────────

export type MpesaTransactionType = 'paybill' | 'till';

export interface DarajaConfig {
  consumerKey: string;
  consumerSecret: string;
  businessShortCode: string;
  passKey: string;
  accountReference: string;
  callbackURL: string;
  transactionDesc: string;
  environment: 'sandbox' | 'production';
  transactionType?: MpesaTransactionType;
  c2bValidationUrl?: string;
  c2bConfirmationUrl?: string;
  c2bShortCode?: string;
  b2cInitiatorName?: string;
  b2cSecurityCredential?: string;
  b2cCertPath?: string;
  b2cResultUrl?: string;
  b2cTimeoutUrl?: string;
  b2cShortCode?: string;
}

export type StkPushResponse = {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
};

export type StkCallbackPayload = {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value: string | number }>;
      };
    };
  };
};

export type StkCallbackResult =
  | { success: true; mpesaReceiptNumber: string; amount: number; phoneNumber: string; checkoutRequestId: string }
  | { success: false; message: string };

export type C2BValidationPayload = {
  TransactionType: string;
  TransID: string;
  TransTime: string;
  TransAmount: string;
  BusinessShortCode: string;
  BillRefNumber?: string;
  InvoiceNumber?: string;
  OrgAccountBalance: string;
  ThirdPartyTransID?: string;
  MSISDN: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
};

export type C2BConfirmationPayload = C2BValidationPayload;

export type C2BUrlRegisterResponse = {
  OriginatorConversationID: string;
  ConversationID: string;
  ResponseDescription: string;
};

// ─── Error Helpers ────────────────────────────────────────────────────────────

type DarajaFaultPayload = {
  fault?: { faultstring?: string; detail?: { errorcode?: string } };
};

export function parseDarajaErrorPayload(error: unknown): DarajaFaultPayload | null {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!raw) return null;
  try { return JSON.parse(raw) as DarajaFaultPayload; } catch { return null; }
}

export function isDarajaSpikeArrestError(error: unknown): boolean {
  const parsed = parseDarajaErrorPayload(error);
  const code = parsed?.fault?.detail?.errorcode;
  const msg = parsed?.fault?.faultstring || (error instanceof Error ? error.message : String(error ?? ''));
  return code === 'policies.ratelimit.SpikeArrestViolation' || msg.toLowerCase().includes('spike arrest violation');
}

export function getDarajaFriendlyError(error: unknown, fallback: string): string {
  const parsed = parseDarajaErrorPayload(error);
  return parsed?.fault?.faultstring || (error instanceof Error ? error.message : '') || fallback;
}

// ─── Phone Number Normalizer ──────────────────────────────────────────────────

export function normalizeKenyanPhone(raw: string): string {
  let phone = raw.replace(/[\s+]/g, '');
  if (/^0[17]\d{8}$/.test(phone)) phone = '254' + phone.slice(1);
  else if (/^[17]\d{8}$/.test(phone)) phone = '254' + phone;

  if (!/^254[17]\d{8}$/.test(phone)) {
    throw new Error(
      `Invalid phone number format: "${raw}" => "${phone}". Expected 254 followed by 9 digits starting with 1 or 7.`
    );
  }
  return phone;
}

// ─── Core Daraja Service ──────────────────────────────────────────────────────

export class DarajaService {
  private config: DarajaConfig;
  private transactionType: MpesaTransactionType;
  private accessToken = '';
  private tokenExpiry: Date | null = null;

  constructor(config: DarajaConfig) {
    this.config = { ...config };
    this.transactionType = config.transactionType ?? 'paybill';
    this.warnShortCode();
  }

  private warnShortCode() {
    const sc = this.config.businessShortCode;
    if (this.transactionType === 'paybill' && !/^\d{5,7}$/.test(sc))
      console.warn('[Daraja] Paybill shortcode should be 5-7 digits.');
    if (this.transactionType === 'till' && !/^1\d{5,}$/.test(sc))
      console.warn('[Daraja] Till number should start with 1 and be at least 6 digits.');
  }

  setTransactionType(type: MpesaTransactionType) { this.transactionType = type; this.warnShortCode(); }
  getTransactionType(): MpesaTransactionType { return this.transactionType; }

  private baseUrl() {
    return `https://${this.config.environment === 'sandbox' ? 'sandbox' : 'api'}.safaricom.co.ke`;
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) return this.accessToken;
    if (!this.config.consumerKey || !this.config.consumerSecret)
      throw new Error('[Daraja] Consumer key or secret not configured.');

    const auth = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString('base64');
    try {
      const { data } = await axios.get(
        `${this.baseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
        { headers: { Authorization: `Basic ${auth}` } }
      );
      this.accessToken = data.access_token;
      this.tokenExpiry = new Date(Date.now() + 50 * 60 * 1000);
      return this.accessToken;
    } catch (err: any) {
      const msg = err?.message ?? JSON.stringify(err);
      console.error('[Daraja] Auth failed:', msg);
      throw new Error(`[Daraja] Authentication failed: ${msg}`);
    }
  }

  private getCurrentTimestamp(): string {
    const n = new Date();
    return (
      n.getFullYear() +
      String(n.getMonth() + 1).padStart(2, '0') +
      String(n.getDate()).padStart(2, '0') +
      String(n.getHours()).padStart(2, '0') +
      String(n.getMinutes()).padStart(2, '0') +
      String(n.getSeconds()).padStart(2, '0')
    );
  }

  private generatePassword(timestamp: string): string {
    return Buffer.from(`${this.config.businessShortCode}${this.config.passKey}${timestamp}`).toString('base64');
  }

  // ── M-Pesa Express (STK Push) ─────────────────────────────────────────────

  async initiateSTKPush(
    phoneNumber: string,
    amount: number,
    accountRef?: string,
    description?: string,
    callbackUrl?: string
  ): Promise<StkPushResponse> {
    const token = await this.authenticate();
    const timestamp = this.getCurrentTimestamp();
    const password = this.generatePassword(timestamp);
    const phone = normalizeKenyanPhone(phoneNumber);
    const txType = this.transactionType === 'till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';
    console.log(`[STK] Initiating push to ${phone} for KES ${Math.floor(amount)}`);

    try {
      const { data } = await axios.post<StkPushResponse>(
        `${this.baseUrl()}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: this.config.businessShortCode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: txType,
          Amount: Math.floor(amount).toString(),
          PartyA: phone,
          PartyB: this.config.businessShortCode,
          PhoneNumber: phone,
          CallBackURL: callbackUrl ?? this.config.callbackURL,
          AccountReference: accountRef ?? this.config.accountReference,
          TransactionDesc: description ?? this.config.transactionDesc,
        },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      return data;
    } catch (err: any) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error('[STK] Push failed:', detail);
      throw new Error(detail);
    }
  }

  async querySTKStatus(checkoutRequestId: string): Promise<any> {
    const token = await this.authenticate();
    const timestamp = this.getCurrentTimestamp();
    const password = this.generatePassword(timestamp);

    try {
      const { data } = await axios.post(
        `${this.baseUrl()}/mpesa/stkpushquery/v1/query`,
        { BusinessShortCode: this.config.businessShortCode, Password: password, Timestamp: timestamp, CheckoutRequestID: checkoutRequestId },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      return data;
    } catch (err: any) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error('[STK] Query failed:', detail);
      throw new Error(detail);
    }
  }

  // ── C2B ───────────────────────────────────────────────────────────────────

  async registerC2BURLs(options?: {
    validationUrl?: string;
    confirmationUrl?: string;
    responseType?: 'Completed' | 'Cancelled';
    shortCode?: string;
  }): Promise<C2BUrlRegisterResponse> {
    const token = await this.authenticate();
    const shortCode = options?.shortCode ?? this.config.c2bShortCode ?? this.config.businessShortCode;
    const validationUrl = options?.validationUrl ?? this.config.c2bValidationUrl;
    const confirmationUrl = options?.confirmationUrl ?? this.config.c2bConfirmationUrl;

    if (!validationUrl || !confirmationUrl)
      throw new Error('[Daraja] C2B validation / confirmation URLs are not configured.');

    try {
      const { data } = await axios.post<C2BUrlRegisterResponse>(
        `${this.baseUrl()}/mpesa/c2b/v1/registerurl`,
        { ShortCode: shortCode, ResponseType: options?.responseType ?? 'Completed', ConfirmationURL: confirmationUrl, ValidationURL: validationUrl },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      return data;
    } catch (err: any) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error('[C2B] URL registration failed:', detail);
      throw new Error(detail);
    }
  }

  // ── B2C ───────────────────────────────────────────────────────────────────

  async initiateB2CPayment(options: {
    amount: number;
    phoneNumber: string;
    commandId?: 'BusinessPayment' | 'SalaryPayment' | 'PromotionPayment';
    remarks?: string;
    occasion?: string;
    resultUrl?: string;
    timeoutUrl?: string;
  }): Promise<{ success: boolean; response?: any; errorMessage?: string }> {
    const token = await this.authenticate();
    const phone = normalizeKenyanPhone(options.phoneNumber);
    const initiatorName = this.config.b2cInitiatorName ?? process.env.MPESA_B2C_INITIATOR_NAME ?? 'testapi';
    const securityCredential = await this.getB2CSecurityCredential();
    const commandId = options.commandId ?? 'BusinessPayment';
    const resultUrl = options.resultUrl ?? this.config.b2cResultUrl;
    const timeoutUrl = options.timeoutUrl ?? this.config.b2cTimeoutUrl;

    if (!resultUrl || !timeoutUrl) {
      throw new Error('[Daraja] B2C ResultURL / TimeoutURL not configured.');
    }

    try {
      const { data } = await axios.post(
        `${this.baseUrl()}/mpesa/b2c/v1/paymentrequest`,
        {
          InitiatorName: initiatorName,
          SecurityCredential: securityCredential,
          CommandID: commandId,
          Amount: Math.floor(options.amount),
          PartyA: this.config.b2cShortCode ?? process.env.MPESA_B2C_SHORTCODE ?? this.config.businessShortCode,
          PartyB: phone,
          Remarks: options.remarks ?? 'Withdrawal',
          QueueTimeOutURL: timeoutUrl,
          ResultURL: resultUrl,
          Occasion: options.occasion ?? 'Withdrawal',
        },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      return { success: true, response: data };
    } catch (err: any) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error('[B2C] Payment failed:', detail);
      const friendly = getDarajaFriendlyError(err.response?.data ?? err, err.message);
      return { success: false, errorMessage: friendly, response: err.response?.data };
    }
  }

  private async getB2CSecurityCredential(): Promise<string> {
    if (this.config.b2cSecurityCredential) return this.config.b2cSecurityCredential;
    if (process.env.MPESA_B2C_SECURITY_CREDENTIAL) return process.env.MPESA_B2C_SECURITY_CREDENTIAL;
    if (this.config.environment === 'sandbox') return 'Safaricom999!*!';

    const pass = process.env.MPESA_B2C_INITIATOR_PASSWORD;
    if (!pass) throw new Error('[Daraja] MPESA_B2C_INITIATOR_PASSWORD or MPESA_B2C_SECURITY_CREDENTIAL is not set.');

    const certPath = this.config.b2cCertPath ?? process.env.MPESA_B2C_CERT_PATH;
    if (certPath && fs.existsSync(certPath)) {
      try {
        const certPem = fs.readFileSync(certPath, 'utf8');
        const formattedPem = certPem.includes('-----BEGIN CERTIFICATE-----')
          ? certPem
          : `-----BEGIN CERTIFICATE-----\n${certPem.trim()}\n-----END CERTIFICATE-----`;
        const encrypted = crypto.publicEncrypt(
          {
            key: formattedPem,
            padding: crypto.constants.RSA_PKCS1_PADDING,
          },
          Buffer.from(pass)
        );
        return encrypted.toString('base64');
      } catch (e: any) {
        console.error('[Daraja] Failed to encrypt B2C password with cert:', e.message);
        throw new Error(`[Daraja] Failed to encrypt B2C security credential with certificate: ${e.message}`);
      }
    }

    return Buffer.from(pass).toString('base64');
  }
}

// ─── B2C Callback Types & Parser ─────────────────────────────────────────────

export type B2CCallbackPayload = {
  Result: {
    ResultType: number;
    ResultCode: number;
    ResultDesc: string;
    OriginatorConversationID: string;
    ConversationID: string;
    TransactionID?: string;
    ResultParameters?: {
      ResultParameter: Array<{ Key: string; Value: string | number }>;
    };
    ReferenceData?: {
      ReferenceItem?: {
        Key: string;
        Value: string;
      };
    };
  };
};

export type B2CCallbackResult =
  | {
      success: true;
      conversationId: string;
      originatorConversationId: string;
      mpesaReceiptNumber: string;
      amount?: number;
      phoneNumber?: string;
      resultDesc: string;
    }
  | {
      success: false;
      conversationId: string;
      originatorConversationId: string;
      resultCode: number;
      resultDesc: string;
    };

export function parseB2CCallback(body: any): B2CCallbackResult {
  const res = body?.Result;
  if (!res) {
    return {
      success: false,
      conversationId: '',
      originatorConversationId: '',
      resultCode: -1,
      resultDesc: 'Missing Result in B2C callback payload',
    };
  }

  const conversationId = String(res.ConversationID || '');
  const originatorConversationId = String(res.OriginatorConversationID || '');
  const resultCode = Number(res.ResultCode);
  const resultDesc = String(res.ResultDesc || '');

  if (resultCode !== 0) {
    return {
      success: false,
      conversationId,
      originatorConversationId,
      resultCode,
      resultDesc,
    };
  }

  const params: Array<{ Key: string; Value: any }> = res.ResultParameters?.ResultParameter || [];
  const getParam = (key: string) => params.find((p) => p.Key === key)?.Value;

  const mpesaReceiptNumber = String(res.TransactionID || getParam('TransactionReceipt') || '');
  const amount = Number(getParam('TransactionAmount') || 0);
  const rawReceiver = String(getParam('ReceiverPartyPublicName') || '');
  const phoneMatch = rawReceiver.match(/\d{9,12}/);
  const phoneNumber = phoneMatch ? phoneMatch[0] : undefined;

  return {
    success: true,
    conversationId,
    originatorConversationId,
    mpesaReceiptNumber,
    amount,
    phoneNumber,
    resultDesc,
  };
}

// ─── STK Callback Parser ──────────────────────────────────────────────────────

export function parseStkCallback(body: StkCallbackPayload): StkCallbackResult {
  const cb = body?.Body?.stkCallback;
  if (!cb) return { success: false, message: 'Invalid callback payload - missing stkCallback.' };
  if (cb.ResultCode !== 0) return { success: false, message: cb.ResultDesc ?? 'Payment failed.' };

  const item = (name: string) => cb.CallbackMetadata?.Item.find((i) => i.Name === name)?.Value;
  const amount = item('Amount');
  const mpesaReceiptNumber = item('MpesaReceiptNumber');
  const phoneNumber = item('PhoneNumber');

  if (!amount || !mpesaReceiptNumber || !phoneNumber)
    return { success: false, message: 'Callback metadata incomplete.' };

  return {
    success: true,
    mpesaReceiptNumber: String(mpesaReceiptNumber),
    amount: Number(amount),
    phoneNumber: String(phoneNumber),
    checkoutRequestId: cb.CheckoutRequestID,
  };
}

// ─── C2B Callback Handlers ────────────────────────────────────────────────────

export async function handleC2BValidation(
  payload: C2BValidationPayload,
  validateFn?: (payload: C2BValidationPayload) => Promise<{ valid: boolean; message: string }>
): Promise<{ ResultCode: number; ResultDesc: string }> {
  console.log('[C2B] Validation payload:', JSON.stringify(payload, null, 2));
  try {
    if (validateFn) {
      const result = await validateFn(payload);
      return { ResultCode: result.valid ? 0 : 1, ResultDesc: result.message };
    }
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  } catch (err) {
    console.error('[C2B] Validation error:', err);
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }
}

export function handleC2BConfirmation(payload: C2BConfirmationPayload): { ResultCode: number; ResultDesc: string } {
  console.log('[C2B] Confirmation payload:', JSON.stringify(payload, null, 2));
  return { ResultCode: 0, ResultDesc: 'Confirmed' };
}

// ─── Singleton Factory ────────────────────────────────────────────────────────

let _instance: DarajaService | null = null;

export function getMpesaService(): DarajaService {
  if (_instance) return _instance;

  const apiBase = (() => {
    let url = (process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3001}`).trim();
    if (!/^https?:\/\//i.test(url)) {
      const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/i.test(url);
      url = `${isLocal ? 'http' : 'https'}://${url}`;
    }
    return url.replace(/\/+$/, '');
  })();

  _instance = new DarajaService({
    consumerKey: process.env.MPESA_CONSUMER_KEY ?? '',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET ?? '',
    businessShortCode: process.env.MPESA_BUSINESS_SHORTCODE ?? '',
    passKey: process.env.MPESA_PASSKEY ?? '',
    transactionType: (process.env.MPESA_TRANSACTION_TYPE as MpesaTransactionType) ?? 'paybill',
    environment: (process.env.MPESA_ENVIRONMENT as 'sandbox' | 'production') ?? 'sandbox',
    accountReference: process.env.MPESA_ACCOUNT_REFERENCE ?? 'GlobalInkTraders',
    transactionDesc: process.env.MPESA_TRANSACTION_DESC ?? 'Deposit to trading account',
    callbackURL: `${apiBase}/api/payments/mpesa/stk-callback`,
    c2bValidationUrl: `${apiBase}/api/payments/c2b/validate`,
    c2bConfirmationUrl: `${apiBase}/api/payments/c2b/confirm`,
    b2cResultUrl: `${apiBase}/api/payments/mpesa/b2c-result`,
    b2cTimeoutUrl: `${apiBase}/api/payments/mpesa/b2c-timeout`,
    b2cInitiatorName: process.env.MPESA_B2C_INITIATOR_NAME,
    b2cSecurityCredential: process.env.MPESA_B2C_SECURITY_CREDENTIAL,
    b2cCertPath: process.env.MPESA_B2C_CERT_PATH,
    ...(process.env.MPESA_B2C_SHORTCODE ? { b2cShortCode: process.env.MPESA_B2C_SHORTCODE } : {}),
    ...(process.env.MPESA_C2B_SHORTCODE ? { c2bShortCode: process.env.MPESA_C2B_SHORTCODE } : {}),
  });

  return _instance;
}
