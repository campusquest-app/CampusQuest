import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Sync orchestration regression tests with mocked upstream + admin client.
 * Focus: preserve stored events on upstream failure; import on success.
 */

type EventRow = {
  external_id: string;
  is_active: boolean;
  title: string;
  starts_at: string | null;
};

function createMemoryAdmin(seed: EventRow[]) {
  const events = new Map(seed.map((row) => [row.external_id, { ...row }]));
  const logs: Array<Record<string, unknown>> = [];

  function from(table: string) {
    if (table === "sync_logs") {
      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              const id = `log-${logs.length + 1}`;
              logs.push({ id, ...row });
              return { data: { id }, error: null };
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (col: string, id: string) => {
            const log = logs.find((l) => l.id === id);
            if (log && col === "id") Object.assign(log, patch);
            return { data: null, error: null };
          },
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    }

    if (table === "external_events") {
      return {
        select: (_cols: string) => ({
          eq: (_col: string, value: string) => ({
            maybeSingle: async () => {
              const row = events.get(value);
              return { data: row ? { id: row.external_id } : null, error: null };
            },
            eq: (_col2: string, active: boolean) => ({
              then: undefined,
              // used by soft-deactivate path: select external_id where source + is_active
              // emulate thenable via custom await through returning promise-like
            }),
          }),
        }),
        upsert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              const externalId = String(row.external_id);
              const existing = events.has(externalId);
              events.set(externalId, {
                external_id: externalId,
                is_active: Boolean(row.is_active),
                title: String(row.title ?? ""),
                starts_at: (row.starts_at as string | null) ?? null,
              });
              return { data: { id: externalId }, error: null, existing };
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (col: string, value: string) => {
            if (col === "external_id") {
              const row = events.get(value);
              if (row) Object.assign(row, patch);
            }
            return { data: null, error: null };
          },
          in: async (col: string, values: string[]) => {
            if (col === "external_id") {
              for (const id of values) {
                const row = events.get(id);
                if (row) Object.assign(row, patch);
              }
            }
            return { data: null, error: null };
          },
        }),
      };
    }

    if (table === "external_organizations") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            eq: () => ({
              /* soft deactivate select */
            }),
          }),
        }),
        upsert: async () => ({ error: null }),
        update: () => ({
          in: async () => ({ data: null, error: null }),
        }),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  }

  return {
    from,
    _events: events,
    _logs: logs,
    listActiveExternalIds: () =>
      Array.from(events.values())
        .filter((e) => e.is_active)
        .map((e) => e.external_id),
  };
}

function storedEventsSelectResult(admin: ReturnType<typeof createMemoryAdmin>) {
  const result = Promise.resolve({
    data: Array.from(admin._events.values()).map((row) => ({
      external_id: row.external_id,
      starts_at: row.starts_at,
      is_active: row.is_active,
    })),
    error: null,
  });
  const thenableEq = () => ({
    eq: thenableEq,
    then: result.then.bind(result),
  });
  return { eq: thenableEq };
}

describe("URInvolved sync preservation behavior (unit)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/server/supabase");
    vi.doUnmock("@/lib/server/urinvolved/fetchSources");
    vi.doUnmock("@/lib/server/campusLocationsDb");
    vi.doUnmock("@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement");
    vi.doUnmock("next/cache");
  });

  it("preserves existing active events when discovery fetch fails", async () => {
    const admin = createMemoryAdmin([
      {
        external_id: "keep-me",
        is_active: true,
        title: "Already Synced Fair",
        starts_at: "2026-09-08T14:00:00.000Z",
      },
    ]);

    // Patch soft-deactivate path to read active ids from memory map
    const originalFrom = admin.from.bind(admin);
    admin.from = ((table: string) => {
      const builder = originalFrom(table);
      if (table === "external_events") {
        return {
          ...builder,
          select: (cols: string) => {
            if (cols.includes("starts_at") || cols.includes("is_active")) {
              return storedEventsSelectResult(admin);
            }
            return builder.select(cols);
          },
          upsert: builder.upsert,
          update: builder.update,
        };
      }
      return builder;
    }) as typeof admin.from;

    vi.doMock("@/lib/server/supabase", () => ({
      createAdminClient: () => admin,
    }));
    vi.doMock("@/lib/server/urinvolved/fetchSources", () => ({
      URINVOLVED_AUTHORITATIVE_EVENTS_SOURCE: "discovery_search",
      fetchUpcomingUrinvolvedDiscoveryEvents: async () => {
        throw new Error("URInvolved events discovery search failed (503).");
      },
      fetchAllUrinvolvedOrganizations: async () => [],
      fetchUrinvolvedEventDetail: async () => null,
      buildOrganizationLogoUrl: () => null,
      buildOrganizationUrl: () => "https://urinvolved.uri.edu/organization/x",
      stripHtmlToText: (html: string | null) => html ?? "",
    }));
    vi.doMock("@/lib/server/campusLocationsDb", () => ({
      getCampusLocations: async () => [],
    }));
    vi.doMock("@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement", () => ({
      resolveAndUpsertEventMapPlacement: async () => null,
    }));
    vi.doMock("next/cache", () => ({
      revalidatePath: () => undefined,
    }));

    const { runUrinvolvedSync } = await import("@/lib/server/urinvolved/sync");
    const result = await runUrinvolvedSync("api");

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => /503|discovery/i.test(e))).toBe(true);
    expect(admin.listActiveExternalIds()).toContain("keep-me");
  });

  it("imports discovery events on successful sync", async () => {
    const admin = createMemoryAdmin([]);
    const originalFrom = admin.from.bind(admin);
    admin.from = ((table: string) => {
      const builder = originalFrom(table);
      if (table === "external_events") {
        return {
          ...builder,
          select: (cols: string) => {
            if (cols.includes("external_id") && cols.includes("title")) {
              // logical duplicate query
              return {
                eq: () => ({
                  eq: () => ({
                    gte: () => ({
                      lte: async () => ({ data: [], error: null }),
                    }),
                  }),
                }),
              };
            }
            if (cols.includes("starts_at") || cols.includes("is_active")) {
              return storedEventsSelectResult(admin);
            }
            return {
              eq: (_c: string, value: string) => ({
                maybeSingle: async () => {
                  const row = admin._events.get(value);
                  return { data: row ? { id: row.external_id } : null, error: null };
                },
              }),
            };
          },
          upsert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const externalId = String(row.external_id);
                admin._events.set(externalId, {
                  external_id: externalId,
                  is_active: Boolean(row.is_active),
                  title: String(row.title ?? ""),
                  starts_at: (row.starts_at as string | null) ?? null,
                });
                return { data: { id: externalId }, error: null };
              },
            }),
          }),
          update: builder.update,
        };
      }
      if (table === "external_organizations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              eq: async () => ({ data: [], error: null }),
            }),
          }),
          upsert: async () => ({ error: null }),
          update: () => ({
            in: async () => ({ data: null, error: null }),
          }),
        };
      }
      return builder;
    }) as typeof admin.from;

    vi.doMock("@/lib/server/supabase", () => ({
      createAdminClient: () => admin,
    }));
    vi.doMock("@/lib/server/urinvolved/fetchSources", () => ({
      URINVOLVED_AUTHORITATIVE_EVENTS_SOURCE: "discovery_search",
      fetchUpcomingUrinvolvedDiscoveryEvents: async () => ({
        raw: [
          {
            id: "12487762",
            name: "Resource Fair",
            description: "<p>Stop by</p>",
            location: "Memorial Union",
            startsOn: "2026-09-08T14:00:00+00:00",
            endsOn: "2026-09-08T16:00:00+00:00",
            organizationName: "MAVE",
            categoryNames: ["New Students"],
            status: "Approved",
          },
        ],
        httpStatus: 200,
        totalCount: 1,
      }),
      fetchAllUrinvolvedOrganizations: async () => [],
      fetchUrinvolvedEventDetail: async () => null,
      buildOrganizationLogoUrl: () => null,
      buildOrganizationUrl: () => "https://urinvolved.uri.edu/organization/x",
      stripHtmlToText: (html: string | null) => (html ?? "").replace(/<[^>]+>/g, " ").trim(),
    }));
    vi.doMock("@/lib/server/campusLocationsDb", () => ({
      getCampusLocations: async () => [],
    }));
    vi.doMock("@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement", () => ({
      resolveAndUpsertEventMapPlacement: async () => null,
    }));
    vi.doMock("next/cache", () => ({
      revalidatePath: () => undefined,
    }));

    const { runUrinvolvedSync } = await import("@/lib/server/urinvolved/sync");
    const result = await runUrinvolvedSync("manual");

    expect(result.success).toBe(true);
    expect(result.events_fetched).toBe(1);
    expect(result.events_created + result.events_updated).toBe(1);
    expect(admin.listActiveExternalIds()).toContain("12487762");
  });

  it("does not deactivate existing events when upstream returns an empty catalog", async () => {
    const admin = createMemoryAdmin([
      {
        external_id: "keep-me",
        is_active: true,
        title: "Already Synced Fair",
        starts_at: "2026-09-08T14:00:00.000Z",
      },
    ]);
    const originalFrom = admin.from.bind(admin);
    admin.from = ((table: string) => {
      const builder = originalFrom(table);
      if (table === "external_events") {
        return {
          ...builder,
          select: (cols: string) => {
            if (cols.includes("starts_at") || cols.includes("is_active")) {
              return storedEventsSelectResult(admin);
            }
            return builder.select(cols);
          },
          upsert: builder.upsert,
          update: builder.update,
        };
      }
      return builder;
    }) as typeof admin.from;

    vi.doMock("@/lib/server/supabase", () => ({
      createAdminClient: () => admin,
    }));
    vi.doMock("@/lib/server/urinvolved/fetchSources", () => ({
      URINVOLVED_AUTHORITATIVE_EVENTS_SOURCE: "discovery_search",
      fetchUpcomingUrinvolvedDiscoveryEvents: async () => ({
        raw: [],
        httpStatus: 200,
        totalCount: 0,
      }),
      fetchAllUrinvolvedOrganizations: async () => [],
      fetchUrinvolvedEventDetail: async () => null,
      buildOrganizationLogoUrl: () => null,
      buildOrganizationUrl: () => "https://urinvolved.uri.edu/organization/x",
      stripHtmlToText: (html: string | null) => html ?? "",
    }));
    vi.doMock("@/lib/server/campusLocationsDb", () => ({
      getCampusLocations: async () => [],
    }));
    vi.doMock("@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement", () => ({
      resolveAndUpsertEventMapPlacement: async () => null,
    }));
    vi.doMock("next/cache", () => ({
      revalidatePath: () => undefined,
    }));

    const { runUrinvolvedSync } = await import("@/lib/server/urinvolved/sync");
    const result = await runUrinvolvedSync("cron");

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => /empty upstream catalog/i.test(e))).toBe(true);
    expect(admin.listActiveExternalIds()).toContain("keep-me");
  });

  it("does not deactivate existing events on upstream timeout", async () => {
    const admin = createMemoryAdmin([
      {
        external_id: "keep-me",
        is_active: true,
        title: "Already Synced Fair",
        starts_at: "2026-09-08T14:00:00.000Z",
      },
    ]);
    const originalFrom = admin.from.bind(admin);
    admin.from = ((table: string) => {
      const builder = originalFrom(table);
      if (table === "external_events") {
        return {
          ...builder,
          select: (cols: string) => {
            if (cols.includes("starts_at") || cols.includes("is_active")) {
              return storedEventsSelectResult(admin);
            }
            return builder.select(cols);
          },
          upsert: builder.upsert,
          update: builder.update,
        };
      }
      return builder;
    }) as typeof admin.from;

    vi.doMock("@/lib/server/supabase", () => ({
      createAdminClient: () => admin,
    }));
    vi.doMock("@/lib/server/urinvolved/fetchSources", () => ({
      URINVOLVED_AUTHORITATIVE_EVENTS_SOURCE: "discovery_search",
      fetchUpcomingUrinvolvedDiscoveryEvents: async () => {
        throw new Error("URInvolved events discovery search timed out.");
      },
      fetchAllUrinvolvedOrganizations: async () => [],
      fetchUrinvolvedEventDetail: async () => null,
      buildOrganizationLogoUrl: () => null,
      buildOrganizationUrl: () => "https://urinvolved.uri.edu/organization/x",
      stripHtmlToText: (html: string | null) => html ?? "",
    }));
    vi.doMock("@/lib/server/campusLocationsDb", () => ({
      getCampusLocations: async () => [],
    }));
    vi.doMock("@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement", () => ({
      resolveAndUpsertEventMapPlacement: async () => null,
    }));
    vi.doMock("next/cache", () => ({
      revalidatePath: () => undefined,
    }));

    const { runUrinvolvedSync } = await import("@/lib/server/urinvolved/sync");
    const result = await runUrinvolvedSync("cron");

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => /timed out/i.test(e))).toBe(true);
    expect(admin.listActiveExternalIds()).toContain("keep-me");
  });

  it("does not deactivate existing events on malformed upstream payload", async () => {
    const admin = createMemoryAdmin([
      {
        external_id: "keep-me",
        is_active: true,
        title: "Already Synced Fair",
        starts_at: "2026-09-08T14:00:00.000Z",
      },
    ]);
    const originalFrom = admin.from.bind(admin);
    admin.from = ((table: string) => {
      const builder = originalFrom(table);
      if (table === "external_events") {
        return {
          ...builder,
          select: (cols: string) => {
            if (cols.includes("starts_at") || cols.includes("is_active")) {
              return storedEventsSelectResult(admin);
            }
            return builder.select(cols);
          },
          upsert: builder.upsert,
          update: builder.update,
        };
      }
      return builder;
    }) as typeof admin.from;

    vi.doMock("@/lib/server/supabase", () => ({
      createAdminClient: () => admin,
    }));
    vi.doMock("@/lib/server/urinvolved/fetchSources", () => ({
      URINVOLVED_AUTHORITATIVE_EVENTS_SOURCE: "discovery_search",
      fetchUpcomingUrinvolvedDiscoveryEvents: async () => {
        throw new Error("URInvolved events discovery search returned a malformed payload.");
      },
      fetchAllUrinvolvedOrganizations: async () => [],
      fetchUrinvolvedEventDetail: async () => null,
      buildOrganizationLogoUrl: () => null,
      buildOrganizationUrl: () => "https://urinvolved.uri.edu/organization/x",
      stripHtmlToText: (html: string | null) => html ?? "",
    }));
    vi.doMock("@/lib/server/campusLocationsDb", () => ({
      getCampusLocations: async () => [],
    }));
    vi.doMock("@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement", () => ({
      resolveAndUpsertEventMapPlacement: async () => null,
    }));
    vi.doMock("next/cache", () => ({
      revalidatePath: () => undefined,
    }));

    const { runUrinvolvedSync } = await import("@/lib/server/urinvolved/sync");
    const result = await runUrinvolvedSync("api");

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => /malformed/i.test(e))).toBe(true);
    expect(admin.listActiveExternalIds()).toContain("keep-me");
  });
});
