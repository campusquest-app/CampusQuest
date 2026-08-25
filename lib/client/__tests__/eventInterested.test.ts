import { describe, expect, it } from "vitest";
import {
  applyCampusRsvpStatus,
  isInterestedRsvp,
  nextInterestedRsvpStatus,
  type CampusRsvpStatus,
} from "@/lib/client/eventInterested";

describe("campus Interested RSVP", () => {
  it("toggles interested on and off using existing RSVP statuses", () => {
    expect(nextInterestedRsvpStatus(null)).toBe("interested");
    expect(nextInterestedRsvpStatus("going")).toBe("interested");
    expect(nextInterestedRsvpStatus("interested")).toBe("not_going");
    expect(isInterestedRsvp("interested")).toBe(true);
    expect(isInterestedRsvp("going")).toBe(false);
  });

  it("applies and rolls back a single event without touching others", () => {
    const events: Array<{ id: string; myRsvpStatus: CampusRsvpStatus }> = [
      { id: "a", myRsvpStatus: null },
      { id: "b", myRsvpStatus: "going" },
    ];
    const optimistic = applyCampusRsvpStatus(events, "a", "interested");
    expect(optimistic[0]?.myRsvpStatus).toBe("interested");
    expect(optimistic[1]?.myRsvpStatus).toBe("going");
    expect(applyCampusRsvpStatus(optimistic, "a", null)[0]?.myRsvpStatus).toBeNull();
  });
});
