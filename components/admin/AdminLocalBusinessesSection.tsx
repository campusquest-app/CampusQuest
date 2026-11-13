"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AdminPanel, AdminSectionIntro } from "@/components/admin/AdminUi";
import { AuthPasswordRequirementsHints } from "@/components/auth/AuthPasswordRequirementsHints";
import { ApiRequestError, postAuthed } from "@/lib/client/dashboardApi";
import { passwordMeetsRequirements } from "@/lib/passwordRequirements";
import { PARTNER_DIRECTORY } from "@/lib/partners/partnerDirectory";

type ProvisionResult = {
  userId: string;
  email: string;
  businesses: { partnerId: string; username: string }[];
  temporaryPassword: string | null;
  mustResetPassword: boolean;
  created: boolean;
};

const INTERNATIONAL_POCKET = {
  email: "internationalpocket@campusquestapp.com",
  partnerId: "international-pocket-cafe",
  username: "international_pocket",
} as const;

export function AdminLocalBusinessesSection() {
  const partners = useMemo(
    () => PARTNER_DIRECTORY.filter((partner) => partner.isActive).map((partner) => ({
      id: partner.id,
      name: partner.name,
      listingType: partner.listingType,
    })),
    [],
  );

  const [email, setEmail] = useState<string>(INTERNATIONAL_POCKET.email);
  const [partnerId, setPartnerId] = useState<string>(INTERNATIONAL_POCKET.partnerId);
  const [username, setUsername] = useState<string>(INTERNATIONAL_POCKET.username);
  const [approved, setApproved] = useState(true);
  const [chosenPassword, setChosenPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [generateTemp, setGenerateTemp] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const selectedPartner = partners.find((partner) => partner.id === partnerId) ?? null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim().replace(/^@+/, "");
    if (!trimmedEmail || !partnerId || !trimmedUsername) {
      setError("Email, listing, and username are required.");
      return;
    }

    let passwordToSend: string | undefined;
    if (!generateTemp) {
      if (!chosenPassword) {
        setError("Enter a password, or choose a temporary password instead.");
        return;
      }
      if (chosenPassword !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      if (!passwordMeetsRequirements(chosenPassword)) {
        setError("Use at least 8 characters with an uppercase letter, a lowercase letter, a number, and a symbol.");
        return;
      }
      passwordToSend = chosenPassword;
    }

    setPending(true);
    try {
      const data = await postAuthed<ProvisionResult, Record<string, unknown>>(
        "/api/internal/admin/local-businesses",
        {
          email: trimmedEmail,
          partnerId,
          username: trimmedUsername,
          approved,
          accountUsername: trimmedUsername,
          ...(passwordToSend !== undefined ? { chosenPassword: passwordToSend } : {}),
        },
      );
      setResult(data);
      setChosenPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : "Could not save the login.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminSectionIntro
        title="Local Businesses"
        description="Create or update a business login and assign it to a Student Perks listing. The password you type is never shown again after save."
      />

      <AdminPanel className="p-4 space-y-4">
        <div>
          <p className="font-semibold text-white">Provision business login</p>
          <p className="mt-1 text-xs text-white/55">
            Defaults are set for International Pocket Café (
            <span className="text-white/75">{INTERNATIONAL_POCKET.email}</span>
            ). Change any field before saving. Existing business logins can have their password reset here.
          </p>
        </div>

        <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-white/70">Login email</span>
            <input
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
              required
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-white/70">Business listing</span>
            <select
              value={partnerId}
              onChange={(event) => {
                const nextId = event.target.value;
                setPartnerId(nextId);
                const next = partners.find((partner) => partner.id === nextId);
                if (next && !username.trim()) {
                  setUsername(next.id.replace(/-/g, "_").slice(0, 24));
                }
              }}
              className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
            >
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                  {partner.listingType === "free_local_business" ? " (free listing)" : ""}
                </option>
              ))}
            </select>
            {selectedPartner ? (
              <span className="block text-[11px] text-white/40">Listing id: {selectedPartner.id}</span>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-white/70">Public username</span>
            <input
              type="text"
              autoComplete="off"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
              minLength={3}
              maxLength={24}
              required
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
              className="rounded border-white/30"
            />
            Approve posting to Local Businesses feed
          </label>

          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={generateTemp}
              onChange={(event) => {
                setGenerateTemp(event.target.checked);
                if (event.target.checked) {
                  setChosenPassword("");
                  setConfirmPassword("");
                }
              }}
              className="rounded border-white/30"
            />
            Generate a temporary password (must change on first sign-in)
          </label>

          {!generateTemp ? (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-white/70">Password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={chosenPassword}
                  onChange={(event) => setChosenPassword(event.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
                  required={!generateTemp}
                />
                <AuthPasswordRequirementsHints password={chosenPassword} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-white/70">Confirm password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white"
                  required={!generateTemp}
                />
              </label>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-uri-keaney px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save business login"}
          </button>
        </form>

        {error ? <p className="text-sm text-amber-300">{error}</p> : null}

        {result ? (
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 space-y-2 text-sm text-emerald-100">
            <p>
              {result.created ? "Created" : "Updated"} login for <span className="font-semibold">{result.email}</span>
              {" · "}user {result.userId.slice(0, 8)}…
            </p>
            <p>
              Assigned: {result.businesses.map((business) => `${business.username} → ${business.partnerId}`).join(", ")}
            </p>
            {result.temporaryPassword ? (
              <p className="font-mono text-xs break-all">
                Temporary password (copy now): {result.temporaryPassword}
                {result.mustResetPassword ? " — must change on first sign-in" : ""}
              </p>
            ) : (
              <p className="text-xs text-emerald-200/80">
                {result.created
                  ? "Password was set as typed and will not be shown again."
                  : "Login updated. Typed password was applied if you entered one."}
              </p>
            )}
          </div>
        ) : null}
      </AdminPanel>
    </div>
  );
}
