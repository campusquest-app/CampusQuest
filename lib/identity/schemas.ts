import { z } from "zod";
import { ORGANIZATION_REQUEST_CATEGORIES } from "@/lib/organizationRequestCategories";
import { GREEK_ORGANIZATION_TYPES, ORG_VERIFICATION_VARIANTS } from "@/lib/identity/organizationVerification";
import {
  BUSINESS_VERIFICATION_CATEGORY_IDS,
  CAMPUS_IDENTITY_TYPES,
  VERIFICATION_IDENTITY_TYPES,
} from "@/lib/identity/types";

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(2048).nullable().optional(),
);

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max).nullable().optional(),
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
    organizationVariant: z.enum(ORG_VERIFICATION_VARIANTS).nullable().optional(),
    greekType: z.enum(GREEK_ORGANIZATION_TYPES).nullable().optional(),
    nationalAffiliation: optionalText(120),
    advisorName: optionalText(120),
    advisorEmail: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? null : value),
      z.string().trim().email("Enter a valid advisor email.").max(180).nullable().optional(),
    ),
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
    if (value.organizationVariant === "greek") {
      if (value.identityType !== "organization" || value.category !== "greek_life") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Greek requests must use Greek Life.", path: ["category"] });
      }
      if (!value.greekType) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose fraternity or sorority.", path: ["greekType"] });
      }
      if (!value.nationalAffiliation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Add your national organization, or write “Local” if there isn't one.",
          path: ["nationalAffiliation"],
        });
      }
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

export const organizationAvailabilityQuerySchema = z.object({
  name: z.string().trim().min(2).max(120),
  organizationId: z.string().uuid().nullable().optional(),
});
