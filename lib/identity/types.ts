export const CAMPUS_IDENTITY_TYPES = ["personal", "student_business", "organization"] as const;
export type CampusIdentityType = (typeof CAMPUS_IDENTITY_TYPES)[number];

export const VERIFICATION_IDENTITY_TYPES = ["student_business", "organization"] as const;
export type VerificationIdentityType = (typeof VERIFICATION_IDENTITY_TYPES)[number];

export const VERIFICATION_STATUSES = [
  "draft",
  "pending_review",
  "needs_info",
  "approved",
  "rejected",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const IDENTITY_MANAGER_ROLES = ["owner", "admin", "manager"] as const;
export type IdentityManagerRole = (typeof IDENTITY_MANAGER_ROLES)[number];

export const BUSINESS_VERIFICATION_CATEGORY_IDS = [
  "clothing_fashion",
  "food",
  "art_creative",
  "photography",
  "beauty",
  "tutoring",
  "technology",
  "services",
  "media",
  "other",
] as const;
export type BusinessVerificationCategoryId = (typeof BUSINESS_VERIFICATION_CATEGORY_IDS)[number];

export type CampusIdentity = {
  id: string;
  type: CampusIdentityType;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  verified: boolean;
  verificationLabel: string | null;
  managerRole: IdentityManagerRole | "self";
  createdAt: string;
};

export type ActiveCampusIdentity = {
  type: CampusIdentityType;
  id: string;
};

export type VerificationApplicantSnapshot = {
  userId: string;
  displayName: string;
  username: string;
  email: string | null;
};

export type VerificationRequestSummary = {
  id: string;
  identityType: VerificationIdentityType;
  name: string;
  category: string;
  status: VerificationStatus;
  createdAt: string;
  submittedAt: string | null;
  requestedIdentityId: string | null;
};

export type VerificationRequestDetail = VerificationRequestSummary & {
  description: string;
  websiteUrl: string | null;
  socialUrl: string | null;
  organizationEmail: string | null;
  urinvolvedUrl: string | null;
  applicantRole: string | null;
  logoUrl: string | null;
  imageUrl: string | null;
  reasonForAccess: string | null;
  applicantConfirmation: boolean;
  adminInternalNotes: string | null;
  applicantStatusMessage: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  updatedAt: string;
  applicant: {
    userId: string;
    displayName: string | null;
    username: string | null;
    email: string | null;
  };
};

export type OrganizationClaimMatch = {
  id: string;
  name: string;
  category: string;
  logoUrl: string | null;
  description: string;
  source: string | null;
};
