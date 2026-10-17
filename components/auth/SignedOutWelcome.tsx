import { CAMPUSQUEST_LOGO_ALT, CAMPUSQUEST_LOGO_SRC } from "@/lib/branding";

/** Canonical signed-out entry for web and native. */
export function SignedOutWelcome({
  onGetStarted,
  onSignIn,
}: {
  onGetStarted: () => void;
  onSignIn: () => void;
}) {
  return (
    <section className="cq-entry" aria-label="CampusQuest">
      <div className="cq-entry__glow" aria-hidden />
      <div className="cq-entry__panel">
        <div className="cq-entry__brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- official crest must keep its colors */}
          <img
            src={CAMPUSQUEST_LOGO_SRC}
            alt={CAMPUSQUEST_LOGO_ALT}
            className="cq-entry__crest"
            width={512}
            height={512}
            decoding="async"
          />
          <p className="cq-entry__wordmark" aria-hidden>
            <span className="cq-entry__wordmark-campus">CAMPUS</span>
            <span className="cq-entry__wordmark-quest">QUEST</span>
          </p>
        </div>
        <h1 className="cq-entry__headline">
          Your campus.
          <br />
          Your community.
          <br />
          <span className="cq-entry__headline-accent">Your adventure.</span>
        </h1>
        <p className="cq-entry__support">
          Discover events, connect with students, and make the most of college life.
        </p>
        <div className="cq-entry__actions">
          <button type="button" className="cq-entry__cta" onClick={onGetStarted}>
            Get Started <span aria-hidden>→</span>
          </button>
          <button type="button" className="cq-entry__signin" onClick={onSignIn}>
            Sign In
          </button>
        </div>
      </div>
    </section>
  );
}
