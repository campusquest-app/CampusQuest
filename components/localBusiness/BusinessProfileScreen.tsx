"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, MapPin } from "lucide-react";
import { fetchAuthed, patchAuthed, postAuthed, deleteAuthed } from "@/lib/client/dashboardApi";
import { deleteQuadPostRequest, fetchBusinessPosts, updateQuadPostRequest } from "@/lib/client/quadPostsClient";
import { uploadMarketplaceImage } from "@/lib/client/marketplaceClient";
import { BusinessLogoField } from "@/components/identity/BusinessLogoField";
import { BusinessProfileHeader } from "@/components/localBusiness/BusinessProfileHeader";
import { getTodayHoursLabel, getWeeklyHoursRows } from "@/lib/partners/partnerHours";
import { partnerDirectionsUrl } from "@/lib/partners/partnerStatus";
import { weeklyHoursFromEditor } from "@/lib/localBusiness/profile";
import type { Partner, PartnerHours } from "@/lib/partners/types";
import type { FieldNote } from "@/lib/types";
import { passwordMeetsRequirements } from "@/lib/passwordRequirements";

type ProfilePayload = {
  partner: Pick<
    Partner,
    | "id"
    | "name"
    | "slug"
    | "description"
    | "address"
    | "logoUrl"
    | "coverImageUrl"
    | "websiteUrl"
    | "hours"
    | "categories"
    | "discountValue"
    | "offerTitle"
    | "offerDescription"
    | "redemptionInstructions"
    | "endsAt"
    | "listingType"
  > & { username?: string | null };
  contactEmail: string | null;
  contactPhone: string | null;
  photos: string[];
  approved: boolean;
  canEdit: boolean;
  activeOffers: number;
  stats: {
    posts: number;
    followers: number | null;
    postEngagement: number | null;
    offerViews: number | null;
    redemptions: number | null;
  };
};

type ManagedBusiness = {
  partnerId: string;
  name: string;
  canEdit?: boolean;
};

type Tab = "posts" | "offers" | "about" | "dashboard" | "edit";

export function OwnBusinessProfile({
  businesses,
  partnerId,
  onPartnerChange,
  ...props
}: Omit<Parameters<typeof BusinessProfileScreen>[0], "partnerId" | "businesses" | "onPartnerChange"> & {
  businesses: ManagedBusiness[];
  partnerId: string | null;
  onPartnerChange: (partnerId: string) => void;
}) {
  if (!partnerId) {
    return <p className="px-4 py-16 text-center text-sm text-white/70">This login is not linked to a business yet.</p>;
  }
  return (
    <BusinessProfileScreen
      key={partnerId}
      {...props}
      partnerId={partnerId}
      businesses={businesses}
      onPartnerChange={onPartnerChange}
    />
  );
}

export function BusinessProfileScreen({
  partnerId,
  viewerId,
  onClose,
  onCreatePost,
  onViewPerk,
  businesses = [],
  onPartnerChange,
}: {
  partnerId: string;
  viewerId: string;
  onClose?: () => void;
  onCreatePost?: () => void;
  onViewPerk?: () => void;
  businesses?: ManagedBusiness[];
  onPartnerChange?: (partnerId: string) => void;
}) {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [posts, setPosts] = useState<FieldNote[]>([]);
  const [tab, setTab] = useState<Tab>("posts");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [openPost, setOpenPost] = useState<FieldNote | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchAuthed<ProfilePayload>(`/api/local-business/profile?partnerId=${encodeURIComponent(partnerId)}`)
      .then(async (next) => {
        if (cancelled) return;
        setProfile(next);
        setDescription(next.partner.description ?? "");
        setWebsite(next.partner.websiteUrl ?? "");
        setContactEmail(next.contactEmail ?? "");
        setContactPhone(next.contactPhone ?? "");
        const notes = await fetchBusinessPosts(viewerId, next.partner.id, 40);
        if (!cancelled) setPosts(notes.filter((note) => note.businessPartnerId === next.partner.id));
        try {
          const favorites = await fetchAuthed<{ partnerIds?: string[] }>("/api/partners/favorites");
          if (!cancelled) setSaved((favorites.partnerIds ?? []).includes(next.partner.id));
        } catch {
          /* Follow still works if the saved list cannot load. */
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this business.");
      });
    return () => {
      cancelled = true;
    };
  }, [partnerId, viewerId]);

  async function toggleFollow() {
    if (!profile) return;
    if (saved) {
      await deleteAuthed(`/api/partners/favorites?partnerId=${encodeURIComponent(profile.partner.id)}`);
      setSaved(false);
    } else {
      await postAuthed("/api/partners/favorites", { partnerId: profile.partner.id });
      setSaved(true);
    }
  }

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    setFileError(null);
    try {
      const hours = weeklyHoursFromEditor(openTime, closeTime);
      if ((openTime || closeTime) && !hours) {
        setFileError("Enter both an opening and closing time, like 12:00 and 22:00.");
        return;
      }
      let logoUrl: string | undefined;
      let coverImageUrl: string | undefined;
      let photoUrl: string | undefined;
      if (logoFile) logoUrl = await uploadMarketplaceImage(logoFile, logoFile.name);
      if (coverFile) coverImageUrl = await uploadMarketplaceImage(coverFile, coverFile.name);
      if (photoFile) photoUrl = await uploadMarketplaceImage(photoFile, photoFile.name);
      await patchAuthed("/api/local-business/profile", {
        partnerId: profile.partner.id,
        description,
        websiteUrl: website || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        ...(logoUrl ? { logoUrl } : {}),
        ...(coverImageUrl ? { coverImageUrl } : {}),
        ...(photoUrl ? { photos: [...profile.photos, photoUrl].slice(0, 8) } : {}),
        ...(hours ? { hours } : {}),
      });
      setTab("about");
      const next = await fetchAuthed<ProfilePayload>(
        `/api/local-business/profile?partnerId=${encodeURIComponent(partnerId)}`,
      );
      setProfile(next);
      setLogoFile(null);
      setCoverFile(null);
      setPhotoFile(null);
    } catch {
      setFileError("Could not save the business profile.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="px-4 py-16 text-center text-sm text-red-300">{error}</p>;
  if (!profile) return <p className="px-4 py-16 text-center text-sm text-white/60">Loading business…</p>;

  const partner = profile.partner;
  const directions = partnerDirectionsUrl(partner as Partner);
  const hoursToday = getTodayHoursLabel(partner.hours as PartnerHours | null);
  const hourRows = getWeeklyHoursRows(partner.hours as PartnerHours | null);
  const isOwner = profile.canEdit;

  return (
    <div className="cq-profile-screen mx-auto w-full max-w-3xl pb-24 text-white">
      {onClose ? (
        <button type="button" className="mb-3 text-sm font-semibold text-uri-keaney" onClick={onClose}>
          Back
        </button>
      ) : null}
      <div className="rounded-3xl border border-white/10 bg-uri-navy">
        <BusinessProfileHeader
          name={partner.name}
          handle={partner.username || partner.slug}
          logoUrl={partner.logoUrl}
          coverImageUrl={partner.coverImageUrl}
          nameControl={
            businesses.length > 1 && onPartnerChange ? (
              <label className="block">
                <span className="sr-only">Active business</span>
                <select
                  aria-label="Active business"
                  className="w-full max-w-full rounded-full bg-white px-3 py-1.5 text-base font-bold text-uri-navy"
                  value={partnerId}
                  onChange={(event) => onPartnerChange(event.target.value)}
                >
                  {businesses.map((business) => (
                    <option key={business.partnerId} value={business.partnerId}>
                      {business.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-semibold text-uri-keaney">Active business</span>
              </label>
            ) : undefined
          }
        />
        <div className="px-4 pb-4">
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white/10 px-3 py-1">Local Business</span>
            {profile.approved ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-uri-keaney/20 px-3 py-1 text-uri-keaney">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified Business
              </span>
            ) : null}
          </div>
          {partner.description ? <p className="mt-3 text-sm leading-relaxed text-white/80">{partner.description}</p> : null}
          {partner.address ? (
            <p className="mt-2 inline-flex items-center gap-1 text-sm text-white/70">
              <MapPin className="h-4 w-4" aria-hidden /> {partner.address}
            </p>
          ) : null}
          {hoursToday ? <p className="mt-1 text-sm text-white/70">{hoursToday}</p> : null}
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-xs text-white/50">Posts</dt>
              <dd className="text-lg font-bold">{profile.stats.posts}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/50">Followers</dt>
              <dd className="text-lg font-bold">{profile.stats.followers ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/50">Active Offers</dt>
              <dd className="text-lg font-bold">{profile.activeOffers}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {isOwner ? (
              <>
                <button type="button" className="rounded-full bg-white px-4 py-2 text-sm font-bold text-uri-navy" onClick={() => setTab("edit")}>
                  Edit Business Profile
                </button>
                {onCreatePost ? (
                  <button type="button" className="rounded-full bg-uri-keaney px-4 py-2 text-sm font-bold" onClick={onCreatePost}>
                    Create Post
                  </button>
                ) : null}
                {onViewPerk ? (
                  <button type="button" className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold" onClick={onViewPerk}>
                    Manage Offers
                  </button>
                ) : null}
                <button type="button" className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold" onClick={() => setTab("dashboard")}>
                  Business Dashboard
                </button>
              </>
            ) : (
              <>
                <button type="button" className="rounded-full bg-uri-keaney px-4 py-2 text-sm font-bold" onClick={() => void toggleFollow()}>
                  {saved ? "Following" : "Follow"}
                </button>
                {onViewPerk ? (
                  <button type="button" className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold" onClick={onViewPerk}>
                    View Student Perk
                  </button>
                ) : null}
                {partner.websiteUrl ? (
                  <a className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold" href={partner.websiteUrl} target="_blank" rel="noreferrer">
                    Website
                  </a>
                ) : null}
                {directions ? (
                  <a className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold" href={directions} target="_blank" rel="noreferrer">
                    Directions
                  </a>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto px-1" role="tablist">
        {(["posts", "offers", "about"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`rounded-full px-4 py-2 text-sm font-bold ${tab === id ? "bg-white text-uri-navy" : "bg-white/10 text-white"}`}
            onClick={() => setTab(id)}
          >
            {id[0]!.toUpperCase() + id.slice(1)}
          </button>
        ))}
      </div>

      {tab === "posts" ? (
        <div className="mt-4 grid grid-cols-3 gap-1">
          {posts.length === 0 ? <p className="col-span-3 py-10 text-center text-sm text-white/60">No business posts yet.</p> : null}
          {posts.map((post) => (
            <button
              key={post.id}
              type="button"
              className="aspect-square overflow-hidden bg-white/5 text-left"
              onClick={() => {
                setOpenPost(post);
                setDraft(post.body ?? "");
              }}
            >
              {post.proofUrl ? <img src={post.proofUrl} alt="" className="h-full w-full object-cover" /> : <p className="p-2 text-xs text-white/70">{post.body}</p>}
            </button>
          ))}
        </div>
      ) : null}

      {openPost ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl bg-uri-navy p-4 text-white">
            {openPost.proofUrl ? <img src={openPost.proofUrl} alt="" className="mb-3 max-h-72 w-full rounded-2xl object-cover" /> : null}
            {isOwner ? (
              <textarea className="w-full rounded-2xl bg-white/10 p-3 text-sm" value={draft} maxLength={300} onChange={(event) => setDraft(event.target.value)} />
            ) : (
              <p className="text-sm leading-relaxed">{openPost.body}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button type="button" className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold" onClick={() => setOpenPost(null)}>
                Close
              </button>
              {isOwner ? (
                <>
                  <button
                    type="button"
                    className="rounded-full bg-uri-keaney px-4 py-2 text-sm font-bold"
                    onClick={() => {
                      void updateQuadPostRequest(openPost.id, { body: draft }, viewerId).then((note) => {
                        setPosts((current) => current.map((item) => (item.id === note.id ? note : item)));
                        setOpenPost(note);
                      });
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-red-500/80 px-4 py-2 text-sm font-bold"
                    onClick={() => {
                      void deleteQuadPostRequest(openPost.id).then(() => {
                        setPosts((current) => current.filter((item) => item.id !== openPost.id));
                        setOpenPost(null);
                      });
                    }}
                  >
                    Delete
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "offers" ? (
        <div className="mt-4 rounded-3xl border border-white/10 p-4">
          {profile.activeOffers === 0 ? (
            <p className="text-sm text-white/70">No active student offer.</p>
          ) : (
            <>
              <h2 className="text-lg font-bold">{partner.offerTitle ?? partner.discountValue}</h2>
              {partner.discountValue ? <p className="mt-1 text-sm text-uri-keaney">{partner.discountValue}</p> : null}
              {partner.offerDescription ? <p className="mt-2 text-sm text-white/75">{partner.offerDescription}</p> : null}
              {partner.endsAt ? <p className="mt-2 text-xs text-white/50">Ends {partner.endsAt.slice(0, 10)}</p> : null}
              {partner.redemptionInstructions ? <p className="mt-2 text-sm text-white/75">{partner.redemptionInstructions}</p> : null}
            </>
          )}
        </div>
      ) : null}

      {tab === "about" ? (
        <div className="mt-4 space-y-3 rounded-3xl border border-white/10 p-4 text-sm">
          {partner.categories.length > 0 ? <p>{partner.categories.join(" · ")}</p> : null}
          {partner.address ? <p>{partner.address}</p> : null}
          {hourRows.map((row) => (
            <p key={row.day}>
              {row.day}: {row.hours}
            </p>
          ))}
          {profile.contactEmail ? <p>{profile.contactEmail}</p> : null}
          {profile.contactPhone ? <p>{profile.contactPhone}</p> : null}
          {partner.websiteUrl ? <p>{partner.websiteUrl}</p> : null}
          {profile.photos.map((photo) => (
            <img key={photo} src={photo} alt="" className="h-32 w-full rounded-2xl object-cover" />
          ))}
        </div>
      ) : null}

      {tab === "dashboard" && isOwner ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="Total posts" value={profile.stats.posts} />
          <Metric label="Followers" value={profile.stats.followers} />
          <Metric label="Active offers" value={profile.activeOffers} />
          <Metric label="Post engagement" value={profile.stats.postEngagement} />
          <Metric label="Offer views" value={profile.stats.offerViews} />
          <Metric label="Offer redemptions" value={profile.stats.redemptions} />
        </div>
      ) : null}

      {tab === "edit" && isOwner ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void saveProfile();
          }}
        >
          <label className="block text-sm">
            Description
            <textarea className="mt-1 w-full rounded-2xl bg-white/10 p-3" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
          </label>
          <label className="block text-sm">
            Website
            <input className="mt-1 w-full rounded-2xl bg-white/10 p-3" value={website} onChange={(event) => setWebsite(event.target.value)} />
          </label>
          <label className="block text-sm">
            Contact email
            <input className="mt-1 w-full rounded-2xl bg-white/10 p-3" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
          </label>
          <label className="block text-sm">
            Phone
            <input className="mt-1 w-full rounded-2xl bg-white/10 p-3" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              Opens
              <input className="mt-1 w-full rounded-2xl bg-white/10 p-3" placeholder="12:00" value={openTime} onChange={(event) => setOpenTime(event.target.value)} />
            </label>
            <label className="text-sm">
              Closes
              <input className="mt-1 w-full rounded-2xl bg-white/10 p-3" placeholder="22:00" value={closeTime} onChange={(event) => setCloseTime(event.target.value)} />
            </label>
          </div>
          <BusinessLogoField file={logoFile} onFile={setLogoFile} onError={setFileError} inputId="cq-business-profile-logo" label="logo" />
          <BusinessLogoField file={coverFile} onFile={setCoverFile} onError={setFileError} inputId="cq-business-profile-cover" label="cover" />
          <BusinessLogoField file={photoFile} onFile={setPhotoFile} onError={setFileError} inputId="cq-business-profile-photo" label="photo" />
          {fileError ? <p className="text-sm text-red-300">{fileError}</p> : null}
          <button type="submit" disabled={saving} className="rounded-full bg-uri-keaney px-4 py-3 text-sm font-bold">
            {saving ? "Saving…" : "Save profile"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-3xl border border-white/10 p-4">
      <p className="text-xs text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value == null ? "Unavailable" : value}</p>
    </div>
  );
}

export function LocalBusinessPasswordGate({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextPassword = password.trim();
    if (!passwordMeetsRequirements(nextPassword)) {
      setError("Choose a password that meets every requirement.");
      return;
    }
    if (nextPassword !== confirm.trim()) {
      setError("Those passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await postAuthed("/api/local-business/me", { password: nextPassword });
      onDone();
    } catch {
      setError("Could not update the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onSubmit={(event) => void submit(event)}>
      <div className="w-full max-w-md rounded-3xl bg-uri-navy p-6 text-white">
        <h2 className="text-xl font-bold">Set a new password</h2>
        <p className="mt-2 text-sm text-white/70">This business login needs a new password before you continue.</p>
        <input type="password" className="mt-4 w-full rounded-2xl bg-white/10 p-3" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        <input type="password" className="mt-2 w-full rounded-2xl bg-white/10 p-3" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" />
        {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
        <button type="submit" disabled={busy} className="mt-4 w-full rounded-full bg-uri-keaney py-3 text-sm font-bold">
          {busy ? "Saving…" : "Save password"}
        </button>
      </div>
    </form>
  );
}
