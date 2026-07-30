import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_DOC_LINKS } from "@/lib/legal/policy";

export const metadata: Metadata = {
  title: "Support · CampusQuest",
  description: "Contact CampusQuest support, report content, and review device permissions.",
};

const PERMISSIONS = [
  {
    name: "Location",
    why: "Shows nearby campus places, Realm map discovery, and location-based memories when you choose to share them.",
  },
  {
    name: "Camera",
    why: "Scans official CampusQuest QR codes and lets you take photos for messages or memories.",
  },
  {
    name: "Photos / media library",
    why: "Lets you attach existing images to messages, posts, and campus memories.",
  },
  {
    name: "Microphone",
    why: "Records optional voice notes in direct messages when you choose to send one.",
  },
  {
    name: "Notifications",
    why: "Delivers message alerts, quest reminders, and important safety notices when enabled.",
  },
] as const;

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-white sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/70">CampusQuest</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Support & safety</h1>
      <p className="mt-3 text-sm leading-relaxed text-white/65">
        We’re here to help with account issues, safety reports, and device permissions. For urgent
        safety concerns, report in-app and email us.
      </p>

      <section className="mt-8 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p className="text-sm text-white/65">
          Email{" "}
          <a className="font-medium text-cyan-300 underline" href="mailto:support@campusquest.app">
            support@campusquest.app
          </a>
        </p>
        <p className="text-sm text-white/55">
          Typical response time: within 2 business days. Include your username and a short
          description of the issue.
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold">Report inappropriate content</h2>
        <p className="text-sm text-white/65">
          CampusQuest includes user-created posts, comments, messages, profiles, events, and
          images. You can report content from the in-app ••• menus on posts, comments, messages,
          profiles, and events. Moderators review open reports.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/60">
          <li>Posts, events, organizations — use Report in each item’s menu</li>
          <li>Messages — Report from the conversation</li>
          <li>Users — Report or Block from their profile</li>
          <li>Comments — Report from the comment menu</li>
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold">Copyright & trademark infringement</h2>
        <p className="text-sm text-white/65">
          To report alleged copyright or trademark infringement, email{" "}
          <a
            className="font-medium text-cyan-300 underline"
            href="mailto:support@campusquest.app?subject=Infringement%20Report"
          >
            support@campusquest.app
          </a>{" "}
          with:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/60">
          <li>Your contact information</li>
          <li>A description of the protected work</li>
          <li>The CampusQuest URL or username where it appears</li>
          <li>A good-faith statement that you are authorized to act</li>
        </ul>
        <p className="text-sm text-white/55">
          Signed-in users can also submit an infringement report from Settings → Help & Support or
          via the in-app report tools (reason: Copyright or trademark infringement).
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold">Restricted content</h2>
        <p className="text-sm text-white/65">
          CampusQuest does not allow illegal content, sexual exploitation, graphic violence,
          hate speech, or harassment. Reported restricted content is reviewed and may be removed;
          accounts that violate our guidelines may be suspended.
        </p>
        <p className="text-sm text-white/55">
          See our{" "}
          <Link className="text-cyan-300 underline" href={LEGAL_DOC_LINKS.guidelines}>
            Community Guidelines
          </Link>
          .
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold">Device permissions</h2>
        <p className="mb-3 text-sm text-white/55">
          CampusQuest only requests permissions needed for features you use. You can deny any
          permission; related features will be limited.
        </p>
        <dl className="space-y-3">
          {PERMISSIONS.map((p) => (
            <div key={p.name}>
              <dt className="text-sm font-semibold text-white/90">{p.name}</dt>
              <dd className="text-sm text-white/55">{p.why}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold">Delete your account</h2>
        <p className="text-sm text-white/65">
          In the app: Settings → Account → Delete account. Or email{" "}
          <a className="text-cyan-300 underline" href="mailto:support@campusquest.app?subject=Delete%20Account">
            support@campusquest.app
          </a>{" "}
          from the address on your account.
        </p>
      </section>

      <section className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link className="rounded-full border border-white/15 px-3 py-1.5 text-white/80 hover:bg-white/[0.05]" href={LEGAL_DOC_LINKS.privacy}>
          Privacy Policy
        </Link>
        <Link className="rounded-full border border-white/15 px-3 py-1.5 text-white/80 hover:bg-white/[0.05]" href={LEGAL_DOC_LINKS.terms}>
          Terms of Service
        </Link>
        <Link className="rounded-full border border-white/15 px-3 py-1.5 text-white/80 hover:bg-white/[0.05]" href={LEGAL_DOC_LINKS.guidelines}>
          Community Guidelines
        </Link>
      </section>
    </main>
  );
}
