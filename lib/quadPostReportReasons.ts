export const QUAD_POST_REPORT_REASONS = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate_speech", label: "Hate speech or discrimination" },
  { value: "nudity", label: "Nudity or sexual content" },
  { value: "violence", label: "Violence or threats" },
  { value: "spam", label: "Spam or scam" },
  { value: "misinformation", label: "False information" },
  { value: "other", label: "Other" },
] as const;

export type QuadPostReportReason = (typeof QUAD_POST_REPORT_REASONS)[number]["value"];

export const QUAD_POST_REPORT_REASON_VALUES = QUAD_POST_REPORT_REASONS.map((r) => r.value) as [
  QuadPostReportReason,
  ...QuadPostReportReason[],
];

export function quadPostReportReasonLabel(reason: string): string {
  return QUAD_POST_REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}
