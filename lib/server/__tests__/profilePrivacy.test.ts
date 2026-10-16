import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyProfilePrivateFields, PROFILES_PUBLIC_SELECT } from "@/lib/server/profilePrivate";

describe("profile privacy architecture", () => {
  const viewSrc = readFileSync(join(process.cwd(), "lib/server/userProfileView.ts"), "utf8");
  const friendSrc = readFileSync(join(process.cwd(), "lib/server/friendCharacter.ts"), "utf8");
  const recSrc = readFileSync(join(process.cwd(), "lib/server/recommendationProfile.ts"), "utf8");
  const identitiesSrc = readFileSync(join(process.cwd(), "lib/server/identities.ts"), "utf8");
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/20261015150000_profile_private_fields.sql"),
    "utf8",
  );

  it("does not select friends-only columns from profiles in viewer/friend loaders", () => {
    expect(viewSrc).toContain("PROFILES_PUBLIC_SELECT");
    expect(viewSrc).toContain("fetchProfilePrivateFields");
    expect(viewSrc).not.toMatch(/from\("profiles"\)[\s\S]{0,180}bio,/);
    expect(friendSrc).toContain("PROFILES_PUBLIC_SELECT");
    expect(friendSrc).toContain("fetchProfilePrivateFields");
    expect(recSrc).toContain("fetchProfilePrivateFields");
    expect(recSrc).not.toMatch(/select\("institution_id, student_status/);
    expect(identitiesSrc).toContain("fetchProfilePrivateFields");
    expect(identitiesSrc).not.toMatch(/select\("id, display_name, username, avatar_url, bio,/);
  });

  it("keeps public discovery columns readable and private columns off the public select", () => {
    expect(PROFILES_PUBLIC_SELECT).toContain("username");
    expect(PROFILES_PUBLIC_SELECT).toContain("display_name");
    expect(PROFILES_PUBLIC_SELECT).not.toMatch(/\bbio\b/);
    expect(PROFILES_PUBLIC_SELECT).not.toMatch(/\bmajor\b/);
    expect(PROFILES_PUBLIC_SELECT).not.toMatch(/\bclass_year\b/);
    expect(PROFILES_PUBLIC_SELECT).not.toMatch(/\bstudent_status\b/);
  });

  it("merges private fields only when the protected row is visible", () => {
    const publicRow = { id: "u1", username: "ram", display_name: "Ram" };
    expect(applyProfilePrivateFields(publicRow, null)).toEqual(publicRow);
    expect(
      applyProfilePrivateFields(publicRow, {
        user_id: "u1",
        bio: "hello",
        major: "CS",
        class_year: 2028,
        academic_area: "engineering",
        requested_school_name: null,
        student_status: "current_student",
      }),
    ).toMatchObject({ bio: "hello", major: "CS", class_year: 2028 });
  });

  it("revokes authenticated column access and gates profile_private to owner or accepted connections", () => {
    expect(migration).toContain("create table if not exists public.profile_private");
    expect(migration).toContain("revoke select (bio, major, class_year, academic_area, requested_school_name, student_status)");
    expect(migration).toContain("from anon, authenticated, public");
    expect(migration).toContain("grant select (bio, major, class_year, academic_area, requested_school_name, student_status)");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("cq_are_accepted_connections");
    expect(migration).toContain("auth.uid() = user_id");
    expect(migration).toContain("profile_private select owner or connected");
  });
});
