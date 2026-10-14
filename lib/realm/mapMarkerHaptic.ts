/** Light tap feedback when selecting a map marker (mobile). */
export function vibrateMapMarkerTap(): void {
  void import("@/lib/client/capacitorNative").then(({ nativeImpact }) => {
    void nativeImpact("light");
  }).catch(() => {
    void import("@/lib/client/hapticsPreference").then(({ pulseHaptic }) => {
      pulseHaptic(10);
    });
  });
}
