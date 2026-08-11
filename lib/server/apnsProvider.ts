/**
 * APNs HTTP/2 provider (token auth). Credentials live only in server env —
 * never exposed to the browser or Capacitor WebView.
 *
 * Required env (production):
 * - APNS_KEY_ID
 * - APNS_TEAM_ID
 * - APNS_BUNDLE_ID (default: com.nicklockhart.campusquest)
 * - APNS_P8_KEY  (PEM contents of AuthKey_XXX.p8, newlines as \n ok)
 * - APNS_PRODUCTION=true|false  (TestFlight/App Store → true; Xcode debug → false)
 */

import { createPrivateKey, createSign, randomUUID } from "crypto";
import * as http2 from "http2";

export type ApnsSendResult =
  | { ok: true; apnsId: string }
  | { ok: false; status: number; reason: string; invalidToken: boolean };

type ApnsConfig = {
  keyId: string;
  teamId: string;
  bundleId: string;
  p8Key: string;
  production: boolean;
};

function readApnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const bundleId = process.env.APNS_BUNDLE_ID?.trim() || "com.nicklockhart.campusquest";
  const p8KeyRaw = process.env.APNS_P8_KEY?.trim();
  if (!keyId || !teamId || !p8KeyRaw) return null;
  const p8Key = p8KeyRaw.includes("\\n") ? p8KeyRaw.replace(/\\n/g, "\n") : p8KeyRaw;
  const production = (process.env.APNS_PRODUCTION ?? "true").toLowerCase() !== "false";
  return { keyId, teamId, bundleId, p8Key, production };
}

export function isApnsConfigured(): boolean {
  return readApnsConfig() != null;
}

let cachedJwt: { token: string; expiresAtMs: number } | null = null;

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function mintApnsJwt(config: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAtMs > Date.now() + 60_000) {
    return cachedJwt.token;
  }
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const payload = base64Url(JSON.stringify({ iss: config.teamId, iat: now }));
  const unsigned = `${header}.${payload}`;
  const key = createPrivateKey(config.p8Key);
  const signer = createSign("SHA256");
  signer.update(unsigned);
  signer.end();
  const sig = signer.sign({ key, dsaEncoding: "ieee-p1363" });
  const token = `${unsigned}.${base64Url(sig)}`;
  cachedJwt = { token, expiresAtMs: Date.now() + 50 * 60_000 };
  return token;
}

export async function sendApnsAlert(args: {
  deviceToken: string;
  title: string;
  body: string;
  data: Record<string, string>;
  environment?: "development" | "production";
}): Promise<ApnsSendResult> {
  const config = readApnsConfig();
  if (!config) {
    return { ok: false, status: 0, reason: "APNS_NOT_CONFIGURED", invalidToken: false };
  }

  const useProduction =
    args.environment === "development" ? false : args.environment === "production" ? true : config.production;
  const host = useProduction ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const jwt = mintApnsJwt(config);
  const apnsId = randomUUID();

  const payload = JSON.stringify({
    aps: {
      alert: {
        title: args.title.slice(0, 120),
        body: args.body.slice(0, 240),
      },
      sound: "default",
      "thread-id": args.data.type ?? "campusquest",
    },
    ...args.data,
  });

  return await new Promise<ApnsSendResult>((resolve) => {
    const client = http2.connect(`https://${host}`);
    client.on("error", (err) => {
      resolve({
        ok: false,
        status: 0,
        reason: err.message || "APNS_CONNECTION_ERROR",
        invalidToken: false,
      });
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${args.deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-id": apnsId,
      "content-type": "application/json",
    });

    let status = 0;
    let responseBody = "";
    req.setEncoding("utf8");
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.on("data", (chunk) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      client.close();
      if (status >= 200 && status < 300) {
        resolve({ ok: true, apnsId });
        return;
      }
      let reason = responseBody || `HTTP_${status}`;
      try {
        const parsed = JSON.parse(responseBody) as { reason?: string };
        if (parsed.reason) reason = parsed.reason;
      } catch {
        /* keep raw */
      }
      const invalidToken =
        reason === "BadDeviceToken" ||
        reason === "Unregistered" ||
        reason === "ExpiredToken" ||
        status === 410;
      resolve({ ok: false, status, reason, invalidToken });
    });
    req.on("error", (err) => {
      client.close();
      resolve({
        ok: false,
        status: 0,
        reason: err.message || "APNS_REQUEST_ERROR",
        invalidToken: false,
      });
    });
    req.end(payload);
  });
}
