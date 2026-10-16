import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("direct message block enforcement", () => {
  const messaging = readFileSync(join(process.cwd(), "lib/server/messaging.ts"), "utf8");
  const route = readFileSync(
    join(process.cwd(), "app/api/social/conversations/[conversationId]/messages/route.ts"),
    "utf8",
  );
  const privacy = readFileSync(join(process.cwd(), "app/legal/privacy/page.tsx"), "utf8");

  it("enforces blocks on the send API, not only in the UI", () => {
    expect(route).toContain("requireAuthUser");
    expect(route).toContain("sendConversationMessage");
    expect(messaging).toMatch(/export async function sendConversationMessage[\s\S]+assertNotBlocked/);
    expect(messaging).toMatch(/export async function getOrCreateDirectConversation[\s\S]+assertNotBlocked/);
  });

  it("keeps existing conversation history readable after a block", () => {
    const listStart = messaging.indexOf("export async function listConversationMessages");
    const sendStart = messaging.indexOf("export async function sendConversationMessage");
    expect(listStart).toBeGreaterThan(-1);
    expect(sendStart).toBeGreaterThan(listStart);
    expect(messaging.slice(listStart, sendStart)).not.toContain("assertNotBlocked");
    expect(privacy).toContain("they cannot send you new messages");
    expect(privacy).toContain("Existing conversation history remains visible");
  });
});
