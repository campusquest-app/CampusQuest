import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/client/dashboardApi";
import {
  parseConnectionConflict,
  precheckConnectionRequest,
  relationshipToConnectionActionState,
} from "@/lib/client/connectionRequestActions";
import type { ConnectionItem, ConnectionRequestItem, RelationshipSnapshot } from "@/lib/client/socialConnectionsClient";

const baseRelationship = (overrides: Partial<RelationshipSnapshot> = {}): RelationshipSnapshot => ({
  canMessage: false,
  incomingPending: false,
  outgoingPending: false,
  isFollowing: false,
  isFollowedBy: false,
  followBackAvailable: false,
  blockedByMe: false,
  blockedByOther: false,
  requestId: null,
  ...overrides,
});

describe("relationshipToConnectionActionState", () => {
  it("maps accepted relationships to connected", () => {
    expect(
      relationshipToConnectionActionState(
        baseRelationship({ isFollowing: true, canMessage: true }),
      ),
    ).toBe("connected");
  });

  it("maps pending outgoing to outgoing", () => {
    expect(
      relationshipToConnectionActionState(
        baseRelationship({ outgoingPending: true, requestId: "req-1" }),
      ),
    ).toBe("outgoing");
  });

  it("maps pending incoming to incoming", () => {
    expect(
      relationshipToConnectionActionState(
        baseRelationship({ incomingPending: true, requestId: "req-2" }),
      ),
    ).toBe("incoming");
  });
});

describe("parseConnectionConflict", () => {
  it("detects already connected conflicts", () => {
    expect(
      parseConnectionConflict(
        new ApiRequestError("Backend request failed", 409, "ALREADY_CONNECTED"),
      ),
    ).toBe("connected");
  });

  it("detects already sent conflicts", () => {
    expect(
      parseConnectionConflict(
        new ApiRequestError("Connection request already sent.", 409, "REQUEST_ALREADY_SENT"),
      ),
    ).toBe("already_sent");
  });
});

describe("precheckConnectionRequest", () => {
  const connections: ConnectionItem[] = [
    {
      connectionId: "c1",
      userId: "u1",
      username: "alex_rhody",
      displayName: "Alex",
      avatarUrl: null,
      avatarCustomJson: null,
    },
  ];

  const outgoing: ConnectionRequestItem[] = [
    {
      requestId: "r1",
      userId: "u2",
      username: "sam_rhody",
      displayName: "Sam",
      avatarUrl: null,
      avatarCustomJson: null,
      createdAt: new Date().toISOString(),
      mutualFriendsCount: null,
    },
  ];

  it("skips API call when username is already connected", () => {
    const outcome = precheckConnectionRequest({
      username: "alex_rhody",
      connections,
      outgoing,
    });
    expect(outcome?.status).toBe("connected");
    expect(outcome?.toastMessage).toBe("You're already connected.");
  });

  it("skips API call when request is already pending", () => {
    const outcome = precheckConnectionRequest({
      username: "sam_rhody",
      connections,
      outgoing,
    });
    expect(outcome?.status).toBe("already_sent");
  });
});
