const sections = [
  {
    title: "Respect Others",
    body: ["Treat all users with respect. Bullying, harassment, threats, intimidation, hate speech, and discrimination are prohibited."],
  },
  {
    title: "No Dangerous or Illegal Activity",
    body: ["Do not promote violence, organize harmful activities, share illegal content, scam users, or impersonate others."],
  },
  {
    title: "Authenticity Matters",
    body: ["Do not create fake accounts/events, spread false information, or manipulate engagement."],
  },
  {
    title: "Inappropriate Content",
    body: ["Excessive sexual content, graphic violence, or explicit harassment is prohibited."],
  },
  {
    title: "Event Safety",
    body: ["Users organizing events are responsible for accurate information, lawful conduct, and attendee safety."],
  },
  {
    title: "Reporting & Enforcement",
    body: ["CampusQuest may remove content, suspend/ban accounts, and cooperate with law enforcement when necessary."],
  },
  {
    title: "Our Goal",
    body: ["CampusQuest exists to create stronger campus communities, meaningful friendships, student opportunities, and safer engagement experiences."],
  },
];

export default function CommunityGuidelinesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12 sm:pb-16">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Community Guidelines</h1>
        <p className="mt-4 text-sm text-white/80 leading-relaxed">
          CampusQuest helps students connect, grow, and build meaningful campus experiences. To keep the platform safe
          and positive, all users must follow these guidelines.
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
