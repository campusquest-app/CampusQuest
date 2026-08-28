"use client";

import { useEffect, useState } from "react";
import { trackOnboardingEvent } from "@/lib/client/onboardingAnalytics";

const STEPS = [
  {
    id: "explore",
    title: "Explore your campus",
    body: "Events, organizations, and places appear around you.",
  },
  {
    id: "foryou",
    title: "Made for you",
    body: "CampusQuest uses your interests and campus connections to surface recommendations you’ll actually care about.",
  },
  {
    id: "ready",
    title: "You’re ready",
    body: "Explore the Realm or see what’s happening today.",
  },
] as const;

export function RealmIntroCoach({
  visible,
  onComplete,
  onSkip,
}: {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setIndex(0);
    trackOnboardingEvent({ eventName: "realm_intro_started" });
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onSkip]);

  if (!visible) return null;

  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  return (
    <div className="cq-realm-intro-slot" role="dialog" aria-labelledby="cq-realm-intro-title" aria-modal="false">
      <aside className="cq-realm-intro">
        <p className="cq-realm-intro__eyebrow">
          {index + 1} of {STEPS.length}
        </p>
        <h2 id="cq-realm-intro-title" className="cq-realm-intro__title">
          {step.title}
        </h2>
        <p className="cq-realm-intro__body">{step.body}</p>
        <div className="cq-realm-intro__dots" aria-hidden>
          {STEPS.map((item, i) => (
            <span key={item.id} className={i === index ? "cq-realm-intro__dot cq-realm-intro__dot--active" : "cq-realm-intro__dot"} />
          ))}
        </div>
        <div className="cq-realm-intro__actions">
          <button type="button" className="cq-realm-intro__skip" onClick={onSkip}>
            Skip
          </button>
          <button
            type="button"
            className="cq-realm-intro__primary"
            onClick={() => {
              if (last) {
                onComplete();
                return;
              }
              setIndex((current) => Math.min(current + 1, STEPS.length - 1));
            }}
          >
            {last ? "Start exploring" : "Next"}
          </button>
        </div>
      </aside>
    </div>
  );
}
