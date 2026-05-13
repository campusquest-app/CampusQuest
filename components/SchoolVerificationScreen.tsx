"use client";

type Props = {
  requiredSchoolName: string;
  requiredSchoolDomain: string | null;
  currentDomain: string | null;
  onUseDifferentAccount?: () => void;
};

export function SchoolVerificationScreen({
  requiredSchoolName,
  requiredSchoolDomain,
  currentDomain,
  onUseDifferentAccount,
}: Props) {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10 sm:py-14">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950/75 backdrop-blur-xl shadow-2xl shadow-black/30 p-5 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Campus Email Verification Required</h1>
        <p className="mt-3 text-sm sm:text-base text-white/75 leading-relaxed">
          CampusQuest pilot access is currently limited to verified students at {requiredSchoolName}.
        </p>
        <div className="mt-6 rounded-2xl border border-white/15 bg-white/[0.03] p-4 sm:p-5 space-y-2 text-sm text-white/80">
          <p>
            Required school domain: <span className="font-semibold text-uri-keaney">{requiredSchoolDomain ?? "N/A"}</span>
          </p>
          <p>
            Your account domain: <span className="font-semibold text-white">{currentDomain ?? "Unknown"}</span>
          </p>
        </div>
        <p className="mt-5 text-xs sm:text-sm text-white/65 leading-relaxed">
          Sign in with a confirmed campus email address to unlock events, organizations, and student discovery.
          Personal email addresses are never shared publicly in CampusQuest.
        </p>
        {onUseDifferentAccount ? (
          <button
            type="button"
            onClick={onUseDifferentAccount}
            className="mt-5 w-full rounded-xl py-3 text-sm font-semibold bg-uri-keaney text-white hover:bg-uri-keaney/90 transition-colors"
          >
            Use a different account
          </button>
        ) : null}
      </div>
    </div>
  );
}
