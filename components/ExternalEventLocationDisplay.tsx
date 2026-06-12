import { externalEventLocationLines } from "@/lib/externalEventLocation";

type ExternalEventLocationDisplayProps = {
  venueName?: string | null;
  address?: string | null;
  location?: string | null;
  className?: string;
  compact?: boolean;
};

export function ExternalEventLocationDisplay({
  venueName,
  address,
  location,
  className = "",
  compact = false,
}: ExternalEventLocationDisplayProps) {
  const lines = externalEventLocationLines(venueName, address);
  const venue = lines.venue ?? (location && location !== "Location TBA" ? location : null);
  const street = lines.address;

  if (!venue && !street) {
    return <p className={`text-xs text-white/55 ${className}`.trim()}>Location TBA</p>;
  }

  if (compact) {
    return (
      <p className={`text-xs text-white/65 ${className}`.trim()}>
        {venue ? `📍 ${venue}` : null}
        {venue && street ? " · " : null}
        {street && !venue ? `📍 ${street}` : street}
      </p>
    );
  }

  return (
    <div className={`space-y-0.5 ${className}`.trim()}>
      {venue ? <p className="text-xs text-white/75">📍 {venue}</p> : null}
      {street ? <p className="text-xs text-white/55">{street}</p> : null}
    </div>
  );
}

type ExternalEventLocationDetailProps = {
  venueName?: string | null;
  address?: string | null;
  location?: string | null;
};

export function ExternalEventLocationDetail({
  venueName,
  address,
  location,
}: ExternalEventLocationDetailProps) {
  const lines = externalEventLocationLines(venueName, address);
  const venue = lines.venue ?? (location && location !== "Location TBA" ? location : null);
  const street = lines.address;

  if (!venue && !street) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-white/70">Location</p>
        <p className="text-sm text-white/55">Location TBA</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {venue ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-white/70">Location</p>
          <p className="text-sm text-white/85">{venue}</p>
        </div>
      ) : null}
      {street ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-white/70">Address</p>
          <p className="text-sm text-white/75">{street}</p>
        </div>
      ) : null}
    </div>
  );
}
