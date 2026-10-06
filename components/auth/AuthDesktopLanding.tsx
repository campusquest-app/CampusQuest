import Link from "next/link";
import { LEGAL_DOC_LINKS } from "@/lib/legal/policy";
import { CAMPUSQUEST_LOGO_SRC } from "@/lib/branding";
import { BRAND_KNIGHT } from "@/lib/onboarding/taxonomy";

function rememberedLabel(email: string): string {
  const local = email.split("@")[0]?.trim();
  return local || email;
}

export function AuthDesktopBrand() {
  return (
    <aside className="cq-auth-desktop-brand">
      <div className="cq-auth-desktop-brand__logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={CAMPUSQUEST_LOGO_SRC} alt="CampusQuest" width={56} height={56} />
      </div>
      <div className="cq-auth-desktop-brand__stage">
        <h1 className="cq-auth-desktop-headline">
          Discover what&apos;s happening
          <br />
          around <span>your campus.</span>
        </h1>
        <div className="cq-auth-desktop-hero">
          <div className="cq-auth-preview cq-auth-preview--event" aria-hidden>
            <p className="cq-auth-preview__kicker">Tonight</p>
            <p className="cq-auth-preview__title">Campus event</p>
            <p className="cq-auth-preview__detail">See what&apos;s on nearby</p>
          </div>
          <div className="cq-auth-preview cq-auth-preview--quest" aria-hidden>
            <p className="cq-auth-preview__kicker">Quest</p>
            <p className="cq-auth-preview__title">Explore campus</p>
            <p className="cq-auth-preview__detail">A short quest nearby</p>
          </div>
          <div className="cq-auth-preview cq-auth-preview--memory" aria-hidden>
            <p className="cq-auth-preview__kicker">Memory</p>
            <p className="cq-auth-preview__title">Campus memory</p>
            <p className="cq-auth-preview__detail">Shared around the quad</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BRAND_KNIGHT.heroic}
            alt=""
            className="cq-auth-desktop-knight"
            width={520}
            height={520}
            decoding="async"
          />
        </div>
      </div>
    </aside>
  );
}

export function AuthDesktopFooter() {
  return (
    <footer className="cq-auth-desktop-footer">
      <span>CampusQuest</span>
      <Link href={LEGAL_DOC_LINKS.privacy}>Privacy</Link>
      <Link href={LEGAL_DOC_LINKS.terms}>Terms</Link>
      <Link href={LEGAL_DOC_LINKS.support}>Contact</Link>
    </footer>
  );
}

export function AuthDesktopLanding({
  rememberedEmail,
  onContinue,
  onUseAnother,
  onJoin,
  onSignIn,
  onCreateAccount,
}: {
  rememberedEmail: string | null;
  onContinue: () => void;
  onUseAnother: () => void;
  onJoin: () => void;
  onSignIn: () => void;
  onCreateAccount: () => void;
}) {
  const remembered = rememberedEmail?.trim() ?? "";

  return (
    <div className="cq-auth-desktop-frame cq-auth-desktop-frame--landing">
      <AuthDesktopBrand />
      <section className="cq-auth-desktop-stage" aria-label="Join CampusQuest">
        <div className="cq-auth-desktop-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={CAMPUSQUEST_LOGO_SRC}
            alt=""
            className="cq-auth-desktop-panel__mark"
            width={104}
            height={104}
          />
          {remembered ? (
            <>
              <p className="cq-auth-desktop-panel__account">{rememberedLabel(remembered)}</p>
              <button type="button" className="cq-auth-landing-btn cq-auth-landing-btn--primary" onClick={onContinue}>
                Continue
              </button>
              <button type="button" className="cq-auth-landing-btn cq-auth-landing-btn--muted" onClick={onUseAnother}>
                Use another account
              </button>
            </>
          ) : (
            <>
              <h2 className="cq-auth-desktop-panel__title">Welcome to CampusQuest</h2>
              <button type="button" className="cq-auth-landing-btn cq-auth-landing-btn--primary" onClick={onJoin}>
                Join CampusQuest
              </button>
              <p className="cq-auth-desktop-panel__switch">
                Already have an account?{" "}
                <button type="button" className="cq-auth-desktop-panel__link" onClick={onSignIn}>
                  Sign in
                </button>
              </p>
            </>
          )}
          <div className="cq-auth-desktop-panel__rule" aria-hidden />
          <button type="button" className="cq-auth-landing-btn cq-auth-landing-btn--outline" onClick={onCreateAccount}>
            Create new account
          </button>
        </div>
      </section>
      <AuthDesktopFooter />
    </div>
  );
}
