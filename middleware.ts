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
  if (m === "GET" && pathname === "/api/me/profile") return true;
  if (m === "GET" && pathname === "/api/me/stats") return true;
  if (m === "GET" && pathname === "/api/me/safety-status") return true;
  return false;
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
  if (!token) {
    return NextResponse.next();
  }

  try {
    const userClient = createUserClient(token);
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
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
