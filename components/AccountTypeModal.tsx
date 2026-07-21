"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Briefcase, Check, GraduationCap, X } from "lucide-react";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import type { MeProfileRow } from "@/lib/client/profileCharacter";
import { isSelectableRole, roleLabel, type SelectableRole } from "@/lib/roles";

type AccountTypeResponse = {
  profile: MeProfileRow;
  role: string;
  selectedRole: SelectableRole;
  roleLabel: string;
};

/**
 * Settings › Account Type.
 * Normal users switch between Student and Faculty / Staff (with confirmation).
 * Admin / QA roles are displayed read-only — they can never be self-changed.
 */
export function AccountTypeModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [isQaAccount, setIsQaAccount] = useState(false);
  const [pendingRole, setPendingRole] = useState<SelectableRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profile = await fetchAuthed<MeProfileRow>("/api/me/profile");
        if (cancelled) return;
        const qa = profile.is_test_user === true || profile.role === "qa";
        setIsQaAccount(qa);
        setCurrentRole(qa ? (profile.qa_selected_role ?? "qa") : (profile.role ?? null));
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Could not load your account type.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isLockedRole =
    currentRole === "admin" || currentRole === "super_admin" || currentRole === "beta_internal";
  const effectiveSelectable: SelectableRole | null = isSelectableRole(currentRole) ? currentRole : null;

  async function confirmChange() {
    if (!pendingRole || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await postAuthed<AccountTypeResponse, { role: SelectableRole }>(
        "/api/me/account-type",
        { role: pendingRole },
      );
      setCurrentRole(isQaAccount ? (result.profile.qa_selected_role ?? "qa") : (result.profile.role ?? pendingRole));
      setPendingRole(null);
      setSavedNotice(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save your account type. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-type-title"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/15 bg-uri-navy shadow-xl p-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 id="account-type-title" className="font-display font-bold text-lg text-white">
            Account Type
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-white/60">Loading your account type…</p>
        ) : loadError ? (
          <p className="py-8 text-center text-sm text-amber-400" role="alert">
            {loadError}
          </p>
        ) : (
          <>
            <p className="text-sm text-white/60 mb-4">
              Current type:{" "}
              <span className="font-semibold text-white">
                {isQaAccount ? roleLabel("qa") : roleLabel(currentRole)}
              </span>
              {isQaAccount && isSelectableRole(currentRole) && (
                <span className="text-white/50"> · testing as {roleLabel(currentRole)}</span>
              )}
            </p>

            {isLockedRole ? (
              <p className="rounded-xl border border-white/15 bg-white/[0.05] p-3 text-sm text-white/70">
                This account type is managed by CampusQuest and cannot be changed here.
              </p>
            ) : (
              <div className="space-y-2.5">
                {(
                  [
                    { role: "student" as const, title: "Student", icon: GraduationCap },
                    { role: "faculty_staff" as const, title: "Faculty / Staff", icon: Briefcase },
                  ]
                ).map((option) => {
                  const Icon = option.icon;
                  const isCurrent = effectiveSelectable === option.role;
                  const isPending = pendingRole === option.role;
                  return (
                    <button
                      key={option.role}
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setSavedNotice(false);
                        setSaveError(null);
                        setPendingRole(isCurrent ? null : option.role);
                      }}
                      className={`relative flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed ${
                        isCurrent || isPending
                          ? "border-uri-keaney bg-uri-keaney/15"
                          : "border-white/15 bg-white/[0.05] hover:bg-white/[0.08]"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                          isCurrent || isPending
                            ? "border-uri-keaney/60 bg-uri-keaney/25 text-uri-keaney"
                            : "border-white/15 bg-white/[0.06] text-white/75"
                        }`}
                      >
                        <Icon className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <span className="flex-1 text-sm font-semibold text-white">{option.title}</span>
                      {isCurrent && (
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-uri-keaney">
                          Current
                        </span>
                      )}
                      {isPending && !isCurrent && (
                        <Check className="h-4 w-4 text-uri-keaney" strokeWidth={3} aria-hidden />
                      )}
                    </button>
                  );
                })}

                {pendingRole && (
                  <div className="rounded-xl border border-uri-keaney/40 bg-uri-keaney/10 p-3">
                    <p className="text-sm text-white/85">
                      Change your account type to{" "}
                      <span className="font-semibold">{roleLabel(pendingRole)}</span>? Your XP, badges,
                      posts, and connections are not affected.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setPendingRole(null)}
                        className="flex-1 rounded-lg border border-white/15 bg-white/10 py-2 text-sm font-medium text-white/80 hover:bg-white/15 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void confirmChange()}
                        className="flex-1 rounded-lg bg-uri-keaney py-2 text-sm font-semibold text-white hover:bg-uri-keaney/90 disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Confirm"}
                      </button>
                    </div>
                  </div>
                )}

                {saveError && (
                  <p className="text-sm text-amber-400" role="alert">
                    {saveError}
                  </p>
                )}
                {savedNotice && !pendingRole && (
                  <p className="text-sm text-emerald-400" role="status">
                    Account type updated.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
