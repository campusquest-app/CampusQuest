import { describe, expect, it } from "vitest";
import { resolveAccountTypeUpdate } from "../accountType";

describe("resolveAccountTypeUpdate", () => {
  it("lets normal users pick student or faculty_staff", () => {
    expect(resolveAccountTypeUpdate({ role: null }, "student")).toEqual({
      kind: "update",
      patch: { role: "student" },
      effectiveRole: "student",
      qaAccount: false,
    });
    expect(resolveAccountTypeUpdate({ role: "student" }, "faculty_staff")).toEqual({
      kind: "update",
      patch: { role: "faculty_staff" },
      effectiveRole: "faculty_staff",
      qaAccount: false,
    });
  });

  it("rejects everything except student / faculty_staff", () => {
    for (const bad of ["admin", "super_admin", "qa", "beta_internal", "", null, undefined, 42, {}]) {
      expect(resolveAccountTypeUpdate({ role: null }, bad)).toEqual({ kind: "invalid_role" });
    }
  });

  it("never downgrades admins through the public flow", () => {
    expect(resolveAccountTypeUpdate({ role: "admin" }, "student")).toEqual({ kind: "admin_locked" });
    expect(resolveAccountTypeUpdate({ role: "super_admin" }, "faculty_staff")).toEqual({
      kind: "admin_locked",
    });
  });

  it("stores QA choices in qa_selected_role, keeping the protected qa role", () => {
    const byRole = resolveAccountTypeUpdate({ role: "qa" }, "student");
    expect(byRole).toEqual({
      kind: "update",
      patch: { qa_selected_role: "student" },
      effectiveRole: "qa",
      qaAccount: true,
    });

    const byFlag = resolveAccountTypeUpdate({ role: null, is_test_user: true }, "faculty_staff");
    expect(byFlag).toEqual({
      kind: "update",
      patch: { qa_selected_role: "faculty_staff" },
      effectiveRole: "qa",
      qaAccount: true,
    });
  });

  it("treats legacy invalid roles as changeable normal users", () => {
    expect(resolveAccountTypeUpdate({ role: "legacy_junk" }, "student")).toEqual({
      kind: "update",
      patch: { role: "student" },
      effectiveRole: "student",
      qaAccount: false,
    });
  });
});
