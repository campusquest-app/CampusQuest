/** Session flag: full-screen post-login splash should run once after sign-in. */
const POST_LOGIN_LOADING_KEY = "cq_post_login_loading_pending";

export function markPostLoginLoadingPending(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(POST_LOGIN_LOADING_KEY, "1");
  } catch {
    /* non-blocking */
  }
}

export function peekPostLoginLoadingPending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(POST_LOGIN_LOADING_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPostLoginLoadingPending(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(POST_LOGIN_LOADING_KEY);
  } catch {
    /* non-blocking */
  }
}
