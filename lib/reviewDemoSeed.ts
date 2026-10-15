/**
 * Isolated App Store review demo content for the designated reviewer account.
 *
 * Every row is flagged `is_review_demo = true` (profiles, posts, events, orgs),
 * which the restrictive RLS policy "review demo rows visible to qa only" hides
 * from every session except QA test accounts. Social rows (friend requests, DMs,
 * notifications) only ever involve the reviewer and the fictional demo profiles.
 *
 * Fictional profiles are real auth users so report, block, messaging, and
 * friend-request flows run through production code paths. They are banned and
 * get a random, discarded password, so nobody can sign in as them.
 *
 * Dependency-free (type-only imports) so `scripts/seed-review-demo.mjs` can load
 * it with Node's TypeScript support.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = Pick<SupabaseClient, "from" | "auth">;

export const REVIEW_DEMO_SCHOOL_NAME = "University of Rhode Island";
export const REVIEW_DEMO_SCHOOL_DOMAIN = "uri.edu";
export const REVIEW_DEMO_LABEL = "(Demo)";
const BAN_DURATION = "876000h";

export type ReviewDemoProfileKey = "maya" | "jordan" | "priya";

export const REVIEW_DEMO_PROFILES: ReadonlyArray<{
  key: ReviewDemoProfileKey;
  email: string;
  username: string;
  displayName: string;
  bio: string;
  major: string;
}> = [
  {
    key: "maya",
    email: "review-demo-maya@example.com",
    username: "cqdemo_maya",
    displayName: "Maya R. (Demo)",
    bio: "Fictional demo profile for App Review — not a real student. Hiking Club organizer.",
    major: "Marine Biology",
  },
  {
    key: "jordan",
    email: "review-demo-jordan@example.com",
    username: "cqdemo_jordan",
    displayName: "Jordan T. (Demo)",
    bio: "Fictional demo profile for App Review — not a real student. Study-group regular.",
    major: "Computer Science",
  },
  {
    key: "priya",
    email: "review-demo-priya@example.com",
    username: "cqdemo_priya",
    displayName: "Priya S. (Demo)",
    bio: "Fictional demo profile for App Review — not a real student. Greek life & service events.",
    major: "Communications",
  },
];

/** Fixed ids keep the seed idempotent: rows are upserted in place on every run. */
export const REVIEW_DEMO_IDS = {
  hikingClub: "d3e00000-0000-4000-8000-00000000a001",
  greekOrg: "d3e00000-0000-4000-8000-00000000a002",
  events: [
    "d3e00000-0000-4000-8000-00000000e001",
    "d3e00000-0000-4000-8000-00000000e002",
    "d3e00000-0000-4000-8000-00000000e003",
    "d3e00000-0000-4000-8000-00000000e004",
    "d3e00000-0000-4000-8000-00000000e005",
    "d3e00000-0000-4000-8000-00000000e006",
  ],
  posts: [
    "d3e00000-0000-4000-8000-00000000b001",
    "d3e00000-0000-4000-8000-00000000b002",
    "d3e00000-0000-4000-8000-00000000b003",
    "d3e00000-0000-4000-8000-00000000b004",
    "d3e00000-0000-4000-8000-00000000b005",
  ],
} as const;

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

type DemoEventFixture = {
  title: string;
  description: string;
  category: string;
  locationName: string;
  startOffsetMs: number;
  durationMs: number;
  host: { kind: "org"; orgId: string; createdBy: ReviewDemoProfileKey } | { kind: "user"; userKey: ReviewDemoProfileKey };
};

export const REVIEW_DEMO_EVENTS: readonly DemoEventFixture[] = [
  {
    title: "[Demo] Coffee & Code Meetup",
    description: "Demo event for App Review. Bring a laptop and a project — fictional event, not a real gathering.",
    category: "social",
    locationName: "Memorial Union",
    startOffsetMs: -30 * MINUTE,
    durationMs: 2 * HOUR,
    host: { kind: "user", userKey: "jordan" },
  },
  {
    title: "[Demo] Finals Study Jam",
    description: "Demo event for App Review. Quiet group study with snacks — fictional event.",
    category: "academic",
    locationName: "Carothers Library",
    startOffsetMs: 3 * HOUR,
    durationMs: 3 * HOUR,
    host: { kind: "user", userKey: "jordan" },
  },
  {
    title: "[Demo] Sunset Hike Kickoff",
    description: "Demo event for App Review hosted by the demo Hiking Club — fictional event.",
    category: "sports",
    locationName: "The Quad",
    startOffsetMs: 26 * HOUR,
    durationMs: 2 * HOUR,
    host: { kind: "org", orgId: REVIEW_DEMO_IDS.hikingClub, createdBy: "maya" },
  },
  {
    title: "[Demo] Rams Basketball Watch Party",
    description: "Demo event for App Review — fictional event.",
    category: "sports",
    locationName: "Ryan Center",
    startOffsetMs: 2 * 24 * HOUR,
    durationMs: 3 * HOUR,
    host: { kind: "user", userKey: "maya" },
  },
  {
    title: "[Demo] Greek Week Service Drive",
    description: "Demo event for App Review hosted by the demo Greek chapter — fictional event.",
    category: "community_service",
    locationName: "Memorial Union",
    startOffsetMs: 3 * 24 * HOUR,
    durationMs: 4 * HOUR,
    host: { kind: "org", orgId: REVIEW_DEMO_IDS.greekOrg, createdBy: "priya" },
  },
  {
    title: "[Demo] Late-Night Pancakes",
    description: "Demo event for App Review — fictional event.",
    category: "social",
    locationName: "Butterfield Dining Hall",
    startOffsetMs: 5 * 24 * HOUR,
    durationMs: 2 * HOUR,
    host: { kind: "user", userKey: "priya" },
  },
];

export const REVIEW_DEMO_POSTS: ReadonlyArray<{ userKey: ReviewDemoProfileKey; body: string; ageMs: number }> = [
  { userKey: "maya", body: "[Demo] Sunset over the Quad tonight was unreal 🌅 Who's coming to the hike kickoff tomorrow?", ageMs: 20 * MINUTE },
  { userKey: "jordan", body: "[Demo] Grabbed a table on the 2nd floor of the library for the study jam — come through!", ageMs: 2 * HOUR },
  { userKey: "priya", body: "[Demo] Greek Week service drive is collecting canned goods all week at Memorial Union 🥫", ageMs: 5 * HOUR },
  { userKey: "maya", body: "[Demo] Lost a blue water bottle near the Ryan Center, DM me if you found it!", ageMs: 26 * HOUR },
  { userKey: "jordan", body: "[Demo] Pro tip: the Memorial Union has the best outlets for laptop marathons ⚡", ageMs: 50 * HOUR },
];

export const REVIEW_DEMO_DM_MESSAGES: ReadonlyArray<{ fromDemo: boolean; content: string; ageMs: number }> = [
  { fromDemo: true, content: "Hey! 👋 This is a demo conversation for App Review.", ageMs: 40 * MINUTE },
  { fromDemo: true, content: "Want to join the Finals Study Jam later? (demo message)", ageMs: 35 * MINUTE },
];

export type ReviewDemoConnectionRow = {
  id?: string;
  requester_id: string;
  addressee_id: string;
  status: string;
};

export function hasConnectionBetween(rows: readonly ReviewDemoConnectionRow[], a: string, b: string): boolean {
  return rows.some(
    (row) =>
      (row.requester_id === a && row.addressee_id === b) || (row.requester_id === b && row.addressee_id === a),
  );
}

/** Insert only pairs that do not already exist. Never overwrites accept/decline/block outcomes. */
export function missingReviewDemoConnections(args: {
  existing: readonly ReviewDemoConnectionRow[];
  demo: { jordan: string; priya: string };
  reviewerUserId: string;
}): Array<{ requester_id: string; addressee_id: string; status: "accepted" | "pending" }> {
  const missing: Array<{ requester_id: string; addressee_id: string; status: "accepted" | "pending" }> = [];
  if (!hasConnectionBetween(args.existing, args.demo.jordan, args.reviewerUserId)) {
    missing.push({ requester_id: args.demo.jordan, addressee_id: args.reviewerUserId, status: "accepted" });
  }
  if (!hasConnectionBetween(args.existing, args.demo.priya, args.reviewerUserId)) {
    missing.push({ requester_id: args.demo.priya, addressee_id: args.reviewerUserId, status: "pending" });
  }
  return missing;
}

export function shouldInsertSeedMessages(existingCount: number): boolean {
  return existingCount === 0;
}

export function missingReviewDemoNotifications<T extends { type: string; actor_id?: string | null }>(
  existing: readonly { type: string; actor_id?: string | null }[],
  planned: readonly T[],
): T[] {
  return planned.filter(
    (item) =>
      !existing.some((row) => row.type === item.type && (row.actor_id ?? null) === (item.actor_id ?? null)),
  );
}

type SeedOptions = {
  admin: Admin;
  reviewerUserId: string;
  /** Canonical reviewer email (lib/appReviewAccount.ts) — the seed refuses any other account. */
  expectedReviewerEmail: string;
  /** Pilot school the reviewer is scoped to; event/org lists filter by domain. */
  school?: { name: string; domain: string };
  now?: Date;
};

export type ReviewDemoSeedResult = {
  profiles: number;
  posts: number;
  events: number;
  organizations: number;
  notifications: number;
  messages: number;
};

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function directKeyFor(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function randomPassword(): string {
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const special = "!@#$%^&*()-_=+[]{}";
  const all = lower + upper + digits + special;
  const pick = (alphabet: string) => alphabet[globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % alphabet.length];
  const bytes = new Uint8Array(28);
  globalThis.crypto.getRandomValues(bytes);
  const chars = [pick(lower), pick(upper), pick(digits), pick(special), ...Array.from(bytes, (byte) => all[byte % all.length])];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function must<T>(result: { data: T; error: { message?: string } | null }, step: string): T {
  if (result.error) throw new Error(`review demo ${step} failed: ${result.error.message ?? "unknown error"}`);
  return result.data;
}

/** Throws unless `userId` is the designated reviewer (exact email + QA test flags). */
export async function assertDesignatedReviewer(admin: Admin, userId: string, expectedEmail: string): Promise<void> {
  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(userId);
  if (authError || !authUser?.user) throw new Error("review demo: reviewer auth user not found");
  if ((authUser.user.email ?? "").toLowerCase() !== expectedEmail.toLowerCase()) {
    throw new Error("review demo: refusing to seed for a non-designated account");
  }
  const profile = must(
    await admin.from("profiles").select("role, is_test_user, is_review_demo").eq("id", userId).maybeSingle(),
    "reviewer lookup",
  ) as { role?: string | null; is_test_user?: boolean | null; is_review_demo?: boolean | null } | null;
  if (!profile || profile.role !== "qa" || profile.is_test_user !== true || profile.is_review_demo === true) {
    throw new Error("review demo: reviewer profile is not a QA test account");
  }
}

async function findAuthUserIdByEmail(admin: Admin, email: string): Promise<string | null> {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`review demo listUsers failed: ${error.message}`);
    const match = data.users.find((user) => (user.email ?? "").toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureDemoProfiles(admin: Admin): Promise<Record<ReviewDemoProfileKey, string>> {
  const existing = must(
    await admin
      .from("profiles")
      .select("id, username, is_review_demo")
      .in(
        "username",
        REVIEW_DEMO_PROFILES.map((profile) => profile.username),
      ),
    "profile lookup",
  ) as { id: string; username: string; is_review_demo: boolean | null }[] | null;
  const byUsername = new Map((existing ?? []).map((row) => [row.username, row]));

  const ids = {} as Record<ReviewDemoProfileKey, string>;
  for (const fixture of REVIEW_DEMO_PROFILES) {
    const found = byUsername.get(fixture.username);
    if (found && found.is_review_demo !== true) {
      throw new Error(`review demo: username ${fixture.username} belongs to a non-demo profile`);
    }
    let userId = found?.id ?? (await findAuthUserIdByEmail(admin, fixture.email));
    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: fixture.email,
        password: randomPassword(),
        email_confirm: true,
        ban_duration: BAN_DURATION,
        user_metadata: { display_name: fixture.displayName, is_review_demo: true },
      });
      if (error || !data.user) throw new Error(`review demo createUser failed: ${error?.message ?? "unknown"}`);
      userId = data.user.id;
    } else {
      // Auth-layer ban only. Do not write user_account_safety: that table
      // gates the reviewer's ability to message, friend, report, and block
      // these profiles. Re-apply the GoTrue ban; never rotate the password.
      await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION });
    }
    must(
      await admin.from("profiles").upsert(
        {
          id: userId,
          username: fixture.username,
          display_name: fixture.displayName,
          bio: fixture.bio,
          major: fixture.major,
          role: "student",
          is_review_demo: true,
          is_hidden: false,
          is_test_user: false,
          onboarding_completed: true,
        },
        { onConflict: "id" },
      ),
      "profile upsert",
    );
    ids[fixture.key] = userId;
  }
  return ids;
}

/**
 * Create or refresh catalog demo content and fill any missing social fixtures.
 * Idempotent and additive: never wipes the reviewer's onboarding, blocks,
 * accepted/declined requests, DMs, or notifications.
 */
export async function seedReviewDemoContent(options: SeedOptions): Promise<ReviewDemoSeedResult> {
  const { admin, reviewerUserId } = options;
  const nowMs = (options.now ?? new Date()).getTime();
  const schoolName = options.school?.name ?? REVIEW_DEMO_SCHOOL_NAME;
  const schoolDomain = (options.school?.domain ?? REVIEW_DEMO_SCHOOL_DOMAIN).toLowerCase();
  await assertDesignatedReviewer(admin, reviewerUserId, options.expectedReviewerEmail);

  const demo = await ensureDemoProfiles(admin);
  const demoIds = Object.values(demo);

  must(
    await admin.from("student_organizations").upsert(
      [
        {
          id: REVIEW_DEMO_IDS.hikingClub,
          name: "[Demo] URI Hiking Club",
          description: "Demo organization for App Review — fictional club.",
          category: "sports",
          school_name: schoolName,
          school_domain: schoolDomain,
          created_by: demo.maya,
          is_approved: true,
          mention_slug: "demo-hiking-club",
          is_review_demo: true,
        },
        {
          id: REVIEW_DEMO_IDS.greekOrg,
          name: "[Demo] Alpha Delta Demo",
          description: "Demo Greek chapter for App Review — fictional organization.",
          category: "greek_life",
          school_name: schoolName,
          school_domain: schoolDomain,
          created_by: demo.priya,
          is_approved: true,
          mention_slug: "demo-alpha-delta",
          is_review_demo: true,
        },
      ],
      { onConflict: "id" },
    ),
    "organization upsert",
  );
  must(
    await admin.from("organization_members").upsert(
      [
        { organization_id: REVIEW_DEMO_IDS.hikingClub, user_id: demo.maya, role: "manager", org_role: "owner", membership_kind: "member", status: "approved" },
        { organization_id: REVIEW_DEMO_IDS.hikingClub, user_id: demo.jordan, role: "member", org_role: "member", membership_kind: "member", status: "approved" },
        { organization_id: REVIEW_DEMO_IDS.greekOrg, user_id: demo.priya, role: "manager", org_role: "owner", membership_kind: "member", status: "approved" },
        { organization_id: REVIEW_DEMO_IDS.greekOrg, user_id: demo.maya, role: "member", org_role: "member", membership_kind: "member", status: "approved" },
      ],
      { onConflict: "organization_id,user_id" },
    ),
    "organization member upsert",
  );

  must(
    await admin.from("campus_events").upsert(
      REVIEW_DEMO_EVENTS.map((event, index) => {
        const startsAt = nowMs + event.startOffsetMs;
        const createdBy = event.host.kind === "org" ? demo[event.host.createdBy] : demo[event.host.userKey];
        return {
          id: REVIEW_DEMO_IDS.events[index],
          title: event.title,
          description: event.description,
          category: event.category,
          location_name: event.locationName,
          starts_at: iso(startsAt),
          ends_at: iso(startsAt + event.durationMs),
          created_by: createdBy,
          host_type: event.host.kind === "org" ? "organization" : "user",
          host_organization_id: event.host.kind === "org" ? event.host.orgId : null,
          host_user_id: event.host.kind === "user" ? createdBy : null,
          school_name: schoolName,
          school_domain: schoolDomain,
          is_cancelled: false,
          is_review_demo: true,
        };
      }),
      { onConflict: "id" },
    ),
    "event upsert",
  );

  must(
    await admin.from("quad_posts").upsert(
      REVIEW_DEMO_POSTS.map((post, index) => ({
        id: REVIEW_DEMO_IDS.posts[index],
        user_id: demo[post.userKey],
        body: post.body,
        visibility: "public",
        feed_destination: "campus",
        posted_as_type: "personal",
        media_type: "none",
        created_at: iso(nowMs - post.ageMs),
        is_review_demo: true,
      })),
      { onConflict: "id" },
    ),
    "post upsert",
  );

  // Social graph is additive. Do not unblock, delete connections, wipe DMs, or
  // recreate notifications the reviewer already saw or acted on.
  const existingConnections = [
    ...((must(
      await admin
        .from("student_connections")
        .select("id, requester_id, addressee_id, status")
        .in("requester_id", demoIds),
      "connection lookup",
    ) as ReviewDemoConnectionRow[] | null) ?? []),
    ...((must(
      await admin
        .from("student_connections")
        .select("id, requester_id, addressee_id, status")
        .in("addressee_id", demoIds),
      "connection lookup",
    ) as ReviewDemoConnectionRow[] | null) ?? []),
  ];
  const connectionsToInsert = missingReviewDemoConnections({
    existing: existingConnections,
    demo: { jordan: demo.jordan, priya: demo.priya },
    reviewerUserId,
  }).map((row) => ({
    ...row,
    responded_at: row.status === "accepted" ? iso(nowMs - 24 * HOUR) : null,
  }));
  const insertedConnections = (
    connectionsToInsert.length > 0
      ? ((must(
          await admin.from("student_connections").insert(connectionsToInsert).select("id, requester_id, addressee_id, status"),
          "connection insert",
        ) as ReviewDemoConnectionRow[] | null) ?? [])
      : []
  );
  const allConnections = [...existingConnections, ...insertedConnections];
  const pendingPriya = allConnections.find(
    (row) =>
      row.requester_id === demo.priya &&
      row.addressee_id === reviewerUserId &&
      row.status === "pending",
  );
  const acceptedJordan = allConnections.find(
    (row) =>
      ((row.requester_id === demo.jordan && row.addressee_id === reviewerUserId) ||
        (row.requester_id === reviewerUserId && row.addressee_id === demo.jordan)) &&
      row.status === "accepted",
  );

  const conversation = must(
    await admin
      .from("direct_conversations")
      .upsert(
        { direct_key: directKeyFor(demo.jordan, reviewerUserId), created_by: demo.jordan, type: "direct" },
        { onConflict: "direct_key" },
      )
      .select("id")
      .single(),
    "conversation upsert",
  ) as { id: string };
  const existingParticipants = ((must(
    await admin.from("direct_conversation_participants").select("user_id").eq("conversation_id", conversation.id),
    "participant lookup",
  ) as { user_id: string }[] | null) ?? []).map((row) => row.user_id);
  const participantsToInsert = [
    { conversation_id: conversation.id, user_id: demo.jordan, last_read_at: iso(nowMs), hidden_at: null },
    { conversation_id: conversation.id, user_id: reviewerUserId, last_read_at: null, hidden_at: null },
  ].filter((row) => !existingParticipants.includes(row.user_id));
  if (participantsToInsert.length > 0) {
    must(await admin.from("direct_conversation_participants").insert(participantsToInsert), "participant insert");
  }
  const messageCountResult = await admin
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id);
  if (messageCountResult.error) throw new Error(`review demo message count failed: ${messageCountResult.error.message}`);
  let messagesInserted = 0;
  if (shouldInsertSeedMessages(messageCountResult.count ?? 0)) {
    must(
      await admin.from("direct_messages").insert(
        REVIEW_DEMO_DM_MESSAGES.map((message) => ({
          conversation_id: conversation.id,
          sender_id: message.fromDemo ? demo.jordan : reviewerUserId,
          recipient_id: message.fromDemo ? reviewerUserId : demo.jordan,
          content: message.content,
          type: "text",
          metadata: { review_demo: true },
          created_at: iso(nowMs - message.ageMs),
        })),
      ),
      "message insert",
    );
    messagesInserted = REVIEW_DEMO_DM_MESSAGES.length;
  }

  const existingNotifications = ((must(
    await admin.from("notifications").select("type, actor_id").eq("user_id", reviewerUserId).in("actor_id", demoIds),
    "notification lookup",
  ) as { type: string; actor_id: string | null }[] | null) ?? []);
  const plannedNotifications = [
    pendingPriya
      ? {
          user_id: reviewerUserId,
          type: "friend_request",
          title: "New follow request",
          body: "cqdemo_priya sent you a follow request (demo)",
          related_entity_type: "connection_request",
          related_entity_id: pendingPriya.id ?? null,
          friend_request_id: pendingPriya.id ?? null,
          actor_id: demo.priya,
          created_at: iso(nowMs - 15 * MINUTE),
        }
      : null,
    {
      user_id: reviewerUserId,
      type: "direct_message",
      title: "New direct message",
      body: "Jordan T. (Demo): Want to join the Finals Study Jam later?",
      related_entity_type: "conversation",
      related_entity_id: conversation.id,
      actor_id: demo.jordan,
      created_at: iso(nowMs - 35 * MINUTE),
    },
    acceptedJordan
      ? {
          user_id: reviewerUserId,
          type: "connection_accepted",
          title: "Follow request accepted",
          body: "cqdemo_jordan accepted your follow request (demo)",
          related_entity_type: "connection_request",
          related_entity_id: acceptedJordan.id ?? null,
          actor_id: demo.jordan,
          created_at: iso(nowMs - 3 * HOUR),
        }
      : null,
    {
      user_id: reviewerUserId,
      type: "organization_event_announcement",
      title: "[Demo] URI Hiking Club posted an event",
      body: "Sunset Hike Kickoff — tomorrow at The Quad (demo event)",
      related_entity_type: "event",
      related_entity_id: REVIEW_DEMO_IDS.events[2],
      actor_id: demo.maya,
      created_at: iso(nowMs - 6 * HOUR),
    },
    {
      user_id: reviewerUserId,
      type: "event_rsvp_reminder",
      title: "Starting soon",
      body: "[Demo] Finals Study Jam starts in 3 hours at Carothers Library",
      related_entity_type: "event",
      related_entity_id: REVIEW_DEMO_IDS.events[1],
      actor_id: demo.maya,
      created_at: iso(nowMs - 10 * MINUTE),
    },
  ].filter((row): row is NonNullable<typeof row> => row !== null);
  const notificationsToInsert = missingReviewDemoNotifications(existingNotifications, plannedNotifications);
  if (notificationsToInsert.length > 0) {
    must(await admin.from("notifications").insert(notificationsToInsert), "notification insert");
  }

  return {
    profiles: demoIds.length,
    posts: REVIEW_DEMO_POSTS.length,
    events: REVIEW_DEMO_EVENTS.length,
    organizations: 2,
    notifications: notificationsToInsert.length,
    messages: messagesInserted,
  };
}

/**
 * Remove all demo content and the fictional auth users. Rows that reference
 * demo users/content cascade on delete (reports keep a nulled reference).
 */
export async function removeReviewDemoContent(admin: Admin): Promise<{ removedProfiles: number }> {
  const existing = must(
    await admin
      .from("profiles")
      .select("id, username")
      .eq("is_review_demo", true)
      .in(
        "username",
        REVIEW_DEMO_PROFILES.map((profile) => profile.username),
      ),
    "profile lookup",
  ) as { id: string }[] | null;
  const demoIds = (existing ?? []).map((row) => row.id);

  // notifications.actor_id is ON DELETE SET NULL, so demo notifications must go first.
  const conversations = demoIds.length
    ? ((must(
        await admin.from("direct_conversations").select("id").in("created_by", demoIds),
        "conversation lookup",
      ) as { id: string }[] | null) ?? [])
    : [];
  const relatedIds = [
    ...REVIEW_DEMO_IDS.events,
    REVIEW_DEMO_IDS.hikingClub,
    REVIEW_DEMO_IDS.greekOrg,
    ...conversations.map((row) => row.id),
  ];
  if (demoIds.length) {
    must(await admin.from("notifications").delete().in("actor_id", demoIds), "notification delete");
  }
  must(await admin.from("notifications").delete().in("related_entity_id", relatedIds), "notification delete");

  must(await admin.from("quad_posts").delete().in("id", [...REVIEW_DEMO_IDS.posts]), "post delete");
  must(await admin.from("campus_events").delete().in("id", [...REVIEW_DEMO_IDS.events]), "event delete");
  must(
    await admin.from("student_organizations").delete().in("id", [REVIEW_DEMO_IDS.hikingClub, REVIEW_DEMO_IDS.greekOrg]),
    "organization delete",
  );
  for (const demoId of demoIds) {
    const { error } = await admin.auth.admin.deleteUser(demoId);
    if (error) throw new Error(`review demo deleteUser failed: ${error.message}`);
  }
  return { removedProfiles: demoIds.length };
}
