import { z } from "zod";
import { ORGANIZATION_REQUEST_CATEGORIES } from "@/lib/organizationRequestCategories";
import {
  BUSINESS_VERIFICATION_CATEGORY_IDS,
  CAMPUS_IDENTITY_TYPES,
  VERIFICATION_IDENTITY_TYPES,
} from "@/lib/identity/types";

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(2048).nullable().optional(),
);

export const switchActiveIdentitySchema = z
  .object({
    type: z.enum(CAMPUS_IDENTITY_TYPES),
    id: z.string().uuid(),
  })
  .strict();

export const submitVerificationRequestSchema = z
  .object({
    identityType: z.enum(VERIFICATION_IDENTITY_TYPES),
    name: z.string().trim().min(2).max(120),
    category: z.string().trim().min(2).max(80),
    description: z.string().trim().min(1).max(2000),
    websiteUrl: optionalUrl,
    socialUrl: optionalUrl,
    organizationEmail: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? null : value),
      z.string().trim().email().max(180).nullable().optional(),
    ),
    urinvolvedUrl: optionalUrl,
    applicantRole: z.string().trim().max(80).nullable().optional(),
    logoUrl: optionalUrl,
    imageUrl: optionalUrl,
    reasonForAccess: z.string().trim().max(1000).nullable().optional(),
    requestedIdentityId: z.string().uuid().nullable().optional(),
    applicantConfirmation: z.literal(true),
  })
  .superRefine((value, ctx) => {
    if (value.identityType === "student_business") {
      if (!(BUSINESS_VERIFICATION_CATEGORY_IDS as readonly string[]).includes(value.category)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a business category.", path: ["category"] });
      }
    } else if (!(ORGANIZATION_REQUEST_CATEGORIES as readonly string[]).includes(value.category)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose an organization category.", path: ["category"] });
    }
  });

export const reviewVerificationRequestSchema = z
  .object({
    action: z.enum(["approve", "reject", "needs_info"]),
    adminInternalNotes: z.string().trim().max(2000).nullable().optional(),
    applicantStatusMessage: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "needs_info" && !value.applicantStatusMessage?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Explain what information is missing.",
        path: ["applicantStatusMessage"],
      });
    }
  });

export const verificationOrgSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
});
