import { describe, expect, it } from "vitest";
import {
  connectionIdSets,
  defaultPeopleTab,
  discoverConnectionPreview,
  formatConnectionsHeader,
  formatIncomingRequestBadge,
  incomingRequestBadgeCount,
  isPeopleSearchActive,
  isPeopleTab,
  peopleContentMode,
  peopleFollowActionLabel,
  PEOPLE_DISCOVER_PREVIEW_LIMIT,
  resolvePeopleRelationshipState,
  shouldShowDiscoverSeeAll,
} from "./peopleDiscoveryUi";

describe("people discovery tabs and search", () => {
  it("defaults to Discover and only accepts the three real tabs", () => {
    expect(defaultPeopleTab()).toBe("discover");
    expect(isPeopleTab("discover")).toBe(true);
    expect(isPeopleTab("requests")).toBe(true);
    expect(isPeopleTab("following")).toBe(true);
    expect(isPeopleTab("connections")).toBe(false);
  });

  it("switches to search content while typing and restores the tab when cleared", () => {
    expect(isPeopleSearchActive("")).toBe(false);
    expect(peopleContentMode("")).toBe("tab");
    expect(peopleContentMode("kubo")).toBe("search");
    expect(peopleContentMode("   ")).toBe("tab");
  });

  it("never invents a Requests badge", () => {
    expect(incomingRequestBadgeCount(0)).toBe(0);
    expect(incomingRequestBadgeCount(-2)).toBe(0);
    expect(incomingRequestBadgeCount(3.9)).toBe(3);
    expect(formatIncomingRequestBadge(0)).toBeNull();
    expect(formatIncomingRequestBadge(2)).toBe("2");
  });

  it("previews at most four connections on Discover", () => {
    const rows = [1, 2, 3, 4, 5, 6];
    expect(PEOPLE_DISCOVER_PREVIEW_LIMIT).toBe(4);
    expect(discoverConnectionPreview(rows)).toEqual([1, 2, 3, 4]);
    expect(shouldShowDiscoverSeeAll(4)).toBe(true);
    expect(shouldShowDiscoverSeeAll(0)).toBe(false);
  });

  it("formats the Following header from the real count", () => {
    expect(formatConnectionsHeader(0)).toBe("Your Connections (0)");
    expect(formatConnectionsHeader(12)).toBe("Your Connections (12)");
    expect(formatConnectionsHeader(Number.NaN)).toBe("Your Connections (0)");
  });
});

describe("people relationship labels", () => {
  it("maps accepted / pending / incoming onto Follow, Requested, Following", () => {
    const ids = connectionIdSets({
      connections: [{ userId: "c1" }],
      outgoing: [{ userId: "o1" }],
      incoming: [{ userId: "i1" }],
    });

    expect(
      resolvePeopleRelationshipState({ userId: "c1", username: "cam", ...ids }),
    ).toBe("following");
    expect(
      resolvePeopleRelationshipState({ userId: "o1", username: "out", ...ids }),
    ).toBe("requested");
    expect(
      resolvePeopleRelationshipState({ userId: "i1", username: "in", ...ids }),
    ).toBe("follow_back");
    expect(
      resolvePeopleRelationshipState({ userId: "new", username: "new", ...ids }),
    ).toBe("follow");
    expect(
      resolvePeopleRelationshipState({
        userId: "opt",
        username: "opt",
        ...ids,
        optimisticRequestedUserIds: new Set(["opt"]),
      }),
    ).toBe("requested");
  });

  it("uses Follow / Requested / Following copy", () => {
    expect(peopleFollowActionLabel("follow")).toBe("Follow");
    expect(peopleFollowActionLabel("requested")).toBe("Requested");
    expect(peopleFollowActionLabel("following")).toBe("Following");
    expect(peopleFollowActionLabel("follow_back")).toBe("Follow Back");
  });
});
