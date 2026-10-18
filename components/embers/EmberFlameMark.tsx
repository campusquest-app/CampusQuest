"use client";

import { EMBER_COLOR_ACTIVE, EMBER_COLOR_DEEP, EMBER_COLOR_HIGHLIGHT } from "@/lib/embers";

export function EmberFlameMark({
  size = 28,
  consume = false,
}: {
  size?: number;
  consume?: boolean;
}) {
  return (
    <svg
      className={`cq-ember-mark ${consume ? "cq-ember-mark--consume" : ""}`}
      width={size}
      height={Math.round(size * 1.25)}
      viewBox="0 0 32 40"
      fill="none"
      aria-hidden
    >
      <path
        d="M16 2.2C13.2 8.4 7.8 13.1 7.8 21.2c0 6.2 3.8 11.6 8.2 11.6s8.2-5.4 8.2-11.6C24.2 13.1 18.8 8.4 16 2.2Z"
        fill={EMBER_COLOR_DEEP}
        opacity="0.42"
      />
      <path
        d="M16 5.4c-2.3 5.1-6.4 8.8-6.4 15.2 0 4.8 2.8 8.8 6.4 8.8s6.4-4 6.4-8.8c0-6.4-4.1-10.1-6.4-15.2Z"
        fill={EMBER_COLOR_ACTIVE}
      />
      <path
        d="M16 11.2c-1.3 3.2-3.4 5.5-3.4 9.2 0 2.8 1.5 5 3.4 5s3.4-2.2 3.4-5c0-3.7-2.1-6-3.4-9.2Z"
        fill={EMBER_COLOR_HIGHLIGHT}
        opacity="0.92"
      />
    </svg>
  );
}
