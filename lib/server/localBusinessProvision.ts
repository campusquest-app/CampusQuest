import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { findAuthUserIdByEmail } from "@/lib/server/authBootstrap";
import { resolveBusinessLoginPassword } from "@/lib/localBusiness/loginPassword";
import {
  buildLocalBusinessProfilePatch,
  isLocalBusinessRole,
  localBusinessAssignmentsError,
  normalizeBusinessUsername,
} from "@/lib/localBusiness/access";
import { findPartnerById } from "@/lib/partners/partnerDirectory";

export type LocalBusinessAssignmentInput = {
  partnerId: string;
  username: string;
  approved?: boolean;
};

export type ProvisionedLocalBusiness = {
  userId: string;
  email: string;
  businesses: { partnerId: string; username: string }[];
  /**
   * Set only when this call created the login and generated a temporary password.
   * A password the operator typed is never returned.
   */
  temporaryPassword: string | null;
  mustResetPassword: boolean;
  created: boolean;
};

async function businessUsernameTaken(
  admin: ReturnType<typeof createAdminClient>,
  username: string,
  partnerId: string,
  userId: string,
): Promise<boolean> {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (profileError) throw new ApiError(400, "Could not check that username.", "LOCAL_BUSINESS_USERNAME_CHECK_FAILED");
  if (profile && profile.id !== userId) return true;
  const { data: override, error: overrideError } = await admin
    .from("partner_profile_overrides")
    .select("partner_id")
    .eq("username", username)
    .maybeSingle();
  if (overrideError && overrideError.code !== "42P01" && overrideError.code !== "42703") {
    throw new ApiError(400, "Could not check that username.", "LOCAL_BUSINESS_USERNAME_CHECK_FAILED");
  }
  return Boolean(override && override.partner_id !== partnerId);
}

/**
 * Creates a login when needed and assigns existing Student Perks listings.
 * Does not send email. Adding businesses to an existing business login does not mint a new password.
 */
export async function provisionLocalBusinessAccount(input: {
  email: string;
  businesses: LocalBusinessAssignmentInput[];
  createdBy: string;
  accountUsername?: string;
  /** Typed by the operator. Never log, return, or put this on a command line. */
  chosenPassword?: string;
}): Promise<ProvisionedLocalBusiness> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Enter a valid email address.", "LOCAL_BUSINESS_PROVISION_INVALID");
  }
  const assignmentError = localBusinessAssignmentsError(input.businesses);
  if (assignmentError) throw new ApiError(400, assignmentError, "LOCAL_BUSINESS_PROVISION_INVALID");

  const assignments = input.businesses.map((business) => {
    const partner = findPartnerById(business.partnerId);
    if (!partner) throw new ApiError(400, "That business listing does not exist.", "LOCAL_BUSINESS_PROVISION_INVALID");
    return {
      partner,
      username: normalizeBusinessUsername(business.username),
      approved: business.approved ?? partner.listingType === "partner",
    };
  });

  const admin = createAdminClient();
  let loginSecret;
  try {
    loginSecret = resolveBusinessLoginPassword(input.chosenPassword);
  } catch {
    throw new ApiError(
      400,
      "Use at least 8 characters with an uppercase letter, a lowercase letter, a number, and a symbol.",
      "PASSWORD_REQUIREMENTS",
    );
  }
  const existingUserId = await findAuthUserIdByEmail(email);
  let userId = existingUserId;
  let created = false;

  if (!userId) {
    const loginUsername = normalizeBusinessUsername(input.accountUsername || assignments[0]!.username);
    const { data: existingName, error: nameError } = await admin
      .from("profiles")
      .select("id")
      .eq("username", loginUsername)
      .maybeSingle();
    if (nameError) throw new ApiError(400, "Could not check that username.", "LOCAL_BUSINESS_USERNAME_CHECK_FAILED");
    if (existingName) throw new ApiError(409, "That username is already taken.", "USERNAME_TAKEN");

    // This mailbox cannot receive a confirmation message. Confirming this one
    // Auth user lets GoTrue accept a password. It does not set campus email
    // verification, send mail, or change the project's confirmation setting.
    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password: loginSecret.password,
      email_confirm: true,
      user_metadata: { display_name: assignments[0]!.partner.name },
    });
    if (createError || !createdUser.user?.id) {
      throw new ApiError(400, "Could not create the business login.", "LOCAL_BUSINESS_CREATE_FAILED");
    }
    userId = createdUser.user.id;
    created = true;
    const profilePatch = buildLocalBusinessProfilePatch(assignments[0]!.partner, loginUsername);
    const { error: profileError } = await admin.from("profiles").upsert({ id: userId, ...profilePatch });
    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      throw new ApiError(400, "Could not save the business profile.", "LOCAL_BUSINESS_PROFILE_FAILED");
    }
    const { error: accountError } = await admin.from("local_business_accounts").insert({
      user_id: userId,
      must_reset_password: loginSecret.mustResetPassword,
      created_by: input.createdBy,
    });
    if (accountError) {
      await admin.auth.admin.deleteUser(userId);
      throw new ApiError(400, "Could not save the business login.", "LOCAL_BUSINESS_LINK_FAILED");
    }
  } else {
    const { data: profile, error: roleError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (roleError) throw new ApiError(400, "Could not load that account.", "LOCAL_BUSINESS_LOOKUP_FAILED");
    if (!isLocalBusinessRole(profile?.role)) {
      throw new ApiError(409, "That email already belongs to a campus account.", "LOCAL_BUSINESS_EMAIL_IN_USE");
    }
    const { error: accountError } = await admin.from("local_business_accounts").upsert({
      user_id: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (accountError) throw new ApiError(400, "Could not save the business login.", "LOCAL_BUSINESS_LINK_FAILED");
    if (input.chosenPassword !== undefined) {
      const { error: passwordError } = await admin.auth.admin.updateUserById(userId, {
        password: loginSecret.password,
      });
      if (passwordError) {
        throw new ApiError(400, "Could not set the business password.", "PASSWORD_UPDATE_FAILED");
      }
      const { error: resetFlagError } = await admin
        .from("local_business_accounts")
        .update({ must_reset_password: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (resetFlagError && resetFlagError.code !== "42P01") {
        throw new ApiError(400, "Could not save the business login.", "LOCAL_BUSINESS_LINK_FAILED");
      }
    }
  }

  for (const assignment of assignments) {
    if (await businessUsernameTaken(admin, assignment.username, assignment.partner.id, userId)) {
      if (created) await admin.auth.admin.deleteUser(userId);
      throw new ApiError(409, "That username is already taken.", "USERNAME_TAKEN");
    }
    const { error: memberError } = await admin.from("local_business_memberships").upsert({
      user_id: userId,
      partner_id: assignment.partner.id,
      approved: assignment.approved,
      revoked_at: null,
      created_by: input.createdBy,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,partner_id" });
    if (memberError) {
      if (created) await admin.auth.admin.deleteUser(userId);
      throw new ApiError(400, "Could not link the business listing.", "LOCAL_BUSINESS_LINK_FAILED");
    }
    const { error: nameError } = await admin.from("partner_profile_overrides").upsert({
      partner_id: assignment.partner.id,
      username: assignment.username,
      updated_at: new Date().toISOString(),
    }, { onConflict: "partner_id" });
    if (nameError) {
      if (created) await admin.auth.admin.deleteUser(userId);
      throw new ApiError(400, "Could not save the business username.", "LOCAL_BUSINESS_PROFILE_FAILED");
    }
  }

  return {
    userId,
    email,
    businesses: assignments.map((assignment) => ({
      partnerId: assignment.partner.id,
      username: assignment.username,
    })),
    temporaryPassword: created ? loginSecret.temporaryPassword : null,
    mustResetPassword: created && loginSecret.mustResetPassword,
    created,
  };
}
