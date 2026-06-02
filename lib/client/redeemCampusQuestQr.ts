"use client";

import type { QrScannerValidationResult } from "@/components/scanner/sigilRewardTypes";
import type { ActivityXPGainSession } from "@/components/xp/xpGainTypes";
import { buildQrXpSession } from "@/lib/client/buildQrXpSession";
import { ApiRequestError, postAuthed } from "@/lib/client/dashboardApi";
import { logQrScanDebug } from "@/lib/client/qrScanDebug";
import { normalizeQrCode } from "@/lib/qrCodeExtract";
import {
  QR_SCAN_USER_MESSAGES,
  qrScanBannerFromApiError,
  qrScanBannerFromUnknownError,
} from "@/lib/client/qrScanUserMessages";
import { getActivityById } from "@/lib/activities";
import { recordQrLinkedActivityLog } from "@/lib/store";
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
    statBoost?: { stat: string; statGain: number } | null;
  };
  xpAwarded: number;
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
  const requestPayload = {
    code: normalizedCode,
    deviceHint:
      typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 100) : undefined,
  };

  logQrScanDebug("validation_request", {
    payload: requestPayload,
    extractedCode: normalizedCode,
    activityId: normalizedCode,
    type: "secure_code",
  });

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, banner: QR_SCAN_USER_MESSAGES.offline };
  }

  const before = args.character;

  try {
    const data = await postAuthed<QrScanApiResponse, typeof requestPayload>("/api/qr/scan", requestPayload);

    const xp = Math.max(0, data.xpAwarded);
    const afterTotalXP =
      typeof data.totalXp === "number" ? data.totalXp : before.totalXP + xp;
    const activityId = data.scan.activityId ?? "gym";
    const activityLabel = data.scan.activityLabel ?? "Hitting the Gym";
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

    let updated: Character = {
      ...(args.getCharacter() ?? before),
      totalXP: afterTotalXP,
      level: data.level,
    };
    const stats: Partial<Record<StatKey, number>> = {};
    if (statKey && statIncrease > 0) {
      updated = {
        ...updated,
        stats: {
          ...updated.stats,
          [statKey]: (before.stats[statKey] ?? 0) + statIncrease,
        },
      };
      stats[statKey] = statIncrease;
    }
    args.replaceLocalCharacter(updated, { skipRemoteSync: true });

    recordQrLinkedActivityLog(before.id, {
      activityId,
      xpEarned: xp,
      activityLabel,
    });

    const gymQuestType =
      activityId === "gym" || /gym/i.test(activityLabel) ? "Strength Quest" : undefined;

    const xpSession: ActivityXPGainSession | undefined =
      xp > 0
        ? buildQrXpSession({
            beforeTotalXP: before.totalXP,
            afterTotalXP,
            xpGained: xp,
            title: `${activityLabel} logged!`,
            activityLabel,
            activityQuestType: gymQuestType,
            primaryStat: gymDef?.stat ?? "strength",
            stats,
            leveledUp: data.leveledUp,
            modifierLines: [{ label: activityLabel, emoji: "📷" }],
          })
        : undefined;

    return {
      ok: true,
      suppressVictoryOverlay: xp > 0,
      handoffToXpOverlay: xp > 0,
      xpSession,
      reward: {
        xp,
        statLabel: STAT_LABELS[gymDef?.stat ?? "strength"],
        statIncrease,
        leveledUp: data.leveledUp,
        levelAfter: data.level,
        sigilName: activityLabel,
        milestonesUnlocked: data.milestonesUnlocked,
      },
    };
  } catch (error) {
    const banner =
      error instanceof ApiRequestError
        ? qrScanBannerFromApiError(error)
        : qrScanBannerFromUnknownError(error);
    logQrScanDebug("validation_failed", {
      code: normalizedCode,
      activityId: normalizedCode,
      failureCode: error instanceof ApiRequestError ? error.code : "unknown",
      httpStatus: error instanceof ApiRequestError ? error.status : undefined,
      failureReason: error instanceof Error ? error.message : String(error),
      userBanner: banner,
    });
    return { ok: false, banner };
  }
}
