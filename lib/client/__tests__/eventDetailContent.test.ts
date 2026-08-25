import { describe, expect, it } from "vitest";
import {
  eventCardSummary,
  eventDescriptionParagraphs,
  extractEventKeyFacts,
  extractWhatToExpect,
} from "@/lib/client/eventDetailContent";

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
});
