/** Shared report reasons for UGC (posts, users, comments, infringement, etc.). */

export const CONTENT_REPORT_REASONS = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate_speech", label: "Hate speech or discrimination" },
  { value: "nudity", label: "Nudity or sexual content" },
  { value: "violence", label: "Violence or threats" },
  { value: "spam", label: "Spam or scam" },
  { value: "misinformation", label: "False information" },
  { value: "restricted_content", label: "Restricted or age-inappropriate content" },
  { value: "copyright_infringement", label: "Copyright or trademark infringement" },
  { value: "impersonation", label: "Impersonation or fake account" },
  { value: "other", label: "Other" },
] as const;

export type ContentReportReason = (typeof CONTENT_REPORT_REASONS)[number]["value"];

export const CONTENT_REPORT_REASON_VALUES = CONTENT_REPORT_REASONS.map((r) => r.value) as [
  ContentReportReason,
  ...ContentReportReason[],
];

export type ContentReportTargetType =
  | "user"
  | "comment"
  | "post"
  | "message"
  | "event"
  | "organization"
  | "infringement"
  | "other";

export function contentReportReasonLabel(reason: string): string {
  return CONTENT_REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

/** Reasons shown when reporting a user profile. */
export const USER_REPORT_REASONS = CONTENT_REPORT_REASONS.filter((r) =>
  ["harassment", "hate_speech", "nudity", "violence", "spam", "impersonation", "other"].includes(r.value),
);

/** Reasons shown for copyright / IP infringement reports. */
export const INFRINGEMENT_REPORT_REASONS = CONTENT_REPORT_REASONS.filter((r) =>
  ["copyright_infringement", "other"].includes(r.value),
);
