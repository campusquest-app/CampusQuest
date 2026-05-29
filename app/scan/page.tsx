"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ScanDeepLinkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code")?.trim();

  useEffect(() => {
    if (!code) return;
    router.replace(`/?scan=${encodeURIComponent(code)}`);
  }, [code, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-uri-navy px-6 text-center">
      <p className="font-display text-lg font-bold text-cyan-100">✦ CQ Scanner ✦</p>
      <p className="mt-3 max-w-sm text-sm text-white/80">
        {code ? "Opening your magical scanner…" : "Missing QR code. Scan a CampusQuest QR from the Quad."}
      </p>
    </main>
  );
}
