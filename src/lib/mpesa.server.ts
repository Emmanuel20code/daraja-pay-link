// Server-only Daraja (M-Pesa) helpers. Never import from client components.

export type DarajaConfig = {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
};

export function getDarajaConfig(): DarajaConfig {
  const env = (process.env["MPESA_ENV"] ?? "sandbox").toLowerCase();
  const consumerKey = process.env["MPESA_CONSUMER_KEY"];
  const consumerSecret = process.env["MPESA_CONSUMER_SECRET"];
  const shortcode = process.env["MPESA_SHORTCODE"];
  const passkey = process.env["MPESA_PASSKEY"];

  const missing = Object.entries({
    MPESA_CONSUMER_KEY: consumerKey,
    MPESA_CONSUMER_SECRET: consumerSecret,
    MPESA_SHORTCODE: shortcode,
    MPESA_PASSKEY: passkey,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    throw new Error(`Missing Daraja credentials: ${missing.join(", ")}`);
  }

  return {
    baseUrl:
      env === "production" || env === "live"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke",
    consumerKey: consumerKey!,
    consumerSecret: consumerSecret!,
    shortcode: shortcode!,
    passkey: passkey!,
  };
}

export async function getAccessToken(config: DarajaConfig): Promise<string> {
  const basic = btoa(`${config.consumerKey}:${config.consumerSecret}`);
  const res = await fetch(
    `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${basic}` } },
  );
  const body = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Daraja auth failed (${res.status})`);
  }
  return body.access_token;
}

export function darajaTimestamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours() + 3)}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`
  );
}

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (/^254\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^\d{9}$/.test(digits)) return `254${digits}`;
  return null;
}

export type StkPushArgs = {
  phone: string;
  amount: number;
  shortcode: string;
  passkey: string;
  accountType: string;
  accountReference: string;
  description: string;
  callbackUrl: string;
  partyB?: string;
};

export async function initiateStkPush(config: DarajaConfig, args: StkPushArgs) {
  const token = await getAccessToken(config);
  const timestamp = darajaTimestamp();
  const password = btoa(`${args.shortcode}${args.passkey}${timestamp}`);

  const payload = {
    BusinessShortCode: args.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType:
      args.accountType === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
    Amount: Math.round(args.amount),
    PartyA: args.phone,
    PartyB: args.partyB ?? args.shortcode,
    PhoneNumber: args.phone,
    CallBackURL: args.callbackUrl,
    AccountReference: args.accountReference.slice(0, 12),
    TransactionDesc: args.description.slice(0, ch(13)),
  };

  const res = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

function ch(n: number) {
  return n;
}
