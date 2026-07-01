"use client";

import { useEffect, useState } from "react";
import type { QuestQrPosterData } from "@/lib/client/questQrPosterExport";

type QuestQrPrintPosterProps = {
  data: QuestQrPosterData;
  posterId?: string;
};

/** Clean white printable poster — no admin chrome. */
export function QuestQrPrintPoster({ data, posterId = "cq-quest-qr-poster" }: QuestQrPrintPosterProps) {
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((QRCode) =>
      QRCode.default
        .toDataURL(data.scanUrl, {
          width: 480,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#041E42", light: "#ffffff" },
        })
        .then((url) => {
          if (!cancelled) setQrSrc(url);
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [data.scanUrl]);

  return (
    <article
      id={posterId}
      className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 text-center text-[#041E42] shadow-none print:max-w-none print:rounded-none print:shadow-none"
    >
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#68ABE8]">CampusQuest</p>
      <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight text-[#041E42]">{data.questName}</h1>
      {data.locationName?.trim() ? (
        <p className="mt-2 text-lg font-semibold text-slate-600">{data.locationName.trim()}</p>
      ) : null}
      <div className="mx-auto mt-6 flex max-w-[18rem] justify-center rounded-xl bg-white p-3">
        {qrSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrSrc} alt={`QR code for ${data.questName}`} className="h-auto w-full" />
        ) : (
          <div className="aspect-square w-full animate-pulse rounded-lg bg-slate-100" />
        )}
      </div>
      <p className="mt-6 text-sm text-slate-500">Scan in CampusQuest to complete this quest</p>
      <p className="mt-2 text-2xl font-extrabold text-[#041E42]">Earn {data.xpReward} XP</p>
    </article>
  );
}
