"use client";

import { useCountUp } from "@/lib/client/useCountUp";

type StatItem = {
  label: string;
  value: string | number;
  loading?: boolean;
  onClick?: () => void;
};

function StatValue({ value }: { value: string | number }) {
  const numeric = typeof value === "number";
  const animated = useCountUp(numeric ? value : 0);
  const display = numeric ? animated.toLocaleString() : value;
  return <span className="cq-profile-stat-value font-display tabular-nums">{display}</span>;
}

function StatSegment({ item }: { item: StatItem }) {
  const content = (
    <>
      {item.loading ? (
        <span className="cq-skeleton mx-auto block h-6 w-9 rounded" aria-hidden />
      ) : (
        <StatValue value={item.value} />
      )}
      <span className="cq-profile-stat-label">{item.label}</span>
    </>
  );

  if (item.onClick) {
    return (
      <button
        type="button"
        onClick={item.onClick}
        className="cq-profile-stat cq-profile-press min-w-0 flex-1"
      >
        {content}
      </button>
    );
  }

  return <div className="cq-profile-stat min-w-0 flex-1">{content}</div>;
}

export function ProfileStatsRow({ items }: { items: StatItem[] }) {
  return (
    <div className="cq-profile-stats cq-profile-fade-in">
      {items.map((item) => (
        <StatSegment key={item.label} item={item} />
      ))}
    </div>
  );
}
