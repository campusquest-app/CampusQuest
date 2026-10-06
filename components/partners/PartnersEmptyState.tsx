import { Handshake } from "lucide-react";

export function PartnersEmptyState() {
  return (
    <section className="cq-partners-empty" aria-labelledby="cq-partners-empty-title">
      <span className="cq-partners-empty__icon" aria-hidden>
        <Handshake className="h-8 w-8" strokeWidth={2} />
      </span>
      <h2 id="cq-partners-empty-title" className="cq-partners-empty__title">
        Local quests are coming soon
      </h2>
      <p className="cq-partners-empty__body">
        CampusQuest is partnering with local businesses to bring students exclusive quests, discounts, rewards, and
        special events.
      </p>
      <p className="cq-partners-empty__hint">Check back soon for the first CampusQuest Partners.</p>
    </section>
  );
}
