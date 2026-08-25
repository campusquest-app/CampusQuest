/** True when the JWT `exp` is missing or already past (30s skew). Does not log the token. */
export function isAccessTokenExpired(token: string | null | undefined): boolean {
  if (!token) return true;
  const parts = token.split(".");
  if (parts.length !== 3) return true;
  try {
    const payloadRaw = parts[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!payloadRaw) return true;
    const padded = payloadRaw.padEnd(payloadRaw.length + ((4 - (payloadRaw.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    if (typeof payload.exp !== "number") return true;
    return payload.exp * 1000 < Date.now() - 30_000;
  } catch {
    return true;
  }
}
