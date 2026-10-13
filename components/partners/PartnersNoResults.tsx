import { SearchX } from "lucide-react";

export function PartnersNoResults({ searching }: { searching: boolean }) {
  return (
    <div className="cq-partners-empty" role="status">
      <SearchX className="cq-partners-empty__icon" aria-hidden strokeWidth={2} />
      <p className="cq-partners-empty__title">No partners found</p>
      <p className="cq-partners-empty__body">{searching ? "Try a different search." : "Check back soon."}</p>
    </div>
  );
}
