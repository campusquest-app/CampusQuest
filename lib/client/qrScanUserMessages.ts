import { ApiRequestError, CQ_MISSING_SESSION_CODE } from "@/lib/client/dashboardApi";
import type { ParseQrActivityErrorCode } from "@/lib/qrCampusQuestActivity";

/** User-facing scanner copy (never include technical details). */
export const QR_SCAN_USER_MESSAGES = {
  readError: "CampusQuest had trouble reading this QR code. Hold steady and try again.",
  invalidFormat: "This QR code is not a CampusQuest activity code.",
  expired: "This QR code has expired.",
  alreadyScanned: "You already claimed this QR reward.",
  activityNotActive: "This activity is not active in CampusQuest.",
  qrNotFound: "QR code not found.",
  qrNotLinked: "This QR is not linked to a quest yet.",
  questUnavailable: "Quest is not currently available.",
  offline: "You're offline. Connect to the internet and scan again.",
  timeout: "CampusQuest is taking too long to verify this QR. Try again.",
  tablesNotReady: "QR rewards are not fully set up yet.",
  serverError: "CampusQuest couldn't verify this QR right now. Try again in a moment.",
  sessionRequired: "Sign in to CampusQuest, then scan again.",
  staffApproval: "This check-in needs staff approval before XP is awarded.",
} as const;

export type QrDetectedFormat =
  | "empty"
  | "secure_code"
  | "legacy_activity_json"
  | "unrecognized";

/** True when decoded text is too ambiguous to treat as a deliberate CampusQuest payload. */
export function isLikelyCameraReadFailure(rawText: string): boolean {
  const t = rawText.trim();
  if (!t) return true;
  if (t.startsWith("{")) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (/^cq_[a-zA-Z0-9_-]{4,64}$/.test(t)) return false;
  if (/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(t)) return false;
  if (t.length < 6) return true;
  return false;
}

export function userMessageForParseError(code: ParseQrActivityErrorCode, rawText: string): string {
  if (code === "expired") return QR_SCAN_USER_MESSAGES.expired;
  if (code === "invalid_json") {
    return isLikelyCameraReadFailure(rawText)
      ? QR_SCAN_USER_MESSAGES.readError
      : QR_SCAN_USER_MESSAGES.invalidFormat;
  }
  return QR_SCAN_USER_MESSAGES.invalidFormat;
}

export function qrScanBannerFromApiError(error: ApiRequestError): string {
  const code = error.code ?? "";
  const msg = error.message ?? "";

  if (code === "VALIDATION_ERROR") {
    return QR_SCAN_USER_MESSAGES.invalidFormat;
  }

  switch (code) {
    case "INVALID_QR_CODE":
    case "UNKNOWN_CODE":
      return QR_SCAN_USER_MESSAGES.invalidFormat;
    case "QR_CODE_NOT_FOUND":
    case "ACTIVITY_NOT_FOUND":
      return QR_SCAN_USER_MESSAGES.qrNotFound;
    case "QR_NOT_LINKED":
    case "QR_QUEST_NOT_FOUND":
      return QR_SCAN_USER_MESSAGES.qrNotLinked;
    case "QUEST_UNAVAILABLE":
    case "ADMIN_QUEST_INACTIVE":
      return QR_SCAN_USER_MESSAGES.questUnavailable;
    case "INACTIVE_QR_CODE":
    case "INACTIVE_QR_QUEST":
    case "QR_INACTIVE":
      return QR_SCAN_USER_MESSAGES.activityNotActive;
    case "EXPIRED_QR_CODE":
    case "QR_EXPIRED":
      return QR_SCAN_USER_MESSAGES.expired;
    case "QR_ALREADY_REDEEMED":
    case "ALREADY_CLAIMED":
    case "COOLDOWN_ACTIVE":
    case "ALREADY_USED_QR_CODE":
      return QR_SCAN_USER_MESSAGES.alreadyScanned;
    case "QR_COOLDOWN":
    case "QR_DAILY_LIMIT":
      if (/uri gym|checked in/i.test(msg)) return msg;
      return QR_SCAN_USER_MESSAGES.alreadyScanned;
    case "QR_STAFF_APPROVAL":
      return QR_SCAN_USER_MESSAGES.staffApproval;
    case "UNAUTHORIZED":
    case CQ_MISSING_SESSION_CODE:
      return QR_SCAN_USER_MESSAGES.sessionRequired;
    case "QR_TABLES_NOT_READY":
      return QR_SCAN_USER_MESSAGES.tablesNotReady;
    case "QR_SCHEMA_OUT_OF_DATE":
    case "SUPABASE_SERVICE_ROLE_MISSING":
    case "SUPABASE_ENV_MISSING":
    case "QR_LOOKUP_FAILED":
    case "QR_SCAN_LOG_FAILED":
    case "STATS_NOT_FOUND":
    case "XP_APPLY_FAILED":
    case "XP_LOG_FAILED":
    case "INTERNAL_ERROR":
      return QR_SCAN_USER_MESSAGES.serverError;
    default:
      break;
  }

  if (error.status === 404) return QR_SCAN_USER_MESSAGES.qrNotFound;
  if (error.status === 409 && /expired/i.test(msg)) return QR_SCAN_USER_MESSAGES.expired;
  if (error.status === 409 && /not linked to a quest/i.test(msg)) {
    return QR_SCAN_USER_MESSAGES.qrNotLinked;
  }
  if (error.status === 409 && /not currently available/i.test(msg)) {
    return QR_SCAN_USER_MESSAGES.questUnavailable;
  }
  if (error.status === 409 && /already|cooldown|limit|claimed|duplicate/i.test(msg)) {
    return QR_SCAN_USER_MESSAGES.alreadyScanned;
  }
  if (error.status === 409 && /inactive|not active/i.test(msg)) {
    return QR_SCAN_USER_MESSAGES.activityNotActive;
  }
  if (error.status >= 500) return QR_SCAN_USER_MESSAGES.serverError;

  return QR_SCAN_USER_MESSAGES.serverError;
}

export function qrScanBannerFromUnknownError(error: unknown): string {
  if (error instanceof ApiRequestError) return qrScanBannerFromApiError(error);
  if (error instanceof Error) {
    if (error.message === "PROCESSING_TIMEOUT") return QR_SCAN_USER_MESSAGES.timeout;
    if (/Invalid API response/i.test(error.message)) return QR_SCAN_USER_MESSAGES.serverError;
    if (/could not be reached|network|fetch/i.test(error.message)) {
      return QR_SCAN_USER_MESSAGES.serverError;
    }
  }
  return QR_SCAN_USER_MESSAGES.serverError;
}
