/**
 * Runs at most one async task at a time. Calls made while a task is pending are
 * ignored, so a rapid double tap cannot fire two requests (a React state flag
 * alone only updates after the next render).
 *
 * Synchronous tasks never mark the flight busy. Rejections are swallowed here —
 * the task owns its own error handling (toasts, retry copy).
 */
export function createSingleFlight(onBusyChange?: (busy: boolean) => void) {
  let busy = false;
  return {
    isBusy: () => busy,
    run(task: () => void | PromiseLike<void>): Promise<void> | undefined {
      if (busy) return undefined;
      const result = task();
      if (!result || typeof (result as PromiseLike<void>).then !== "function") return undefined;
      busy = true;
      onBusyChange?.(true);
      return Promise.resolve(result)
        .catch(() => undefined)
        .finally(() => {
          busy = false;
          onBusyChange?.(false);
        });
    },
  };
}
