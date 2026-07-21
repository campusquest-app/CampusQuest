import { describe, expect, it } from "vitest";
import {
  canAccessAdmin,
  canCreateEvent,
  hasRole,
  hasValidRoleSelection,
  isAdmin,
  isFacultyStaff,
  isKnownRole,
  isQAUser,
  isSelectableRole,
  isStudent,
  roleLabel,
} from "./roles";

describe("roles", () => {
  it("identifies roles from profile objects and raw strings", () => {
    expect(isStudent({ role: "student" })).toBe(true);
    expect(isStudent("student")).toBe(true);
    expect(isStudent({ role: "faculty_staff" })).toBe(false);
    expect(isFacultyStaff({ role: "faculty_staff" })).toBe(true);
    expect(isAdmin({ role: "admin" })).toBe(true);
    expect(isAdmin({ role: "super_admin" })).toBe(true);
    expect(isAdmin({ role: "faculty_staff" })).toBe(false);
    expect(isQAUser({ role: "qa" })).toBe(true);
    expect(isQAUser({ role: "student", is_test_user: true })).toBe(true);
    expect(hasRole({ role: "student" }, "student")).toBe(true);
    expect(hasRole(null, "student")).toBe(false);
  });

  it("only allows student and faculty_staff as self-selectable roles", () => {
    expect(isSelectableRole("student")).toBe(true);
    expect(isSelectableRole("faculty_staff")).toBe(true);
    expect(isSelectableRole("admin")).toBe(false);
    expect(isSelectableRole("super_admin")).toBe(false);
    expect(isSelectableRole("qa")).toBe(false);
    expect(isSelectableRole(null)).toBe(false);
    expect(isSelectableRole("")).toBe(false);
  });

  it("validates known roles", () => {
    expect(isKnownRole("student")).toBe(true);
    expect(isKnownRole("faculty_staff")).toBe(true);
    expect(isKnownRole("qa")).toBe(true);
    expect(isKnownRole("banana")).toBe(false);
    expect(isKnownRole(null)).toBe(false);
  });

  it("does not grant admin access to faculty/staff", () => {
    expect(canAccessAdmin({ role: "faculty_staff" })).toBe(false);
    expect(canAccessAdmin({ role: "admin" })).toBe(true);
    expect(canCreateEvent({ role: "faculty_staff" })).toBe(true);
    expect(canCreateEvent({ role: "admin" })).toBe(true);
    expect(canCreateEvent({ role: "qa" })).toBe(false);
  });

  it("labels roles with friendly names", () => {
    expect(roleLabel("student")).toBe("Student");
    expect(roleLabel("faculty_staff")).toBe("Faculty / Staff");
    expect(roleLabel("admin")).toBe("Administrator");
    expect(roleLabel("super_admin")).toBe("Administrator");
    expect(roleLabel("qa")).toBe("QA Test Account");
    expect(roleLabel(null)).toBe("Not set");
    expect(roleLabel("legacy_junk")).toBe("Not set");
  });

  describe("hasValidRoleSelection", () => {
    it("requires an explicit student/faculty_staff choice for normal users", () => {
      expect(hasValidRoleSelection({ role: "student" })).toBe(true);
      expect(hasValidRoleSelection({ role: "faculty_staff" })).toBe(true);
      expect(hasValidRoleSelection({ role: null })).toBe(false);
      expect(hasValidRoleSelection({})).toBe(false);
      expect(hasValidRoleSelection({ role: "" })).toBe(false);
      expect(hasValidRoleSelection({ role: "invalid_old_value" })).toBe(false);
    });

    it("treats admins and internal testers as already valid", () => {
      expect(hasValidRoleSelection({ role: "admin" })).toBe(true);
      expect(hasValidRoleSelection({ role: "super_admin" })).toBe(true);
      expect(hasValidRoleSelection({ role: "beta_internal" })).toBe(true);
    });

    it("routes QA accounts via qa_selected_role so they can re-test the screen", () => {
      expect(hasValidRoleSelection({ role: "qa", is_test_user: true, qa_selected_role: null })).toBe(false);
      expect(hasValidRoleSelection({ role: "qa", is_test_user: true, qa_selected_role: "student" })).toBe(true);
      expect(
        hasValidRoleSelection({ role: "qa", is_test_user: true, qa_selected_role: "faculty_staff" }),
      ).toBe(true);
      // is_test_user alone (even with a stale non-qa role) still uses the QA path.
      expect(hasValidRoleSelection({ role: "student", is_test_user: true, qa_selected_role: null })).toBe(
        false,
      );
    });
  });
});
