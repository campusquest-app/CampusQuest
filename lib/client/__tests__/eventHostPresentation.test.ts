import { describe, expect, it } from "vitest";
import {
  feedEventHostPresentation,
  formatHostedByLabel,
  isVerifiedEventHostName,
  mapEventHostPresentation,
  truncateEventHostName,
} from "@/lib/client/eventHostPresentation";
import type { FeedEvent } from "@/lib/client/eventFeedTypes";

function external(args: {
  organizationName?: string | null;
  source?: string;
  hostCampusOrganizationId?: string | null;
}): FeedEvent {
  return {
    kind: "external",
    event: {
      id: "e1",
      source: args.source ?? "urinvolved",
      title: "Resource Fair",
      description: "",
      category: "Social",
      location: null,
      venueName: null,
      address: null,
      startsAt: "2026-10-20T18:00:00.000Z",
      endsAt: null,
      organizationName: args.organizationName ?? null,
      hostCampusOrganizationId: args.hostCampusOrganizationId ?? null,
      imageUrl: null,
      eventUrl: null,
      tags: [],
      myRsvpStatus: null,
      imported: true,
    },
  };
}

describe("event host presentation", () => {
  it("rejects URInvolved source labels as organizers", () => {
    expect(isVerifiedEventHostName("URInvolved", "urinvolved")).toBe(false);
    expect(isVerifiedEventHostName("urinvolved", "urinvolved")).toBe(false);
    expect(isVerifiedEventHostName("MAVE", "urinvolved")).toBe(true);
    expect(isVerifiedEventHostName(null, "urinvolved")).toBe(false);
  });

  it("formats Hosted by labels and truncates long names on cards", () => {
    expect(formatHostedByLabel("Student Senate")).toBe("Hosted by Student Senate");
    const long = "University of Rhode Island Student Senate Governance Committee";
    const truncated = truncateEventHostName(long, 36);
    expect(truncated.endsWith("…")).toBe(true);
    expect(truncated.length).toBeLessThanOrEqual(36);
  });

  it("shows verified URInvolved hosts and omits missing hosts", () => {
    const withHost = feedEventHostPresentation(external({ organizationName: "MAVE" }));
    expect(withHost.hostedByLabel).toBe("Hosted by MAVE");
    expect(withHost.campusOrganizationId).toBeNull();

    const missing = feedEventHostPresentation(external({ organizationName: null }));
    expect(missing.hostedByLabel).toBeNull();

    const sourceAsHost = feedEventHostPresentation(external({ organizationName: "URInvolved" }));
    expect(sourceAsHost.hostedByLabel).toBeNull();
  });

  it("keeps multi-host strings for display without inventing a single host", () => {
    const multi = feedEventHostPresentation(
      external({ organizationName: "Student Senate, MAVE" }),
    );
    expect(multi.hostName).toBe("Student Senate, MAVE");
    expect(multi.hostedByLabel).toBe("Hosted by Student Senate, MAVE");
  });

  it("surfaces CampusQuest profile ids when linked", () => {
    const linked = feedEventHostPresentation(
      external({
        organizationName: "MAVE",
        hostCampusOrganizationId: "campus-org-1",
      }),
    );
    expect(linked.campusOrganizationId).toBe("campus-org-1");
  });

  it("presents athletics and manual hosts from stored organization names", () => {
    const athletics = mapEventHostPresentation({
      organizationName: "URI Basketball",
      source: "athletics",
    });
    expect(athletics.hostedByLabel).toBe("Hosted by URI Basketball");

    // Manual default organization_name matches the source label — omit rather
    // than presenting the provider as the host.
    const manualDefault = mapEventHostPresentation({
      organizationName: "CampusQuest Verified",
      source: "manual",
    });
    expect(manualDefault.hostedByLabel).toBeNull();

    const manualHost = mapEventHostPresentation({
      organizationName: "Student Activities Office",
      source: "manual",
    });
    expect(manualHost.hostedByLabel).toBe("Hosted by Student Activities Office");
  });

  it("uses campus host organization for native events", () => {
    const campus: FeedEvent = {
      kind: "campus",
      event: {
        id: "c1",
        title: "Club Night",
        description: "",
        category: "Social",
        location: "Union",
        startsAt: "2026-10-20T20:00:00.000Z",
        endsAt: null,
        isPaid: false,
        hostOrganization: { id: "org-9", name: "Rhody Club", logo_url: null },
        rsvpCount: 0,
        myRsvpStatus: null,
        isCancelled: false,
      },
    };
    const host = feedEventHostPresentation(campus);
    expect(host.hostedByLabel).toBe("Hosted by Rhody Club");
    expect(host.campusOrganizationId).toBe("org-9");
  });
});
