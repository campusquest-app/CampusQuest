import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getLegalConsentStatus } from "@/lib/server/legalConsentStatus";
import { createUserClient } from "@/lib/server/supabase";

/**
 * Enforces current legal-policy acceptance for authenticated API calls.
 * JWT is read from the Authorization header (same as route handlers).
 *
 * Pre-consent allowlist: auth, consent endpoints, health, internal admin,
 * and minimal GET /api/me/* reads needed to bootstrap the agreement gate.
 */
function isConsentExempt(pathname: string, method: string): boolean {
  const m = method.toUpperCase();
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/api/legal/consent/")) return true;
  if (pathname.startsWith("/api/health/")) return true;
  if (pathname === "/api/legal/policy-version") return true;
  if (pathname.startsWith("/api/internal/")) return true;
  if (pathname.startsWith("/api/sync/")) return true;
  if (pathname.startsWith("/api/cron/")) return true;
  if (m === "GET" && pathname === "/api/me/profile") return true;
  if (m === "GET" && pathname === "/api/me/stats") return true;
  if (m === "GET" && pathname === "/api/me/safety-status") return true;
  if (m === "GET" && pathname === "/api/me/school-verification") return true;
  return false;
}

function isJwtStructurallyInvalid(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return true;
  try {
    const payloadRaw = parts[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!payloadRaw) return true;
    const padded = payloadRaw.padEnd(payloadRaw.length + ((4 - (payloadRaw.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now() - 30_000) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function isBadJwtAuthError(error: unknown): boolean {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const haystack = `${message} ${code}`.toLowerCase();
  return (
    haystack.includes("bad jwt") ||
    haystack.includes("invalid jwt") ||
    haystack.includes("jwt expired") ||
    haystack.includes("invalid claim")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const method = request.method;
  if (isConsentExempt(pathname, method)) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.next();
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token || isJwtStructurallyInvalid(token)) {
    return NextResponse.next();
  }

  try {
    const userClient = createUserClient(token);
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      if (isBadJwtAuthError(userErr)) {
        return NextResponse.next();
      }
      return NextResponse.next();
    }

    const status = await getLegalConsentStatus({
      userClient,
      userId: userData.user.id,
    });

    if (status.agreementComplete) {
      return NextResponse.next();
    }

    return NextResponse.json(
      {
        error: {
          message: "Accept the current Terms, Privacy Policy, and Community Guidelines to continue.",
          code: "LEGAL_CONSENT_REQUIRED",
        },
      },
      { status: 403 },
    );
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Could not verify legal agreement status. Try again shortly.",
          code: "LEGAL_CONSENT_CHECK_FAILED",
        },
      },
      { status: 503 },
    );
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
