"use client";

import { STUDENT_PRIVACY_ACTION, STUDENT_PRIVACY_MESSAGE, STUDENT_PRIVACY_TITLE } from "@/lib/localBusiness/access";

export function StudentPrivacyScreen({ onGoToLocalBusinesses }: { onGoToLocalBusinesses: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-uri-navy px-6 py-8 text-center shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cq-student-privacy-title"
      >
        <h2 id="cq-student-privacy-title" className="text-xl font-bold text-white">
          {STUDENT_PRIVACY_TITLE}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/75">{STUDENT_PRIVACY_MESSAGE}</p>
        <button
          type="button"
          className="mt-6 w-full rounded-full bg-uri-keaney px-4 py-3 text-sm font-bold text-white"
          onClick={onGoToLocalBusinesses}
        >
          {STUDENT_PRIVACY_ACTION}
        </button>
      </div>
    </div>
  );
}
