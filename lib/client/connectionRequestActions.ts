"use client";

import { ApiRequestError } from "@/lib/client/dashboardApi";
import {
  fetchRelationship,
  respondToConnectionRequest,
  sendConnectionRequest,
  type ConnectionItem,
  type ConnectionRequestItem,
  type RelationshipSnapshot,
  type SendConnectionRequestResult,
} from "@/lib/client/socialConnectionsClient";

export type ConnectionActionState = "loading" | "none" | "outgoing" | "incoming" | "connected" | "blocked";

export type ConnectionRequestOutcomeStatus =
  | "sent"
  | "connected"
  | "already_sent"
  | "already_received";

export type ConnectionRequestOutcome = {
  status: ConnectionRequestOutcomeStatus;
  message: string;
  toastMessage: string;
  result: SendConnectionRequestResult;
};

function friendlyToastForStatus(status: ConnectionRequestOutcomeStatus, username: string): string {
  switch (status) {
    case "connected":
      return "You're already connected.";
    case "already_sent":
      return "Request already sent.";
    case "already_received":
      return "They already sent you a request — check your inbox.";
    default:
      return `Follow request sent to @${username}`;
  }
}

export function relationshipToConnectionActionState(
  relationship: RelationshipSnapshot,
): Exclude<ConnectionActionState, "loading"> {
  if (relationship.blockedByMe || relationship.blockedByOther) return "blocked";
  if (relationship.isFollowing || relationship.canMessage) return "connected";
  if (relationship.incomingPending) return "incoming";
  if (relationship.outgoingPending) return "outgoing";
  return "none";
}

export function parseConnectionConflict(error: ApiRequestError): ConnectionRequestOutcomeStatus | null {
  const code = error.code ?? "";
  const msg = error.message.toLowerCase();
  if (code === "ALREADY_CONNECTED" || msg.includes("already connected")) return "connected";
  if (code === "REQUEST_ALREADY_SENT" || msg.includes("already sent")) return "already_sent";
  if (code === "REQUEST_ALREADY_RECEIVED" || msg.includes("already sent you")) return "already_received";
  return null;
}

export function isUsernameConnected(
  username: string,
  connections: ConnectionItem[],
): boolean {
  const normalized = username.trim().toLowerCase();
  return connections.some((row) => row.username.trim().toLowerCase() === normalized);
}

export function isUsernameOutgoingPending(
  username: string,
  outgoing: ConnectionRequestItem[],
): boolean {
  const normalized = username.trim().toLowerCase();
  return outgoing.some((row) => row.username.trim().toLowerCase() === normalized);
}

export function precheckConnectionRequest(args: {
  username: string;
  connections?: ConnectionItem[];
  outgoing?: ConnectionRequestItem[];
  relationship?: RelationshipSnapshot | null;
}): ConnectionRequestOutcome | null {
  const normalized = args.username.trim().toLowerCase();
  if (!normalized) return null;

  if (args.relationship) {
    const state = relationshipToConnectionActionState(args.relationship);
    if (state === "connected") {
      return buildPrecheckOutcome("connected", normalized, "You are already connected.");
    }
    if (state === "outgoing") {
      return buildPrecheckOutcome("already_sent", normalized, "Connection request already sent.");
    }
    if (state === "incoming") {
      return buildPrecheckOutcome("already_received", normalized, "This user already sent you a request.");
    }
  }

  if (args.connections && isUsernameConnected(normalized, args.connections)) {
    return buildPrecheckOutcome("connected", normalized, "You are already connected.");
  }

  if (args.outgoing && isUsernameOutgoingPending(normalized, args.outgoing)) {
    return buildPrecheckOutcome("already_sent", normalized, "Connection request already sent.");
  }

  return null;
}

function buildPrecheckOutcome(
  status: ConnectionRequestOutcomeStatus,
  username: string,
  message: string,
): ConnectionRequestOutcome {
  return {
    status,
    message,
    toastMessage: friendlyToastForStatus(status, username),
    result: {
      status,
      message,
      connection: {
        id: "",
        requesterId: "",
        addresseeId: "",
        status: status === "connected" ? "accepted" : "pending",
        createdAt: new Date().toISOString(),
      },
      notification: null,
    },
  };
}

function normalizeSendResult(
  data: SendConnectionRequestResult,
  username: string,
): ConnectionRequestOutcome {
  const status = data.status;
  return {
    status,
    message: data.message,
    toastMessage: friendlyToastForStatus(status, username),
    result: data,
  };
}

export async function requestConnection(args: {
  username: string;
  connections?: ConnectionItem[];
  outgoing?: ConnectionRequestItem[];
  relationship?: RelationshipSnapshot | null;
}): Promise<ConnectionRequestOutcome> {
  const normalized = args.username.trim().toLowerCase().replace(/\s+/g, "_");
  if (!normalized) {
    throw new Error("Enter a username.");
  }

  const prechecked = precheckConnectionRequest({ ...args, username: normalized });
  if (prechecked) return prechecked;

  try {
    const data = await sendConnectionRequest(normalized);
    return normalizeSendResult(data, normalized);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 409) {
      const conflictStatus = parseConnectionConflict(error);
      if (conflictStatus) {
        return buildPrecheckOutcome(conflictStatus, normalized, error.message);
      }
    }
    throw error;
  }
}

export async function refreshRelationship(otherUserId: string): Promise<RelationshipSnapshot> {
  return fetchRelationship(otherUserId);
}

export async function acceptIncomingConnectionRequest(requestId: string): Promise<void> {
  await respondToConnectionRequest(requestId, "accept");
}

export async function declineIncomingConnectionRequest(requestId: string): Promise<void> {
  await respondToConnectionRequest(requestId, "decline");
}
