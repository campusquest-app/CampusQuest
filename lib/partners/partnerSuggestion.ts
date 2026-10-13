import { z } from "zod";

export const PARTNER_SUGGESTION_LIMITS = { businessName: 120, location: 160, reason: 500 } as const;

/** Collapses whitespace and strips control characters so stored text is safe to show in admin tools. */
export function cleanSuggestionText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .max(max * 2)
    .optional()
    .nullable()
    .transform((value) => (value ? cleanSuggestionText(value) : ""))
    .refine((value) => value.length <= max, `${label} must be ${max} characters or fewer.`)
    .transform((value) => (value.length > 0 ? value : null));

export const partnerSuggestionSchema = z.object({
  businessName: z
    .string({ error: "Enter a business name." })
    .max(PARTNER_SUGGESTION_LIMITS.businessName * 2)
    .transform(cleanSuggestionText)
    .refine((value) => value.length >= 2, "Enter a business name.")
    .refine(
      (value) => value.length <= PARTNER_SUGGESTION_LIMITS.businessName,
      `Business name must be ${PARTNER_SUGGESTION_LIMITS.businessName} characters or fewer.`,
    ),
  location: optionalText(PARTNER_SUGGESTION_LIMITS.location, "Location"),
  reason: optionalText(PARTNER_SUGGESTION_LIMITS.reason, "Reason"),
  /** Hidden honeypot field. Real students never see or fill it. */
  website: z.string().max(500).optional().nullable(),
});

export type PartnerSuggestionRequest = z.input<typeof partnerSuggestionSchema>;

/** Parses a request body; returns the first human-readable problem instead of throwing. */
export function parsePartnerSuggestion(
  body: unknown,
): { ok: true; value: PartnerSuggestionInput; honeypot: boolean } | { ok: false; message: string } {
  const result = partnerSuggestionSchema.safeParse(body);
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const { businessName, location, reason, website } = result.data;
  return { ok: true, value: { businessName, location, reason }, honeypot: Boolean(website?.trim()) };
}

export type PartnerSuggestionInput = {
  businessName: string;
  location: string | null;
  reason: string | null;
};
