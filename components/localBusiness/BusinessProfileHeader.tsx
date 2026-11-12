import type { ReactNode } from "react";

/**
 * Shared owner and public business header.
 * The banner clips its own cover. The logo may overlap the banner edge.
 * The name and handle stay below the banner and wrap instead of truncating.
 */
export function BusinessProfileHeader({
  name,
  handle,
  logoUrl,
  coverImageUrl,
  nameControl,
  switchControl,
}: {
  name: string;
  handle: string;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  nameControl?: ReactNode;
  switchControl?: ReactNode;
}) {
  return (
    <>
      <div className="h-36 overflow-hidden rounded-t-3xl bg-black/40">
        {coverImageUrl ? <img src={coverImageUrl} alt="" className="h-full w-full object-cover" /> : null}
      </div>
      <div className="px-4">
        <div className="flex items-start gap-3">
          <div className="relative z-10 -mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-uri-navy bg-black">
            {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : null}
          </div>
          <div className="min-w-0 flex-1 pt-3">
            {nameControl ?? <h1 className="break-words text-xl font-bold leading-tight">{name}</h1>}
            <p className="break-words text-sm text-white/60">@{handle}</p>
            {switchControl}
          </div>
        </div>
      </div>
    </>
  );
}
