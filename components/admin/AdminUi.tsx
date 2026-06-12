"use client";

export function AdminKpiCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div className={`cq-admin-kpi cq-admin-kpi--${tone}`}>
      <p className="cq-admin-kpi__value">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="cq-admin-kpi__label">{label}</p>
      {hint ? <p className="cq-admin-kpi__hint">{hint}</p> : null}
    </div>
  );
}

export function AdminQuickAction({
  label,
  onClick,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "primary" | "danger";
}) {
  return (
    <button type="button" onClick={onClick} className={`cq-admin-action cq-admin-action--${tone}`}>
      {label}
    </button>
  );
}

export function AdminTabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; badge?: number }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="cq-admin-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`cq-admin-tab ${active === tab.id ? "cq-admin-tab--active" : ""}`}
        >
          {tab.label}
          {tab.badge != null && tab.badge > 0 ? (
            <span className="cq-admin-tab__badge">{tab.badge > 99 ? "99+" : tab.badge}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function AdminSectionIntro({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4 space-y-1">
      <h2 className="font-display text-xl font-semibold text-white">{title}</h2>
      <p className="text-sm text-white/55">{description}</p>
    </div>
  );
}

export function AdminPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`cq-admin-panel ${className}`.trim()}>{children}</div>;
}

export function AdminStatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return <span className={`cq-admin-pill cq-admin-pill--${tone}`}>{label}</span>;
}
