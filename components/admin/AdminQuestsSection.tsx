"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiRequestError, deleteAuthed, fetchAuthed, patchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import type { AdminQuestLinkedQr, AdminQuestRow, AdminQuestVisibility } from "@/lib/adminQuestTypes";
import { DURATION_PRESETS } from "@/lib/adminQuestTypes";
import { BUILTIN_QUEST_TEMPLATES, type QuestTemplateDef } from "@/lib/questTemplates";
import { AdminSectionIntro } from "@/components/admin/AdminUi";
import { CampusLocationFields } from "@/components/admin/CampusLocationFields";
import { QuestQrImageField } from "@/components/admin/QuestQrImageField";
import { uploadQrCodeImage } from "@/lib/client/qrCodeAdminClient";
import {
  campusLocationFormFromRow,
  campusLocationFormToPayload,
  defaultCampusLocationForTemplate,
  EMPTY_CAMPUS_LOCATION_FORM,
  type CampusLocationFormState,
} from "@/lib/campusLocations";

type QuestWithAnalytics = {
  quest: AdminQuestRow;
  linkedQr: AdminQuestLinkedQr | null;
  analytics: {
    totalCompletions: number;
    uniqueUsers: number;
    totalXpAwarded: number;
    completionRate: number;
    activeProgressCount: number;
    qrScans: number;
  };
};

type QuestFormState = {
  name: string;
  description: string;
  xpReward: number;
  difficulty: AdminQuestRow["difficulty"];
  questType: AdminQuestRow["quest_type"];
  campusLocation: CampusLocationFormState;
  requiresQr: boolean;
  completionMethod: AdminQuestRow["completion_method"];
  visibilityStatus: AdminQuestVisibility;
  startsAt: string;
  endsAt: string;
  durationPreset: string;
  repeatType: AdminQuestRow["repeat_type"];
  repeatLimit: AdminQuestRow["repeat_limit"];
  isRepeatable: boolean;
  icon: string;
};

const EMPTY_FORM: QuestFormState = {
  name: "",
  description: "",
  xpReward: 50,
  difficulty: "easy",
  questType: "one_time",
  campusLocation: { ...EMPTY_CAMPUS_LOCATION_FORM },
  requiresQr: false,
  completionMethod: "manual_log",
  visibilityStatus: "draft",
  startsAt: "",
  endsAt: "",
  durationPreset: "1440",
  repeatType: "one_time",
  repeatLimit: "once_per_user",
  isRepeatable: false,
  icon: "🎯",
};

function questStatusLabel(quest: AdminQuestRow): string {
  if (quest.deleted_at || quest.visibility_status === "deleted") return "Deleted";
  if (quest.visibility_status === "draft") return "Draft";
  if (quest.visibility_status === "hidden") return "Inactive";
  if (quest.ends_at && new Date(quest.ends_at) <= new Date()) return "Expired";
  if (quest.visibility_status === "active") return "Active";
  return quest.visibility_status;
}

function formFromTemplate(t: QuestTemplateDef): QuestFormState {
  return {
    name: t.name,
    description: t.description,
    xpReward: t.defaultXp,
    difficulty: t.defaultDifficulty,
    questType: t.defaultQuestType,
    campusLocation: defaultCampusLocationForTemplate({
      defaultMapEnabled: t.defaultMapEnabled,
      defaultLocationKey: t.defaultLocationKey,
      templateName: t.name,
    }),
    requiresQr: t.defaultRequiresQr,
    completionMethod: t.defaultCompletionMethod,
    visibilityStatus: "draft",
    startsAt: "",
    endsAt: "",
    durationPreset: t.defaultDurationMinutes ? String(t.defaultDurationMinutes) : "1440",
    repeatType: t.defaultRepeatType,
    repeatLimit: t.defaultRepeatLimit,
    isRepeatable: t.defaultRepeatType !== "one_time",
    icon: t.defaultIcon,
  };
}

function formNeedsQr(form: QuestFormState): boolean {
  return form.requiresQr || form.questType === "qr" || form.completionMethod === "qr_scan";
}

function formToPayload(form: QuestFormState, options?: { clearLocationWhenEmpty?: boolean }) {
  const preset = DURATION_PRESETS.find((p) => p.id === form.durationPreset);
  const activeDurationMinutes = preset?.minutes ?? undefined;
  const startsAt = form.startsAt ? new Date(form.startsAt).toISOString() : undefined;
  let endsAt = form.endsAt ? new Date(form.endsAt).toISOString() : undefined;
  if (!endsAt && startsAt && activeDurationMinutes) {
    endsAt = new Date(new Date(startsAt).getTime() + activeDurationMinutes * 60_000).toISOString();
  }
  return {
    name: form.name,
    description: form.description,
    xpReward: form.xpReward,
    difficulty: form.difficulty,
    questType: form.questType,
    ...campusLocationFormToPayload(form.campusLocation, {
      clearWhenEmpty: options?.clearLocationWhenEmpty,
    }),
    requiresQr: form.requiresQr,
    completionMethod: form.completionMethod,
    visibilityStatus: form.visibilityStatus,
    startsAt,
    endsAt,
    activeDurationMinutes,
    repeatType: form.repeatType,
    repeatLimit: form.repeatLimit,
    isRepeatable: form.isRepeatable,
    icon: form.icon || undefined,
  };
}

export function AdminQuestsSection() {
  const [quests, setQuests] = useState<QuestWithAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<QuestFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<AdminQuestRow | null>(null);
  const [lastQrUrl, setLastQrUrl] = useState<string | null>(null);
  const [linkedQr, setLinkedQr] = useState<AdminQuestLinkedQr | null>(null);
  const [pendingQrFile, setPendingQrFile] = useState<File | null>(null);

  const loadQuests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthed<{ quests: QuestWithAnalytics[] }>("/api/internal/admin/quests");
      setQuests(data.quests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load quests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuests();
    const interval = window.setInterval(() => void loadQuests(), 45_000);
    return () => window.clearInterval(interval);
  }, [loadQuests]);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return BUILTIN_QUEST_TEMPLATES;
    return BUILTIN_QUEST_TEMPLATES.filter(
      (t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
    );
  }, [templateSearch]);

  function openCreateBlank() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setLastQrUrl(null);
    setLinkedQr(null);
    setPendingQrFile(null);
    setTemplatePickerOpen(false);
    setBuilderOpen(true);
  }

  function openEdit(quest: AdminQuestRow, questLinkedQr: AdminQuestLinkedQr | null = null) {
    setEditingId(quest.id);
    setLinkedQr(questLinkedQr);
    setPendingQrFile(null);
    setForm({
      name: quest.name,
      description: quest.description,
      xpReward: quest.xp_reward,
      difficulty: quest.difficulty,
      questType: quest.quest_type,
      campusLocation: campusLocationFormFromRow({
        location_key: quest.location_key,
        location_name: quest.location_name,
        location_address: quest.location_address,
        location_lat: quest.location_lat,
        location_lng: quest.location_lng,
      }),
      requiresQr: quest.requires_qr,
      completionMethod: quest.completion_method,
      visibilityStatus: quest.visibility_status === "deleted" ? "draft" : quest.visibility_status,
      startsAt: quest.starts_at ? quest.starts_at.slice(0, 16) : "",
      endsAt: quest.ends_at ? quest.ends_at.slice(0, 16) : "",
      durationPreset: quest.active_duration_minutes ? String(quest.active_duration_minutes) : "custom",
      repeatType: quest.repeat_type,
      repeatLimit: quest.repeat_limit,
      isRepeatable: quest.is_repeatable,
      icon: quest.icon ?? "🎯",
    });
    setBuilderOpen(true);
  }

  function locationLabelFromForm(campusLocation: CampusLocationFormState): string | null {
  if (!campusLocation.locationKey) return null;
  const label = campusLocation.locationName.trim();
  return label || null;
}

function linkedQrFromApiResult(result: {
  linkedQr?: AdminQuestLinkedQr | null;
  qr?: { qrCodeId: string; scanUrl: string; code?: string } | null;
}): AdminQuestLinkedQr | null {
  if (result.linkedQr) return result.linkedQr;
  if (!result.qr) return null;
  return {
    id: result.qr.qrCodeId,
    code: result.qr.code ?? "",
    image_url: null,
    qr_png_url: null,
    metadata: { scan_url: result.qr.scanUrl },
  };
}

async function saveQuest() {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = formToPayload(form, { clearLocationWhenEmpty: Boolean(editingId) });
      if (editingId) {
        const result = await patchAuthed<
          {
            quest: AdminQuestRow;
            linkedQr?: AdminQuestLinkedQr | null;
            qr: { qrCodeId: string; scanUrl: string; code?: string } | null;
            qrError?: string | null;
          },
          Record<string, unknown>
        >(`/api/internal/admin/quests?questId=${editingId}`, payload);
        const qrId = result.qr?.qrCodeId ?? result.quest.qr_code_id;
        if (pendingQrFile && qrId) {
          const imageUrl = await uploadQrCodeImage(qrId, pendingQrFile);
          const base = linkedQrFromApiResult(result);
          setLinkedQr(
            base && base.id === qrId
              ? { ...base, image_url: imageUrl }
              : { id: qrId, code: base?.code ?? linkedQr?.code ?? "", image_url: imageUrl, qr_png_url: base?.qr_png_url ?? null, metadata: base?.metadata ?? linkedQr?.metadata ?? null },
          );
          setPendingQrFile(null);
        } else {
          const nextLinked = linkedQrFromApiResult(result);
          if (nextLinked) setLinkedQr(nextLinked);
        }
        if (result.qrError) {
          setError(`Quest updated, but QR code failed: ${result.qrError}`);
        } else {
          setSuccess("Quest updated.");
        }
      } else {
        const result = await postAuthed<
          {
            quest: AdminQuestRow;
            qr: { qrCodeId: string; scanUrl: string; code?: string } | null;
            qrError?: string | null;
          },
          Record<string, unknown>
        >("/api/internal/admin/quests", payload);
        const qrId = result.qr?.qrCodeId ?? result.quest.qr_code_id;
        if (pendingQrFile && qrId) {
          await uploadQrCodeImage(qrId, pendingQrFile);
          setPendingQrFile(null);
        }
        setLastQrUrl(result.qr?.scanUrl ?? null);
        if (result.qrError) {
          setError(`Quest created, but QR code failed: ${result.qrError}`);
        } else {
          setSuccess("Quest created.");
        }
      }
      setBuilderOpen(false);
      await loadQuests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save quest.");
    } finally {
      setSubmitting(false);
    }
  }

  async function generateQuestQr() {
    if (!editingId) throw new Error("Save the quest before generating a QR code.");
    setSubmitting(true);
    setError(null);
    try {
      const result = await postAuthed<
        {
          quest: AdminQuestRow;
          linkedQr?: AdminQuestLinkedQr | null;
          qr: { qrCodeId: string; scanUrl: string; code?: string } | null;
          qrError?: string | null;
        },
        Record<string, unknown>
      >(`/api/internal/admin/quests?action=generate-qr&questId=${editingId}`, {});
      const nextLinked = linkedQrFromApiResult(result);
      if (nextLinked) setLinkedQr(nextLinked);
      if (result.qrError) {
        setError(`QR generation failed: ${result.qrError}`);
      } else {
        setSuccess("QR code generated.");
      }
      await loadQuests();
    } finally {
      setSubmitting(false);
    }
  }

  async function setVisibility(questId: string, visibilityStatus: AdminQuestVisibility) {
    setSubmitting(true);
    setError(null);
    try {
      await patchAuthed(`/api/internal/admin/quests?questId=${questId}&action=visibility`, { visibilityStatus });
      setSuccess(visibilityStatus === "active" ? "Quest activated." : "Quest deactivated.");
      await loadQuests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update quest.");
    } finally {
      setSubmitting(false);
    }
  }

  async function duplicateQuest(questId: string) {
    setSubmitting(true);
    try {
      await postAuthed(`/api/internal/admin/quests?action=duplicate&questId=${questId}`, {});
      setSuccess("Quest duplicated.");
      await loadQuests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not duplicate quest.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete(hardDelete: boolean) {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await deleteAuthed(`/api/internal/admin/quests?questId=${deleteTarget.id}${hardDelete ? "&hardDelete=1" : ""}`);
      setDeleteTarget(null);
      setSuccess("Quest deleted.");
      await loadQuests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete quest.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminSectionIntro
        title="Quest Management"
        description="Create, activate, and manage campus quests. Active quests appear on every user's Quest Board instantly."
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={openCreateBlank} className="rounded-lg bg-uri-keaney px-4 py-2 text-sm font-semibold text-white">
          + Create from scratch
        </button>
        <button
          type="button"
          onClick={() => setTemplatePickerOpen(true)}
          className="rounded-lg border border-uri-keaney/40 px-4 py-2 text-sm font-semibold text-uri-keaney"
        >
          + Use template
        </button>
        <button type="button" onClick={() => void loadQuests()} className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80">
          Refresh
        </button>
      </div>

      {error ? <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{success}</div> : null}
      {lastQrUrl ? (
        <div className="rounded-lg border border-uri-keaney/30 bg-uri-keaney/10 px-3 py-2 text-xs text-uri-keaney">
          QR scan URL: <a href={lastQrUrl} className="underline">{lastQrUrl}</a>
        </div>
      ) : null}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-white/[0.03] text-white/50">
              <tr>
                <th className="px-3 py-2 font-semibold">Quest</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">XP</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Repeat</th>
                <th className="px-3 py-2 font-semibold">Completions</th>
                <th className="px-3 py-2 font-semibold">Dates</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-white/50">Loading quests…</td>
                </tr>
              ) : quests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-white/50">No quests yet. Create one to get started.</td>
                </tr>
              ) : (
                quests.map(({ quest, linkedQr: rowLinkedQr, analytics }) => (
                  <tr key={quest.id} className="border-b border-white/[0.06] text-white/85">
                    <td className="px-3 py-3">
                      <p className="font-semibold">{quest.icon} {quest.name}</p>
                      <p className="text-[10px] text-white/45">{quest.difficulty}</p>
                    </td>
                    <td className="px-3 py-3">{questStatusLabel(quest)}</td>
                    <td className="px-3 py-3">{quest.xp_reward}</td>
                    <td className="px-3 py-3">{quest.quest_type}</td>
                    <td className="px-3 py-3">{quest.repeat_type}</td>
                    <td className="px-3 py-3">
                      <p>{analytics.totalCompletions} total</p>
                      <p className="text-[10px] text-white/45">{analytics.uniqueUsers} users · {analytics.totalXpAwarded} XP</p>
                    </td>
                    <td className="px-3 py-3 text-[10px] text-white/50">
                      {quest.starts_at ? new Date(quest.starts_at).toLocaleString() : "—"}
                      <br />
                      {quest.ends_at ? new Date(quest.ends_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {quest.visibility_status !== "active" ? (
                          <button type="button" disabled={submitting} onClick={() => void setVisibility(quest.id, "active")} className="rounded border border-emerald-400/30 px-2 py-1 text-[10px] text-emerald-200">Activate</button>
                        ) : (
                          <button type="button" disabled={submitting} onClick={() => void setVisibility(quest.id, "hidden")} className="rounded border border-white/20 px-2 py-1 text-[10px]">Deactivate</button>
                        )}
                        <button type="button" onClick={() => openEdit(quest, rowLinkedQr)} className="rounded border border-white/20 px-2 py-1 text-[10px]">Edit</button>
                        <button type="button" disabled={submitting} onClick={() => void duplicateQuest(quest.id)} className="rounded border border-white/20 px-2 py-1 text-[10px]">Duplicate</button>
                        <button type="button" onClick={() => setDeleteTarget(quest)} className="rounded border border-rose-400/30 px-2 py-1 text-[10px] text-rose-200">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {templatePickerOpen ? (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#121212]">
            <div className="border-b border-white/10 px-4 py-3">
              <h3 className="font-semibold text-white">Choose a template</h3>
              <input
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="Search templates…"
                className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="grid max-h-[60vh] gap-2 overflow-y-auto p-4 sm:grid-cols-2">
              {filteredTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setForm(formFromTemplate(t));
                    setLinkedQr(null);
                    setPendingQrFile(null);
                    setTemplatePickerOpen(false);
                    setBuilderOpen(true);
                  }}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left hover:border-uri-keaney/40"
                >
                  <p className="text-lg">{t.categoryIcon}</p>
                  <p className="font-semibold text-white">{t.name}</p>
                  <p className="mt-1 text-[11px] text-white/50">{t.description}</p>
                  <p className="mt-2 text-[10px] text-uri-gold">+{t.defaultXp} XP · {t.defaultDifficulty}</p>
                </button>
              ))}
            </div>
            <div className="border-t border-white/10 p-3">
              <button type="button" onClick={() => setTemplatePickerOpen(false)} className="w-full rounded-lg border border-white/15 py-2 text-sm text-white/80">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {builderOpen ? (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#121212] p-4">
            <h3 className="font-display text-lg font-bold text-white">{editingId ? "Edit quest" : "Create quest"}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2 text-xs text-white/50">
                Quest name
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
              </label>
              <label className="sm:col-span-2 text-xs text-white/50">
                Description
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-white/50">
                XP reward
                <input type="number" min={1} value={form.xpReward} onChange={(e) => setForm((f) => ({ ...f, xpReward: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-white/50">
                Icon
                <input value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-white/50">
                Difficulty
                <select value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as QuestFormState["difficulty"] }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="legendary">Legendary</option>
                </select>
              </label>
              <label className="text-xs text-white/50">
                Quest type
                <select
                  value={form.questType}
                  onChange={(e) => {
                    const questType = e.target.value as QuestFormState["questType"];
                    setForm((f) => ({
                      ...f,
                      questType,
                      ...(questType === "qr"
                        ? { requiresQr: true, completionMethod: "qr_scan" as const }
                        : {}),
                    }));
                  }}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                >
                  <option value="daily">Daily</option>
                  <option value="one_time">One-time</option>
                  <option value="event">Event</option>
                  <option value="location">Location-based</option>
                  <option value="qr">QR-required</option>
                </select>
              </label>
              <label className="text-xs text-white/50">
                Completion method
                <select
                  value={form.completionMethod}
                  onChange={(e) => {
                    const completionMethod = e.target.value as QuestFormState["completionMethod"];
                    setForm((f) => ({
                      ...f,
                      completionMethod,
                      ...(completionMethod === "qr_scan" ? { requiresQr: true } : {}),
                    }));
                  }}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                >
                  <option value="manual_log">Manual log</option>
                  <option value="qr_scan">QR scan</option>
                  <option value="location_checkin">Location check-in</option>
                  <option value="admin_approval">Admin approval</option>
                </select>
              </label>
              <label className="text-xs text-white/50">
                Visibility
                <select value={form.visibilityStatus} onChange={(e) => setForm((f) => ({ ...f, visibilityStatus: e.target.value as AdminQuestVisibility }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="hidden">Hidden</option>
                </select>
              </label>
              <label className="text-xs text-white/50">
                Repeat type
                <select value={form.repeatType} onChange={(e) => setForm((f) => ({ ...f, repeatType: e.target.value as QuestFormState["repeatType"] }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
                  <option value="one_time">One-time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label className="text-xs text-white/50">
                Repeat limit
                <select value={form.repeatLimit} onChange={(e) => setForm((f) => ({ ...f, repeatLimit: e.target.value as QuestFormState["repeatLimit"] }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
                  <option value="once_per_user">Once per user</option>
                  <option value="once_per_day">Once per day</option>
                  <option value="once_per_week">Once per week</option>
                  <option value="unlimited">Unlimited while active</option>
                </select>
              </label>
              <label className="text-xs text-white/50">
                Duration preset
                <select value={form.durationPreset} onChange={(e) => setForm((f) => ({ ...f, durationPreset: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
                  {DURATION_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-white/50">
                Start date/time
                <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
              </label>
              <label className="text-xs text-white/50">
                End date/time
                <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
              </label>
              <CampusLocationFields
                value={form.campusLocation}
                onChange={(campusLocation) => setForm((f) => ({ ...f, campusLocation }))}
                className="sm:col-span-2"
              />
              <label className="flex items-center gap-2 text-xs text-white/70 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.requiresQr}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      requiresQr: e.target.checked,
                      completionMethod: e.target.checked ? "qr_scan" : f.completionMethod,
                      questType: e.target.checked && f.questType !== "qr" ? "qr" : f.questType,
                    }))
                  }
                />
                Requires QR code
              </label>
              {formNeedsQr(form) ? (
                <QuestQrImageField
                  linkedQr={linkedQr}
                  questName={form.name}
                  xpReward={form.xpReward}
                  locationName={locationLabelFromForm(form.campusLocation)}
                  editingQuestId={editingId}
                  pendingFile={pendingQrFile}
                  onPendingFileChange={setPendingQrFile}
                  onLinkedQrChange={setLinkedQr}
                  onGenerateQr={generateQuestQr}
                  onError={setError}
                  disabled={submitting}
                />
              ) : null}
              <label className="flex items-center gap-2 text-xs text-white/70 sm:col-span-2">
                <input type="checkbox" checked={form.isRepeatable} onChange={(e) => setForm((f) => ({ ...f, isRepeatable: e.target.checked }))} />
                Repeatable
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setBuilderOpen(false)} className="flex-1 rounded-lg border border-white/15 py-2 text-sm text-white/80">Cancel</button>
              <button type="button" disabled={submitting || !form.name.trim() || !form.description.trim()} onClick={() => void saveQuest()} className="flex-1 rounded-lg bg-uri-keaney py-2 text-sm font-semibold text-white disabled:opacity-50">
                {submitting ? "Saving…" : "Save quest"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#121212] p-5">
            <h3 className="font-semibold text-white">Delete quest?</h3>
            <p className="mt-2 text-sm text-white/60">Are you sure you want to permanently delete &quot;{deleteTarget.name}&quot;? Completion history will be preserved.</p>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" disabled={submitting} onClick={() => void confirmDelete(false)} className="rounded-lg border border-rose-400/30 py-2 text-sm text-rose-200">Soft delete (recommended)</button>
              <button type="button" disabled={submitting} onClick={() => void confirmDelete(true)} className="rounded-lg border border-rose-500/50 py-2 text-sm text-rose-300">Hard delete</button>
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-white/15 py-2 text-sm text-white/70">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
