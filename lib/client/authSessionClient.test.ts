import { describe, expect, it } from "vitest";
import {
  ApiRequestError,
  AuthSessionMissingError,
  CQ_MISSING_SESSION_CODE,
  isMissingSessionError,
} from "@/lib/client/dashboardApi";

describe("isMissingSessionError", () => {
  it("detects AuthSessionMissingError", () => {
    expect(isMissingSessionError(new AuthSessionMissingError())).toBe(true);
  });

  it("detects ApiRequestError with missing session code", () => {
    expect(
      isMissingSessionError(
        new ApiRequestError("Session required. Sign in from CampusQuest, then try again.", 401, CQ_MISSING_SESSION_CODE),
      ),
    ).toBe(true);
  });

  it("detects message substring", () => {
    expect(isMissingSessionError(new Error("Session required. Sign in from CampusQuest, then try again."))).toBe(true);
  });

  it("detects session expired ApiRequestError", () => {
    expect(isMissingSessionError(new ApiRequestError("Session expired. Please sign in again.", 401, "UNAUTHORIZED"))).toBe(
      true,
    );
  });

  it("returns false for unrelated errors", () => {
    expect(isMissingSessionError(new Error("Network timeout"))).toBe(false);
    expect(isMissingSessionError(new ApiRequestError("Not found", 404, "NOT_FOUND"))).toBe(false);
  });
});
