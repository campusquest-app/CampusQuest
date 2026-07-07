"use client";

import type { QrScannerValidationResult, SigilScannerReward } from "@/components/scanner/sigilRewardTypes";
import type { ActivityXPGainSession } from "@/components/xp/xpGainTypes";
import { buildQrXpSession } from "@/lib/client/buildQrXpSession";
import { ApiRequestError, postAuthed } from "@/lib/client/dashboardApi";
import { logQrScanDebug } from "@/lib/client/qrScanDebug";
import { acquireQrRedeemLock, releaseQrRedeemLock } from "@/lib/client/qrScanLock";
import { normalizeQrCode } from "@/lib/qrCodeExtract";
import {
  QR_SCAN_USER_MESSAGES,
  qrScanBannerFromApiError,
  qrScanBannerFromUnknownError,
} from "@/lib/client/qrScanUserMessages";
import { getActivityById } from "@/lib/activities";
import { recordQrLinkedActivityLog } from "@/lib/store";
import { buildQrScanActivityPayload } from "@/lib/userActivityEventPayload";
import type { Character, StatKey } from "@/lib/types";
import { STAT_LABELS } from "@/lib/types";

export type QrScanApiResponse = {
  scan: {
    title: string;
    xpAwarded: number;
    status?: string;
    type?: string;
    bypassedLimits?: boolean;
    activityId?: string | null;
    activityLabel?: string | null;
    qrCodeId?: string;
    locationName?: string | null;
    statBoost?: { stat: string; statGain: number } | null;
  };
  xpAwarded: number;
  questCompleted?: {
    questId: string;
    questName: string;
    icon: string;
    xpReward: number;
  } | null;
  milestonesUnlocked: string[];
  leveledUp: boolean;
  level: number;
  totalXp: number;
};

export type RedeemCampusQuestQrArgs = {
  code: string;
  character: Character;
  getCharacter: () => Character | null;
  replaceLocalCharacter: (character: Character, opts?: { skipRemoteSync?: boolean }) => void;
};

/**
 * Single client path for Supabase-backed QR redemption (`POST /api/qr/scan`).
 * Used by CQ Scanner and `/?scan=` deep links.
 */
export async function redeemCampusQuestQr(
  args: RedeemCampusQuestQrArgs,
): Promise<QrScannerValidationResult> {
  const normalizedCode = normalizeQrCode(args.code.trim());
  const lock = acquireQrRedeemLock(args.character.id, normalizedCode);
  if (!lock.acquired) {
    logQrScanDebug("scan_ignored_duplicate", {
      code: normalizedCode,
      reason: "redeem_in_flight",
    });
    return { ok: false, banner: QR_SCAN_USER_MESSAGES.alreadyScanned };
  }

  const requestPayload = {
    code: normalizedCode,
    deviceHint:
      typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 100) : undefined,
    idempotencyKey: lock.idempotencyKey,
  };

  logQrScanDebug("redeem_started", {
    code: normalizedCode,
    idempotencyKey: lock.idempotencyKey,
  });

  logQrScanDebug("validation_request", {
    payload: requestPayload,
    extractedCode: normalizedCode,
    activityId: normalizedCode,
    type: "secure_code",
  });

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    releaseQrRedeemLock(args.character.id, normalizedCode);
    return { ok: false, banner: QR_SCAN_USER_MESSAGES.offline };
  }

  const before = args.character;

  try {
    const data = await postAuthed<QrScanApiResponse, typeof requestPayload>("/api/qr/scan", requestPayload);

    logQrScanDebug("redeem_completed", {
      code: normalizedCode,
      xpAwarded: data.xpAwarded,
      status: data.scan.status ?? null,
    });
    logQrScanDebug("reward_xp", {
      code: normalizedCode,
      xpAwarded: data.xpAwarded,
    });

    const xp = Math.max(
      0,
      data.xpAwarded ?? data.scan.xpAwarded ?? 0,
    );
    const afterTotalXP =
      typeof data.totalXp === "number" ? data.totalXp : before.totalXP + xp;
    const activityId = data.scan.activityId ?? "gym";
    const locationName = data.scan.locationName ?? null;
    const qrCodeId = data.scan.qrCodeId;
    const activityPayload = buildQrScanActivityPayload({
      questCompleted: data.questCompleted ?? null,
      locationName,
      qrTitle: data.scan.title,
      totalXpAwarded: xp,
      qrCodeId: qrCodeId ?? normalizedCode,
      questId: data.questCompleted?.questId ?? null,
    });
    const activityLabel =
      data.questCompleted?.questName ??
      data.scan.activityLabel ??
      locationName ??
      data.scan.title;
    const statIncrease = data.scan.statBoost?.statGain ?? 0;
    const gymDef = getActivityById(activityId);
    const statKey = data.scan.statBoost?.stat as StatKey | undefined;

    logQrScanDebug("validation_response", {
      ok: true,
      code: normalizedCode,
      activityId,
      type: data.scan.type ?? null,
      xpAwarded: data.xpAwarded,
      status: data.scan.status ?? null,
      stat: statKey ?? gymDef?.stat ?? null,
      statIncrease,
      reward: {
        xp,
        activityLabel,
        leveledUp: data.leveledUp,
        level: data.level,
      },
    });

    const stats: Partial<Record<StatKey, number>> = {};
    const nextStats = { ...before.stats };
    if (statKey && statIncrease > 0) {
      nextStats[statKey] = (before.stats[statKey] ?? 0) + statIncrease;
      stats[statKey] = statIncrease;
    }

    recordQrLinkedActivityLog(before.id, {
      activityId,
      xpEarned: xp,
      activityLabel,
      feedType: activityPayload.activity_type,
      title: activityPayload.title,
      description: activityPayload.description,
      qrCodeId: activityPayload.qr_code_id,
      questId: activityPayload.quest_id ?? data.questCompleted?.questId,
      locationName,
    });

    const gymQuestType =
      activityId === "gym" || /gym/i.test(activityLabel) ? "Strength Quest" : undefined;

    const successVariant: SigilScannerReward["successVariant"] =
      xp > 0 ? "xp" : data.questCompleted ? "quest_complete" : "check_in";

    const xpSession: ActivityXPGainSession | undefined =
      xp > 0
          ? buildQrXpSession({
              beforeTotalXP: before.totalXP,
              afterTotalXP,
              xpGained: xp,
              title: data.questCompleted
                ? `${data.questCompleted.questName} complete!`
                : `${activityLabel} logged!`,
              activityLabel,
              activityQuestType: gymQuestType,
              primaryStat: gymDef?.stat ?? "strength",
              stats,
              leveledUp: data.leveledUp,
              modifierLines: [{ label: activityLabel, emoji: "📷" }],
              pendingCharacter: {
                totalXP: afterTotalXP,
                level: data.level,
                stats: nextStats,
              },
            })
        : undefined;

    return {
      ok: true,
      suppressVictoryOverlay: xp > 0,
      handoffToXpOverlay: xp > 0,
      xpSession,
      questCompleted: data.questCompleted ?? null,
      reward: {
        xp,
        statLabel: STAT_LABELS[gymDef?.stat ?? "strength"],
        statIncrease,
        leveledUp: data.leveledUp,
        levelAfter: data.level,
        sigilName: activityLabel,
        milestonesUnlocked: data.milestonesUnlocked,
        successVariant,
      },
    };
  } catch (error) {
    const failureCode = error instanceof ApiRequestError ? error.code : "unknown";
    if (failureCode === "ALREADY_CLAIMED") {
      logQrScanDebug("duplicate_blocked", {
        code: normalizedCode,
        httpStatus: error instanceof ApiRequestError ? error.status : undefined,
      });
    }
    const banner =
      error instanceof ApiRequestError
        ? qrScanBannerFromApiError(error)
        : qrScanBannerFromUnknownError(error);
    logQrScanDebug("validation_failed", {
      code: normalizedCode,
      activityId: normalizedCode,
      failureCode,
      httpStatus: error instanceof ApiRequestError ? error.status : undefined,
      failureReason: error instanceof Error ? error.message : String(error),
      userBanner: banner,
    });
    return {
      ok: false,
      banner,
      alreadyClaimed:
        failureCode === "ALREADY_CLAIMED" ||
        failureCode === "ADMIN_QUEST_ALREADY_COMPLETED" ||
        failureCode === "QUEST_ALREADY_CLAIMED",
    };
  } finally {
    releaseQrRedeemLock(args.character.id, normalizedCode);
  }
}
