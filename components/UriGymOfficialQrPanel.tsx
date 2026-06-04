"use client";

import Image from "next/image";
import {
  OFFICIAL_GYM_QR_ASSET_PATH,
  OFFICIAL_GYM_QR_PAYLOAD,
  gymQrDownloadFilename,
} from "@/lib/gymQr";

type Props = {
  className?: string;
  compact?: boolean;
};

/**
 * Official URI Gym QR — encodes `GYM` for CQ Scanner and generic QR readers.
 */
export function UriGymOfficialQrPanel({ className, compact }: Props) {
  const downloadName = gymQrDownloadFilename();

  return (
    <div
      className={`rounded-2xl border border-cyan-400/35 bg-gradient-to-br from-[#04142d]/95 via-uri-navy/90 to-[#020b1f]/95 p-4 shadow-[0_0_40px_-12px_rgba(56,189,248,0.45)] ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Official URI Gym</p>
          <h3 className="mt-1 font-display text-lg font-bold text-white">URI Gym Check-In</h3>
          <p className="mt-1 text-xs text-white/65">
            QR encodes <code className="font-bold text-cyan-100">{OFFICIAL_GYM_QR_PAYLOAD}</code> · Database code{" "}
            <code className="text-cyan-100/90">GYM</code> · +10 XP · Hitting the Gym
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={OFFICIAL_GYM_QR_ASSET_PATH}
            download={downloadName}
            className="rounded-lg border border-cyan-400/45 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-50 hover:bg-cyan-500/25"
          >
            Download {downloadName}
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/15 print:hidden"
          >
            Print
          </button>
        </div>
      </div>

      <div
        className={`mx-auto mt-4 flex justify-center ${compact ? "max-w-[220px]" : "max-w-[min(100%,340px)]"}`}
        id="uri-gym-official-qr-print"
      >
        <div className="rounded-xl bg-white p-4 shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
          <Image
            src={OFFICIAL_GYM_QR_ASSET_PATH}
            alt="Official URI Gym QR code encoding GYM"
            width={compact ? 220 : 320}
            height={compact ? 220 : 320}
            className="h-auto w-full"
            priority
            unoptimized
          />
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-white/55">
        Test: phone camera, generic QR app, and CQ Scanner should all read <strong className="text-cyan-100">GYM</strong>
      </p>
    </div>
  );
}
