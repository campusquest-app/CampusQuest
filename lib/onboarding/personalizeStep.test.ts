import { describe, expect, it } from "vitest";
import {
  interestSelectionCount,
  isAboutYouReady,
  isInterestMinimumMet,
  personalizeContinueBlockReason,
  personalizeContinueErrorMessage,
  personalizeInterestCounterLabel,
  stepAfterCampusVerification,
  toggleInterestId,
} from "@/lib/onboarding/personalizeStep";
import type { InterestId } from "@/lib/onboarding/taxonomy";

const IDS = ["athletics", "music", "gaming", "fitness"] as const satisfies readonly InterestId[];

describe("personalize interest selection (canonical source of truth)", () => {
  it("counts 0–4 selections and labels them consistently", () => {
    expect(interestSelectionCount([])).toBe(0);
    expect(personalizeInterestCounterLabel([])).toBe("0 of 3 selected");
    expect(isInterestMinimumMet([])).toBe(false);

    const one = toggleInterestId([], IDS[0]);
    expect(personalizeInterestCounterLabel(one)).toBe("1 of 3 selected");
    expect(isInterestMinimumMet(one)).toBe(false);

    const two = toggleInterestId(one, IDS[1]);
    expect(personalizeInterestCounterLabel(two)).toBe("2 of 3 selected");
    expect(isInterestMinimumMet(two)).toBe(false);

    const three = toggleInterestId(two, IDS[2]);
    expect(personalizeInterestCounterLabel(three)).toBe("3 selected");
    expect(isInterestMinimumMet(three)).toBe(true);
    expect(personalizeContinueBlockReason({ studentStatus: "current_student", interests: three })).toBeNull();

    const four = toggleInterestId(three, IDS[3]);
    expect(personalizeInterestCounterLabel(four)).toBe("4 selected");
    expect(isInterestMinimumMet(four)).toBe(true);
  });

  it("returns invalid when deselecting below the minimum", () => {
    let selected: InterestId[] = [IDS[0], IDS[1], IDS[2]];
    selected = toggleInterestId(selected, IDS[2]);
    expect(interestSelectionCount(selected)).toBe(2);
    expect(isInterestMinimumMet(selected)).toBe(false);
    expect(personalizeContinueBlockReason({ studentStatus: "current_student", interests: selected })).toBe(
      "needs_interests",
    );
    expect(personalizeContinueErrorMessage("needs_interests")).toBe("Pick at least 3 interests to continue.");
  });

  it("does not blame interests when student status is missing (production bug)", () => {
    const four = [IDS[0], IDS[1], IDS[2], IDS[3]];
    expect(personalizeInterestCounterLabel(four)).toBe("4 selected");
    expect(isInterestMinimumMet(four)).toBe(true);
    expect(personalizeContinueBlockReason({ studentStatus: null, interests: four })).toBe("missing_status");
    expect(personalizeContinueErrorMessage("missing_status")).toBe(
      "Tell us about yourself before continuing.",
    );
    expect(personalizeContinueErrorMessage("missing_status")).not.toMatch(/interests/i);
  });

  it("submits the exact selected IDs for 3 and 4 selections", () => {
    const three = [IDS[0], IDS[1], IDS[2]];
    const four = [...three, IDS[3]];
    expect(three).toEqual(["athletics", "music", "gaming"]);
    expect(four).toEqual(["athletics", "music", "gaming", "fitness"]);
    expect(personalizeContinueBlockReason({ studentStatus: "incoming_student", interests: three })).toBeNull();
    expect(personalizeContinueBlockReason({ studentStatus: "incoming_student", interests: four })).toBeNull();
  });

  it("loads existing selections so display, validation, and submit agree", () => {
    const existing: InterestId[] = ["athletics", "tech", "food"];
    expect(personalizeInterestCounterLabel(existing)).toBe("3 selected");
    expect(isInterestMinimumMet(existing)).toBe(true);
    expect(personalizeContinueBlockReason({ studentStatus: "current_student", interests: existing })).toBeNull();
  });
});

describe("stepAfterCampusVerification (email-first)", () => {
  it("sends incomplete demographics to About You after URI verify", () => {
    expect(
      stepAfterCampusVerification({
        demographicsAlreadyComplete: false,
        studentStatus: null,
        graduationYear: null,
        interests: ["athletics", "music", "gaming", "fitness"],
      }),
    ).toBe("about_you");
  });

  it("sends users with status but missing interests to Personalize", () => {
    expect(
      stepAfterCampusVerification({
        demographicsAlreadyComplete: false,
        studentStatus: "current_student",
        graduationYear: 2028,
        interests: [],
      }),
    ).toBe("personalize");
  });

  it("sends email-only remainder to ready", () => {
    expect(
      stepAfterCampusVerification({
        demographicsAlreadyComplete: true,
        studentStatus: "current_student",
        graduationYear: 2028,
        interests: ["athletics", "music", "tech"],
      }),
    ).toBe("ready");
  });
});

describe("isAboutYouReady", () => {
  it("requires graduation year for students", () => {
    expect(isAboutYouReady({ studentStatus: "current_student", graduationYear: null })).toBe(false);
    expect(isAboutYouReady({ studentStatus: "current_student", graduationYear: 2029 })).toBe(true);
    expect(isAboutYouReady({ studentStatus: "faculty_staff", graduationYear: null })).toBe(true);
  });
});
