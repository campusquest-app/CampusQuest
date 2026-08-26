"use client";

import { useSyncExternalStore } from "react";
import {
  getIdentitySnapshot,
  subscribeIdentityStore,
  type IdentitySnapshot,
} from "@/lib/client/identityStore";
import { findIdentity } from "@/lib/identity/policy";

const EMPTY = getIdentitySnapshot();

export function useCampusIdentities(): IdentitySnapshot & {
  currentIdentity: ReturnType<typeof findIdentity>;
} {
  const state = useSyncExternalStore(subscribeIdentityStore, getIdentitySnapshot, () => EMPTY);
  return {
    ...state,
    currentIdentity: findIdentity(state.identities, state.active),
  };
}
