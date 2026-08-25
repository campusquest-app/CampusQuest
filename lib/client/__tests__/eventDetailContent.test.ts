import { describe, expect, it } from "vitest";
import {
  eventCardSummary,
  eventDescriptionParagraphs,
  extractEventKeyFacts,
  extractWhatToExpect,
  shouldCollapseEventDescription,
} from "@/lib/client/eventDetailContent";
import { formatEventDateLine, formatEventTimeLine } from "@/lib/client/eventDateTime";

describe("event detail content", () => {
  it("does not infer free, food, or registration from silence", () => {
    expect(extractEventKeyFacts({ description: "Join us in the Atrium for a welcome mixer." })).toEqual([]);
  });

  it("uses structured campus paid/free and explicit description facts only", () => {
    const facts = extractEventKeyFacts({
      description: "Registration required. Pizza will be served. Open to all. Contact help@uri.edu",
      isPaid: false,
      ticketLink: "https://tickets.example/1",
    });
    expect(facts.some((fact) => fact.id === "cost" && fact.value === "Free")).toBe(true);
    expect(facts.some((fact) => fact.id === "registration")).toBe(true);
    expect(facts.some((fact) => fact.id === "food" && fact.value === "Provided")).toBe(true);
    expect(facts.some((fact) => fact.id === "audience")).toBe(true);
    expect(facts.some((fact) => fact.id === "contact" && fact.value === "help@uri.edu")).toBe(true);
  });

  it("surfaces explicit walk-in, capacity, QR, and ID facts when present", () => {
    const facts = extractEventKeyFacts({
      description: "Walk-ins welcome. Space is limited. Scan the QR to register. Bring your URI ID.",
    });
    expect(facts.some((fact) => fact.id === "walkins" && fact.value === "Welcome")).toBe(true);
    expect(facts.some((fact) => fact.id === "capacity" && fact.value === "Limited")).toBe(true);
    expect(facts.some((fact) => fact.id === "qr")).toBe(true);
    expect(facts.some((fact) => fact.id === "id" && fact.value === "URI ID")).toBe(true);
  });

  it("extracts what to expect only from source bullets", () => {
    expect(
      extractWhatToExpect(
        "Veterans resource fair\n- Veterans benefits information\n- Student organization connections\n- Financial aid resources",
      ),
    ).toEqual([
      "Veterans benefits information",
      "Student organization connections",
      "Financial aid resources",
    ]);
    expect(extractWhatToExpect("A great night with music and friends.")).toEqual([]);
  });

  it("keeps description paragraphs and truncates only card summaries", () => {
    const description = "First paragraph stays readable.\n\nSecond paragraph remains on detail.";
    expect(eventDescriptionParagraphs(description)).toEqual([
      "First paragraph stays readable.",
      "Second paragraph remains on detail.",
    ]);
    expect(eventCardSummary("A".repeat(200))?.endsWith("…")).toBe(true);
    expect(eventCardSummary("A".repeat(200))?.length).toBeLessThanOrEqual(110);
  });

  it("collapses only long descriptions for Read More", () => {
    expect(shouldCollapseEventDescription(["Short"])).toBe(false);
    expect(shouldCollapseEventDescription(["A".repeat(800)])).toBe(true);
    expect(shouldCollapseEventDescription(["a", "b", "c", "d", "e"])).toBe(true);
  });

  it("formats compact date and time lines for the detail meta row", () => {
    const startsAt = "2026-09-14T23:00:00.000Z"; // 7pm Eastern
    const endsAt = "2026-09-15T01:00:00.000Z"; // 9pm Eastern
    const now = new Date("2026-09-01T12:00:00.000Z");
    expect(formatEventDateLine(startsAt, now)).toMatch(/Sep 14/);
    expect(formatEventTimeLine(startsAt, endsAt)).toMatch(/7:00\s*PM/);
    expect(formatEventTimeLine(startsAt, endsAt)).toMatch(/9:00\s*PM/);
  });
});
