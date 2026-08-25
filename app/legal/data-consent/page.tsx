const sections: Array<{
  title: string;
  intro?: string;
  body: string[];
}> = [
  {
    title: "How We Use Your Information",
    intro: "Information you provide may be used to:",
    body: [
      "Personalize your CampusQuest experience.",
      "Recommend relevant events, organizations, activities, and opportunities.",
      "Understand how students use CampusQuest.",
      "Improve CampusQuest features, recommendations, and services.",
      "Analyze overall engagement and usage trends.",
    ],
  },
  {
    title: "Your Data",
    body: [
      "CampusQuest takes reasonable measures to protect the information you provide.",
      "Your information will be handled according to the CampusQuest Privacy Policy.",
      "We will not sell your personal information.",
      "We may use service providers that help us operate CampusQuest, including hosting, authentication, email, analytics, and other technology services. Their handling of information is governed by our Privacy Policy and applicable agreements.",
    ],
  },
  {
    title: "AI & Personalized Recommendations",
    body: [
      "Some CampusQuest recommendations may be generated or assisted by automated or AI-based systems.",
      "These recommendations are suggestions. They do not guarantee that an event, organization, activity, or opportunity will be available or appropriate for you.",
    ],
  },
  {
    title: "Beta Service",
    body: [
      "CampusQuest is currently being developed and tested.",
      "Features may change, and occasional technical issues may occur. We continue to work to improve the reliability and security of the platform.",
    ],
  },
  {
    title: "Your Choices",
    intro: "You may:",
    body: [
      "Choose whether to provide optional questionnaire information.",
      "Update certain profile information.",
      "Ignore or decline recommendations.",
      "Stop using CampusQuest at any time.",
      "Request access to or deletion of your account and associated personal information, subject to legal or operational retention requirements described in our Privacy Policy.",
      "Withdraw consent for optional personalization where applicable.",
    ],
  },
  {
    title: "Data Retention",
    body: [
      "CampusQuest retains personal information only for as long as reasonably necessary for the purposes described in our Privacy Policy, including operating the service, maintaining security, meeting legal obligations, resolving disputes, and enforcing agreements.",
      "Account deletion requests will be handled according to the deletion process and retention periods described in the CampusQuest Privacy Policy.",
    ],
  },
  {
    title: "Questions",
    body: [
      "Questions about your information or this consent can be sent to the CampusQuest support or privacy contact listed in our Privacy Policy.",
    ],
  },
  {
    title: "Agreement",
    intro: "By selecting I Agree, I confirm that:",
    body: [
      "I have read and understood this Data & Personalization Consent.",
      "I understand how information I provide may be used for personalization and improvement of CampusQuest.",
      "I agree to the processing described above, subject to the CampusQuest Privacy Policy and Terms of Service.",
    ],
  },
];

export default function DataPersonalizationConsentPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12 sm:pb-16">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Data & Personalization Consent</h1>
        <p className="mt-2 text-sm text-white/70">Effective Date: August 25, 2026</p>
        <p className="mt-4 text-sm text-white/80 leading-relaxed">
          Please read this before continuing.
        </p>
        <p className="mt-2 text-sm text-white/80 leading-relaxed">
          CampusQuest uses information you provide during onboarding and questionnaires to personalize your
          experience, including recommending events, organizations, activities, and opportunities that may match
          your interests.
        </p>
        <p className="mt-2 text-sm text-white/80 leading-relaxed">
          Participation in these questionnaires is voluntary.
        </p>

        <div className="mt-6 space-y-6">
          {sections.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-base sm:text-lg font-semibold text-white">{section.title}</h2>
              {section.intro ? <p className="text-sm text-white/75 leading-relaxed">{section.intro}</p> : null}
              <ul className="space-y-2 text-sm text-white/75 leading-relaxed">
                {section.body.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {section.title === "How We Use Your Information" ? (
                <p className="text-sm text-white/75 leading-relaxed">
                  Where practical, CampusQuest may use aggregated or de-identified information for analytics and
                  product improvement.
                </p>
              ) : null}
              {section.title === "Your Choices" ? (
                <p className="text-sm text-white/75 leading-relaxed">
                  Withdrawing consent may limit personalized features that depend on this information.
                </p>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
