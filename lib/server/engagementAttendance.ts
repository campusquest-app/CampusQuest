/**
 * Verified event attendance rules for university engagement analytics.
 *
 * A successful QR scan counts as attendance ONLY when the QR code is an
 * explicit event check-in linked to a campus event. Quest / location / general
 * QRs never count — even if they happen to store an event_id.
 */

export type QrCodeAttendanceFields = {
  id: string;
  event_id: string | null;
  type?: string | null;
  qr_type?: string | null;
};

export type QrScanAttendanceFields = {
  user_id: string;
  qr_code_id: string;
  status?: string | null;
};

const QUEST_TYPES = new Set(["quest"]);
const QUEST_QR_TYPES = new Set(["quest_completion"]);

/**
 * True when this QR is a dedicated event check-in / event attendance code.
 * Requires a non-null event_id AND event semantics (type or qr_type).
 */
export function isVerifiedEventAttendanceQr(qr: QrCodeAttendanceFields): boolean {
  if (!qr.event_id) return false;
  const type = (qr.type ?? "").toLowerCase();
  const qrType = (qr.qr_type ?? "").toLowerCase();
  if (QUEST_TYPES.has(type) || QUEST_QR_TYPES.has(qrType)) return false;
  if (type === "event") return true;
  if (qrType === "event_check_in") return true;
  return false;
}

export type VerifiedAttendanceRecord = {
  userId: string;
  eventId: string;
  scanCount: number;
};

/**
 * Build unique (user, event) attendance from success scans + qualifying QR codes.
 * Duplicate scans for the same user+event collapse to one unique attendee.
 */
export function buildVerifiedAttendance(args: {
  scans: QrScanAttendanceFields[];
  qrById: Map<string, QrCodeAttendanceFields>;
  eligibleUserIds: Set<string>;
}): {
  /** Unique user+event pairs */
  records: VerifiedAttendanceRecord[];
  /** Unique students with ≥1 verified event check-in */
  uniqueAttendeeUserIds: Set<string>;
  /** Per-event unique attendees + raw qualifying scan counts */
  byEvent: Map<string, { uniqueUserIds: Set<string>; scanCount: number }>;
  hasConfidentSignal: boolean;
} {
  const pairCounts = new Map<string, { userId: string; eventId: string; scanCount: number }>();

  for (const scan of args.scans) {
    if (scan.status && scan.status !== "success") continue;
    if (!args.eligibleUserIds.has(scan.user_id)) continue;
    const qr = args.qrById.get(scan.qr_code_id);
    if (!qr || !isVerifiedEventAttendanceQr(qr)) continue;
    const eventId = qr.event_id as string;
    const key = `${scan.user_id}::${eventId}`;
    const existing = pairCounts.get(key);
    if (existing) {
      existing.scanCount += 1;
    } else {
      pairCounts.set(key, { userId: scan.user_id, eventId, scanCount: 1 });
    }
  }

  const records = Array.from(pairCounts.values());
  const uniqueAttendeeUserIds = new Set(records.map((r) => r.userId));
  const byEvent = new Map<string, { uniqueUserIds: Set<string>; scanCount: number }>();
  for (const rec of records) {
    let entry = byEvent.get(rec.eventId);
    if (!entry) {
      entry = { uniqueUserIds: new Set(), scanCount: 0 };
      byEvent.set(rec.eventId, entry);
    }
    entry.uniqueUserIds.add(rec.userId);
    entry.scanCount += rec.scanCount;
  }

  return {
    records,
    uniqueAttendeeUserIds,
    byEvent,
    /** Classification rules are deterministic once QR type/qr_type/event_id are loaded. */
    hasConfidentSignal: true,
  };
}
