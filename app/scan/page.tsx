"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

function ScanDeepLinkInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code")?.trim();

  useEffect(() => {
    if (!FEATURE_FLAGS.progression) {
      router.replace("/");
      return;
    }
    if (!code) return;
    router.replace(`/?scan=${encodeURIComponent(code)}`);
  }, [code, router]);

  if (!FEATURE_FLAGS.progression) {
    return <p className="mt-3 max-w-sm text-sm text-white/80">Opening CampusQuest…</p>;
  }

  return (
    <p className="mt-3 max-w-sm text-sm text-white/80">
      {code ? "Opening your magical scanner…" : "Missing QR code. Scan a CampusQuest QR from the Quad."}
    </p>
  );
}

export default function ScanDeepLinkPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-uri-navy px-6 text-center">
      {FEATURE_FLAGS.progression ? (
        <p className="font-display text-lg font-bold text-cyan-100">✦ CQ Scanner ✦</p>
      ) : (
        <p className="font-display text-lg font-bold text-cyan-100">CampusQuest</p>
      )}
      <Suspense fallback={<p className="mt-3 max-w-sm text-sm text-white/80">Opening CampusQuest…</p>}>
        <ScanDeepLinkInner />
      </Suspense>
    </main>
  );
}
