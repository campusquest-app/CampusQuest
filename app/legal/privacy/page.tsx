const sections = [
  {
    title: "1. Information We Collect",
    body: [
      "Account & profile: name, email address, school/university affiliation, username, profile photo, and other profile fields you choose to provide. We also store the graduation year, major or academic area, interests, and communities you choose during onboarding or Settings, plus an optional profile bio and photo.",
      "User-generated content: posts, comments, campus memories, messages, organization content, event RSVPs, reports, and similar content you create or share.",
      "Device & technical information: IP address, device/browser type, approximate login and session activity, and app version. When you use the iOS app and enable push notifications, we store an Apple Push Notification device token associated with your account. We do not collect advertising identifiers such as IDFA.",
      "Media permissions: if you grant access, CampusQuest may use your camera, microphone, and photo library so you can capture or upload photos and videos for Quad posts, campus memories, profile media, and optional voice notes in direct messages.",
      "Location information: if you grant permission, we use your precise location only while the app is in use to show your position on The Realm campus map and to request walking or driving directions from Google Maps. We do not request background location, do not store a history of your GPS coordinates, and the map works if you decline. Campus event and business pins use public place coordinates, not your device location.",
      "We do not currently process payments inside CampusQuest. If payment features are added later, this policy will be updated before those features launch.",
    ],
  },
  {
    title: "2. How We Use Your Information",
    body: [
      "Provide and improve CampusQuest, create and manage accounts, personalize campus experiences, facilitate student connections, deliver in-app and optional push notifications, prevent fraud and abuse, communicate product updates, and operate moderation and safety tools.",
    ],
  },
  {
    title: "3. Service Providers & Sharing",
    body: [
      "We do not sell personal information.",
      "We use service providers to operate CampusQuest, including Supabase (authentication, database, and media storage), Vercel (application hosting and operational logs), Resend (transactional email such as campus verification codes), Google Maps / Google geocoding (map tiles, directions, and campus place lookup), and Apple Push Notification service (optional iOS alerts).",
      "Campus event listings may include information imported from public campus calendars such as URInvolved. We do not send your profile, messages, or location history to the university. CampusQuest is an independent student product and is not an official University of Rhode Island application.",
      "Some event or organization pages may embed videos from YouTube’s privacy-enhanced player. Playing an embed may cause your device to communicate directly with Google/YouTube. CampusQuest does not send your profile or account identity with that embed.",
      "We may share information with law enforcement when legally required, and as needed to protect safety and enforce our Terms and Community Guidelines.",
      "If you block someone, they cannot send you new messages. Existing conversation history remains visible to the participants who already had access. Administrators may review reported message content to moderate abuse.",
    ],
  },
  {
    title: "4. Local Storage & Session Persistence",
    body: [
      "CampusQuest uses browser/app local storage (not advertising cookies) to keep you signed in, remember preferences, and store limited client-side game or onboarding state.",
      "We do not use third-party advertising or product-analytics SDKs (such as Google Analytics) in the current product. Platform administrators may review first-party operational metrics necessary to run the service.",
    ],
  },
  {
    title: "5. Data Security",
    body: [
      "We use reasonable safeguards including secure authentication, HTTPS encryption, restricted administrative access, and security monitoring.",
      "No system is completely secure, and absolute security cannot be guaranteed.",
    ],
  },
  {
    title: "6. User Content",
    body: ["Users are responsible for posted/shared content. CampusQuest may remove content that violates policy."],
  },
  {
    title: "7. Account Deletion",
    body: [
      "You can delete your account in the app under Settings → Delete account.",
      "You may also request deletion by emailing support@campusquestapp.com from the address on your account.",
      "Deleting your account removes your login and associated account information from our active systems, including user-generated media we control, subject to limited retention in provider backups and records we must retain for security, fraud prevention, legal, or auditing purposes.",
    ],
  },
  {
    title: "8. Children’s Privacy",
    body: [
      "CampusQuest is not intended for children under 13. We do not collect date of birth as part of standard signup. Users must meet the age requirements stated in our Terms.",
    ],
  },
  {
    title: "9. Changes to This Policy",
    body: [
      "We may update this policy periodically. Continued use after updates constitutes acceptance of the revised policy. Material updates may ask you to re-accept the latest Terms, Privacy Policy, and Community Guidelines.",
    ],
  },
  {
    title: "10. Contact Information",
    body: ["For privacy-related questions: support@campusquestapp.com"],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12 sm:pb-16">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-white/70">Effective Date: October 15, 2026</p>
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
