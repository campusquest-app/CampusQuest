const sections = [
  {
    title: "1. Eligibility",
    body: [
      "You must be at least 13 years old to use CampusQuest.",
      "By using CampusQuest, you confirm the information you provide is accurate, you will comply with applicable laws, and you are responsible for your account activity.",
    ],
  },
  {
    title: "2. User Conduct",
    body: [
      "Users may not harass/threaten others, post discriminatory or hateful content, impersonate others, create scams/fake events, share illegal or harmful material, or attempt unauthorized access.",
      "CampusQuest may remove content or suspend accounts at any time.",
    ],
  },
  {
    title: "3. User Content",
    body: [
      "Users retain ownership of content they post but grant CampusQuest a non-exclusive license to display/distribute content within the platform.",
      "Users are solely responsible for their content and interactions.",
    ],
  },
  {
    title: "4. Platform Availability",
    body: ["CampusQuest is provided \"as is\" and \"as available\" with no guarantee of uninterrupted service, error-free operation, data preservation, or always-on availability."],
  },
  {
    title: "5. Limitation of Liability",
    body: [
      "To the fullest extent permitted by law, CampusQuest and affiliates are not liable for indirect damages, lost profits, emotional distress, data loss, personal disputes, or incidents at user-created events.",
      "Users participate in campus activities and interactions at their own risk.",
    ],
  },
  {
    title: "6. Account Termination",
    body: ["Accounts may be suspended or terminated for policy violations, unsafe behavior, fraud, or platform misuse."],
  },
  {
    title: "7. Intellectual Property",
    body: ["CampusQuest branding, software, design, and platform content are protected by intellectual property laws and may not be copied, reverse engineered, or commercially exploited without permission."],
  },
  {
    title: "8. Dispute Resolution",
    body: [
      "Disputes should first be raised informally through CampusQuest support.",
      "If unresolved, disputes may proceed through binding arbitration instead of court, where permitted by law.",
    ],
  },
  {
    title: "9. Changes to Terms",
    body: ["CampusQuest may modify these Terms at any time. Continued use constitutes acceptance of updated Terms."],
  },
  {
    title: "10. Contact",
    body: ["Questions: support@campusquest.app"],
  },
];

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12 sm:pb-16">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Terms of Service</h1>
        <p className="mt-2 text-sm text-white/70">Effective Date: May 12, 2026</p>
        <p className="mt-4 text-sm text-white/80 leading-relaxed">
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of CampusQuest. By using CampusQuest,
          you agree to these Terms.
        </p>

        <div className="mt-6 space-y-6">
          {sections.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-base sm:text-lg font-semibold text-white">{section.title}</h2>
              <ul className="space-y-2 text-sm text-white/75 leading-relaxed">
                {section.body.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
