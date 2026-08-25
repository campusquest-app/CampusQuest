import { isQuadFeedTab, type QuadFeedTab } from "@/lib/client/quadFeedOptions";

const STORAGE_KEY = "cq_quad_feed_tab";

export function readQuadFeedTabSession(): QuadFeedTab | null {
  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return null;
    const raw = storage.getItem(STORAGE_KEY);
    if (raw && isQuadFeedTab(raw)) return raw;
  } catch {
    /* private mode */
  }
  return null;
}

export function writeQuadFeedTabSession(tab: QuadFeedTab): void {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, tab);
  } catch {
    /* private mode */
  }
}
