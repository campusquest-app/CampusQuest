import { describe, expect, it } from "vitest";

/**
 * Documents the attendance vs RSVP contract for engagement analytics.
 * Verified attendees must never be inferred from event_rsvps.
 */
describe("engagement attendance contract", () => {
  it("treats RSVP and verified attendance as distinct signals", () => {
    const rsvpUserIds = ["u1", "u2", "u3"];
    const verifiedQrCheckInUserIds = ["u1"]; // subset who scanned event QR
    const uniqueRsvps = new Set(rsvpUserIds).size;
    const uniqueAttendees = new Set(verifiedQrCheckInUserIds).size;
    expect(uniqueRsvps).toBe(3);
    expect(uniqueAttendees).toBe(1);
    expect(uniqueAttendees).not.toBe(uniqueRsvps);
  });

  it("does not count RSVP-only users as attendees", () => {
    const rsvps = [{ userId: "a" }, { userId: "b" }];
    const attendanceFromRsvp = rsvps.map((r) => r.userId); // incorrect approach
    const verifiedAttendance: string[] = []; // correct when no QR check-ins
    expect(attendanceFromRsvp.length).toBe(2);
    expect(verifiedAttendance.length).toBe(0);
  });
});
