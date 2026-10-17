import Link from "next/link";
import { LEGAL_DOC_LINKS } from "@/lib/legal/policy";
import { CAMPUSQUEST_LOGO_SRC } from "@/lib/branding";
import { BRAND_KNIGHT } from "@/lib/onboarding/taxonomy";

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
