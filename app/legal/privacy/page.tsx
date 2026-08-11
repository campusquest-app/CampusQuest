const sections = [
  {
    title: "1. Information We Collect",
    body: [
      "Account & profile: name, email address, school/university affiliation, username, profile photo, and other profile fields you choose to provide.",
      "User-generated content: posts, comments, campus memories, messages, organization content, event RSVPs, reports, and similar content you create or share.",
      "Device & technical information: IP address, device/browser type, approximate login and session activity, and app version. When you use the iOS app and enable push notifications, we store an Apple Push Notification device token associated with your account.",
      "Media permissions: if you grant access, CampusQuest may use your device camera, microphone, and photo library so you can capture or upload photos and videos for posts, campus memories, profile media, QR scanning, and voice messages.",
      "Location information: if you grant permission, we use location while the app is in use for The Realm campus map, nearby quests/check-ins, directions, and placing campus events. We do not request background location.",
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
      "We use service providers to operate CampusQuest, including Supabase (authentication, database, and media storage), Google Maps / Google geocoding (map and location features), Apple Push Notification service (optional iOS alerts), and hosting providers that run our web application.",
      "Information may also be shared with universities/campus partners when necessary for campus programs, with law enforcement when legally required, and as needed to protect safety and enforce our Terms and Community Guidelines.",
      "Organization and event information may include content synced from public campus sources such as URInvolved. CampusQuest is an independent student product and is not an official University of Rhode Island application.",
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
      "You may also request deletion by emailing support@campusquest.app from the address on your account.",
      "Account deletion removes your profile and associated account data from our primary systems. Some information may be retained when legally required or needed for safety, fraud prevention, or dispute resolution. Media objects stored with our providers may take additional time to fully purge from backups.",
    ],
  },
  {
    title: "8. Children’s Privacy",
    body: ["CampusQuest is not intended for children under 13 and does not knowingly collect personal information from children under 13."],
  },
  {
    title: "9. Changes to This Policy",
    body: ["We may update this policy periodically. Continued use after updates constitutes acceptance of the revised policy. Material updates may ask you to re-accept the latest Terms, Privacy Policy, and Community Guidelines."],
  },
  {
    title: "10. Contact Information",
    body: ["For privacy-related questions: support@campusquest.app"],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12 sm:pb-16">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-white/70">Effective Date: August 11, 2026</p>
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
