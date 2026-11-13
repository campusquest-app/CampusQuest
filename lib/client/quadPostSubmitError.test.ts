import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/client/dashboardApi";
import { formatQuadPostSubmitError, isQuadPostNetworkError } from "@/lib/client/quadPostSubmitError";

describe("formatQuadPostSubmitError", () => {
  it("mentions connectivity only for network failures", () => {
    const network = new ApiRequestError("offline", 0, "NETWORK_ERROR");
    expect(formatQuadPostSubmitError(network)).toMatch(/connection/i);
    expect(isQuadPostNetworkError(network)).toBe(true);
  });

  it("surfaces anonymous and campus verification failures without connectivity copy", () => {
    expect(
      formatQuadPostSubmitError(
        new ApiRequestError("Accept the anonymity notice before posting anonymously.", 403, "ANONYMOUS_NOTICE_REQUIRED"),
      ),
    ).toMatch(/anonymity notice/i);
    expect(
      formatQuadPostSubmitError(
        new ApiRequestError("Campus email verification is required before using this feature.", 403, "SCHOOL_VERIFICATION_REQUIRED"),
      ),
    ).toMatch(/campus email/i);
    expect(
      formatQuadPostSubmitError(new ApiRequestError("Could not create post.", 400, "QUAD_POST_CREATE_FAILED")),
    ).toBe("Could not create post.");
    expect(
      formatQuadPostSubmitError(new ApiRequestError("Could not create post.", 400, "QUAD_POST_CREATE_FAILED")),
    ).not.toMatch(/connection/i);
  });

  it("explains in-flight idempotent retries", () => {
    expect(
      formatQuadPostSubmitError(new ApiRequestError("This post is already being published.", 409, "PUBLISH_IN_PROGRESS")),
    ).toMatch(/already publishing/i);
  });
});
