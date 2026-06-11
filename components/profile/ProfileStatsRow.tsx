"use client";

type StatItem = {
  label: string;
  value: string | number;
  loading?: boolean;
  onClick?: () => void;
};

function StatSegment({ item }: { item: StatItem }) {
  const content = (
    <>
      {item.loading ? (
        <span className="cq-skeleton mx-auto block h-5 w-8 rounded" aria-hidden />
      ) : (
        <span className="font-display text-base font-bold tabular-nums text-cq-foreground sm:text-lg">{item.value}</span>
      )}
      <span className="mt-0.5 block text-[11px] font-medium text-cq-muted">{item.label}</span>
    </>
  );

  if (item.onClick) {
    return (
      <button type="button" onClick={item.onClick} className="min-w-0 flex-1 px-2 py-1 text-center transition active:opacity-70">
        {content}
      </button>
    );
  }

  return <div className="min-w-0 flex-1 px-2 py-1 text-center">{content}</div>;
}

export function ProfileStatsRow({ items }: { items: StatItem[] }) {
  return (
    <div className="cq-profile-stats flex items-center justify-center border-y px-1 py-2">
      {items.map((item, index) => (
        <div key={item.label} className="flex min-w-0 flex-1 items-center">
          {index > 0 ? <span className="mx-1 h-8 w-px flex-shrink-0 bg-cq-border" aria-hidden /> : null}
          <StatSegment item={item} />
        </div>
      ))}
    </div>
  );
}
