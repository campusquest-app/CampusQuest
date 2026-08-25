"use client";

export function RealmArrivalCard({
  campusName,
  eventCount,
  placeCount,
  liveCount,
  dataReady,
  onExploreForYou,
  onViewFeed,
}: {
  campusName: string;
  eventCount: number;
  placeCount: number;
  liveCount: number;
  dataReady: boolean;
  onExploreForYou: () => void;
  onViewFeed: () => void;
}) {
  const counts: string[] = [];
  if (dataReady && eventCount > 0) counts.push(`${eventCount} event${eventCount === 1 ? "" : "s"} for you`);
  if (dataReady && placeCount > 0) counts.push(`${placeCount} place${placeCount === 1 ? "" : "s"} to explore`);
  if (dataReady && liveCount > 0) counts.push(`${liveCount} happening now`);

  return (
    <aside className="cq-realm-arrival" role="dialog" aria-labelledby="cq-realm-arrival-title">
      <p className="cq-realm-arrival__eyebrow">Welcome to {campusName}</p>
      <h2 id="cq-realm-arrival-title" className="cq-realm-arrival__title">
        CampusQuest found things happening around campus based on your interests.
      </h2>
      {counts.length > 0 ? (
        <ul className="cq-realm-arrival__counts">
          {counts.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div className="cq-realm-arrival__actions">
        <button type="button" className="cq-realm-arrival__primary" onClick={onExploreForYou}>
          Explore For You
        </button>
        <button type="button" className="cq-realm-arrival__secondary" onClick={onViewFeed}>
          View Feed
        </button>
      </div>
    </aside>
  );
}
