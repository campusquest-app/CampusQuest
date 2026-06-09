"use client";

export const SOCIAL_SYNC_EVENT = "campusquest:social-sync";

export type SocialSyncDetail = {
  source?: "friends" | "notifications" | "inbox";
};

export function emitSocialSync(detail?: SocialSyncDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SOCIAL_SYNC_EVENT, { detail }));
}

export function subscribeSocialSync(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const wrapped = () => handler();
  window.addEventListener(SOCIAL_SYNC_EVENT, wrapped);
  return () => window.removeEventListener(SOCIAL_SYNC_EVENT, wrapped);
}
