const sections = [
  {
    title: "1. Information We Collect",
    body: [
      "Personal Information: name, email address, school/university affiliation, profile information, user-generated content, and messages/interactions.",
      "Technical Information: IP address, device information, browser type, login activity, cookies, and analytics data.",
      "Location Information: approximate location and campus-related location services if enabled.",
      "Payment Information: when processed by providers like Stripe, we may receive limited transaction details but do not store full payment card information directly.",
    ],
  },
  {
    title: "2. How We Use Your Information",
    body: [
      "Provide and improve CampusQuest services, create/manage accounts, personalize experiences, facilitate student connections, prevent fraud and abuse, communicate updates, and analyze usage/performance.",
    ],
  },
  {
    title: "3. Sharing of Information",
    body: [
      "We do not sell personal information.",
      "Information may be shared with service providers, universities/campus partners when necessary, law enforcement when legally required, and third-party analytics/authentication providers.",
    ],
  },
  {
    title: "4. Data Security",
    body: [
      "We use reasonable safeguards including secure authentication, HTTPS encryption, restricted administrative access, and security monitoring.",
      "No system is completely secure, and absolute security cannot be guaranteed.",
    ],
  },
  {
    title: "5. User Content",
    body: ["Users are responsible for posted/shared content. CampusQuest may remove content that violates policy."],
  },
  {
    title: "6. Account Deletion",
    body: [
      "Users may request account deletion by contacting support@campusquest.app.",
      "Some information may be retained when legally required or needed for safety, fraud prevention, or dispute resolution.",
    ],
  },
  {
    title: "7. Cookies & Analytics",
    body: [
      "Cookies and analytics may be used to improve UX, measure engagement, and understand platform performance.",
      "Users can disable cookies in browser settings, but some features may not work properly.",
    ],
  },
  {
    title: "8. Children’s Privacy",
    body: ["CampusQuest is not intended for children under 13 and does not knowingly collect personal information from children under 13."],
  },
  {
    title: "9. Changes to This Policy",
    body: ["We may update this policy periodically. Continued use after updates constitutes acceptance of the revised policy."],
  },
  {
    title: "10. Contact Information",
    body: ["For privacy-related questions: support@campusquest.app"],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-uri-navy px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-white/70">Effective Date: May 12, 2026</p>
        <p className="mt-4 text-sm text-white/80 leading-relaxed">
          Welcome to CampusQuest (&quot;CampusQuest,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). This Privacy Policy
          explains how we collect, use, store, and protect information when you use CampusQuest.
        </p>
        <p className="mt-2 text-sm text-white/80 leading-relaxed">
          By using CampusQuest, you agree to the practices described in this Privacy Policy.
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
