/** Total time for progress to ease 0 → 100% (smooth cubic ease-in-out). */
export const SPLASH_PROGRESS_MS = 5800;

/** Brief dwell at 100% so completion leap + FX read before fade. */
export const SPLASH_COMPLETE_DWELL_MS = 680;

export const SPLASH_FADEOUT_MS = 800;

/** Ease-in-out cubic — smooth start and finish, no abrupt jumps. */
export function splashProgressEase(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}
