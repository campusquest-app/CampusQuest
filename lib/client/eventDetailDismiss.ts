/**
 * Event detail back navigation helpers.
 * Closing must feel instantaneous: hide the overlay in the same turn as the tap,
 * restore document scroll locking, and guard against duplicate dismissals.
 * Do not await network, images, or animation before calling `onBack`.
 */

export type EventDetailDismissHandle = {
  /** Synchronously dismiss; safe to call repeatedly. */
  dismiss: () => void;
  /** True after the first successful dismiss. */
  wasDismissed: () => boolean;
};

export function createEventDetailDismissHandle(args: {
  getSurface: () => HTMLElement | null;
  onBack: () => void;
  /** Overflow value to restore on `document.body` (captured when the overlay locked scroll). */
  getPreviousBodyOverflow: () => string;
}): EventDetailDismissHandle {
  let dismissed = false;

  return {
    wasDismissed: () => dismissed,
    dismiss: () => {
      if (dismissed) return;
      dismissed = true;

      const surface = args.getSurface();
      if (surface) {
        // Reveal the screen underneath before React unmounts the portal.
        surface.style.visibility = "hidden";
        surface.style.pointerEvents = "none";
        surface.setAttribute("aria-hidden", "true");
        surface.setAttribute("data-cq-event-detail-dismissed", "true");
      }

      if (typeof document !== "undefined") {
        document.body.style.overflow = args.getPreviousBodyOverflow();
      }

      args.onBack();
    },
  };
}
