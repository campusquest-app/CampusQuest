"use client";

import type { RealmMapLayerReport } from "./useRealmMapDiagnostics";

type RealmMapDebugContentProps = {
  report: RealmMapLayerReport;
  userId?: string | null;
  role?: string;
};

export function RealmMapDebugContent({ report, userId, role }: RealmMapDebugContentProps) {
  return (
    <div className="space-y-2 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-white/70">
      <ul className="space-y-0.5">
        <li>Map loaded: {report.uriMapLoaded ? "yes" : "no"}</li>
        <li>Map visible: {report.uriMapVisible ? "yes" : "no"}</li>
        <li>Opacity: {report.uriMapOpacity}</li>
        <li>Footprints: {report.footprintCount}</li>
        <li>Paths: {report.pathCount}</li>
        <li>Pins: {report.pinCount}</li>
        <li>Quest glows: {report.questGlowCount}</li>
        <li>Calibrate: {report.calibrateMode ? "on" : "off"}</li>
        <li>Obsolete: {report.obsoleteLayers.length ? report.obsoleteLayers.join(", ") : "none"}</li>
      </ul>
      {userId != null || role ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[10px] text-white/55">
          {userId != null ? (
            <>
              <dt className="text-white/35">user id</dt>
              <dd className="truncate">{userId || "—"}</dd>
            </>
          ) : null}
          {role ? (
            <>
              <dt className="text-white/35">role</dt>
              <dd>{role}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

/** @deprecated Use RealmMapDebugContent inside Map Editor debug section. */
export function RealmMapDebugPanel({ report }: { report: RealmMapLayerReport | null }) {
  if (!report) return null;
  return (
    <div className="absolute left-3 top-3 z-[6] max-w-[14rem] rounded-lg border border-amber-400/35 bg-black/75 px-2.5 py-2 text-[10px] leading-relaxed text-amber-100/90">
      <p className="mb-1 font-bold uppercase tracking-wider text-amber-300/80">Realm debug</p>
      <RealmMapDebugContent report={report} />
    </div>
  );
}
