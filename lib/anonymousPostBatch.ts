/** Private URI Campus Feed batch. Keys stay off the public post row. */

export const URI_HALLOWEEN_ANON_BATCH_ID = "uri-anon-halloween-2026-10-29";

const PRODUCTION_HOSTS = new Set(["campusquestapp.com", "www.campusquestapp.com"]);

export type AnonymousBatchItem = {
  itemKey: string;
  body: string;
  idempotencyKey: string;
};

export const URI_HALLOWEEN_ANON_POSTS: readonly AnonymousBatchItem[] = [
  {
    itemKey: "01",
    body: "professors assigning homework over halloweekend like batman doesn\u2019t have somewhere to be",
    idempotencyKey: `${URI_HALLOWEEN_ANON_BATCH_ID}:01`,
  },
  {
    itemKey: "02",
    body: "the group costume has suffered several staffing changes",
    idempotencyKey: `${URI_HALLOWEEN_ANON_BATCH_ID}:02`,
  },
  {
    itemKey: "03",
    body: "mainfare or butterfield. you have to pick one for the rest of the semester",
    idempotencyKey: `${URI_HALLOWEEN_ANON_BATCH_ID}:03`,
  },
  {
    itemKey: "04",
    body: "\u201cwhat are you supposed to be\u201d alright goodnight",
    idempotencyKey: `${URI_HALLOWEEN_ANON_BATCH_ID}:04`,
  },
  {
    itemKey: "05",
    body: "uri needs to release construction patch notes because the route to class keeps changing",
    idempotencyKey: `${URI_HALLOWEEN_ANON_BATCH_ID}:05`,
  },
  {
    itemKey: "06",
    body: "halloween on a college budget is just deciding what character owns the clothes you already have",
    idempotencyKey: `${URI_HALLOWEEN_ANON_BATCH_ID}:06`,
  },
  {
    itemKey: "07",
    body: "the halloween plans group chat has 87 messages and still no address",
    idempotencyKey: `${URI_HALLOWEEN_ANON_BATCH_ID}:07`,
  },
  {
    itemKey: "08",
    body: "nothing humbles you like carrying your food around the dining hall looking for a seat",
    idempotencyKey: `${URI_HALLOWEEN_ANON_BATCH_ID}:08`,
  },
  {
    itemKey: "09",
    body: "\u201cwe\u2019re leaving in five\u201d and somebody is still becoming a different species in the bathroom",
    idempotencyKey: `${URI_HALLOWEEN_ANON_BATCH_ID}:09`,
  },
  {
    itemKey: "10",
    body: "which costume are we predicting will have the highest attendance this weekend",
    idempotencyKey: `${URI_HALLOWEEN_ANON_BATCH_ID}:10`,
  },
];

export type AnonymousBatchPublishResult =
  | { type: "published"; postId: string; idempotent: boolean }
  | { type: "already_removed" }
  | { type: "failed"; status: number; code: string; message: string }
  | { type: "stop"; status: number; code: string; message: string };

export type AnonymousBatchReport = {
  batchId: string;
  published: { itemKey: string; postId: string; idempotent: boolean }[];
  alreadyRemoved: { itemKey: string }[];
  failed: { itemKey: string; status: number; code: string; message: string }[];
  remaining: { itemKey: string }[];
  stopped: { code: string; message: string } | null;
};

export function anonymousBatchHostError(hostHeader: string | null | undefined): string | null {
  const host = (hostHeader ?? "").split(",")[0]?.trim().toLowerCase().replace(/:\d+$/, "") ?? "";
  if (PRODUCTION_HOSTS.has(host)) return null;
  return "This batch can only be published on campusquestapp.com.";
}

export function assertAnonymousBatchCopy(items: readonly AnonymousBatchItem[] = URI_HALLOWEEN_ANON_POSTS): void {
  const keys = new Set<string>();
  const bodies = new Set<string>();
  for (const item of items) {
    if (!/^\d{2}$/.test(item.itemKey)) {
      throw new Error(`Invalid batch item key ${item.itemKey}.`);
    }
    if (item.idempotencyKey !== `${URI_HALLOWEEN_ANON_BATCH_ID}:${item.itemKey}`) {
      throw new Error(`Batch item ${item.itemKey} has the wrong idempotency key.`);
    }
    const body = item.body;
    if (body.trim() !== body || body.length < 1 || body.length > 300) {
      throw new Error(`Batch item ${item.itemKey} is outside the 300-character post limit.`);
    }
    if (keys.has(item.idempotencyKey) || bodies.has(body)) {
      throw new Error(`Batch item ${item.itemKey} is a duplicate.`);
    }
    keys.add(item.idempotencyKey);
    bodies.add(body);
  }
}

const BATCH_STOP_CODES = new Set([
  "RATE_LIMITED",
  "ANONYMOUS_NOTICE_REQUIRED",
  "SCHOOL_VERIFICATION_REQUIRED",
  "ACCOUNT_BANNED",
  "ACCOUNT_SUSPENDED",
  "BATCH_SCHOOL_MISMATCH",
  "BATCH_ENVIRONMENT_MISMATCH",
  "PUBLISH_RECEIPT_UNAVAILABLE",
]);

export function classifyAnonymousBatchFailure(
  status: number,
  code: string,
  message: string,
): Exclude<AnonymousBatchPublishResult, { type: "published" }> {
  if (code === "PUBLISH_ALREADY_CONSUMED") return { type: "already_removed" };
  if (status === 429 || BATCH_STOP_CODES.has(code)) {
    return { type: "stop", status, code, message };
  }
  return { type: "failed", status, code, message };
}

export async function runAnonymousBatch(
  items: readonly AnonymousBatchItem[],
  publish: (item: AnonymousBatchItem) => Promise<AnonymousBatchPublishResult>,
): Promise<AnonymousBatchReport> {
  assertAnonymousBatchCopy(items);
  const report: AnonymousBatchReport = {
    batchId: URI_HALLOWEEN_ANON_BATCH_ID,
    published: [],
    alreadyRemoved: [],
    failed: [],
    remaining: [],
    stopped: null,
  };
  let stopAt = -1;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (stopAt >= 0) {
      report.remaining.push({ itemKey: item.itemKey });
      continue;
    }
    const result = await publish(item);
    if (result.type === "published") {
      report.published.push({
        itemKey: item.itemKey,
        postId: result.postId,
        idempotent: result.idempotent,
      });
      continue;
    }
    if (result.type === "already_removed") {
      report.alreadyRemoved.push({ itemKey: item.itemKey });
      continue;
    }
    if (result.type === "stop") {
      stopAt = index;
      report.stopped = { code: result.code, message: result.message };
      report.remaining.push({ itemKey: item.itemKey });
      continue;
    }
    report.failed.push({
      itemKey: item.itemKey,
      status: result.status,
      code: result.code,
      message: result.message,
    });
  }
  return report;
}
