import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Phase 1 Capacitor shell — loads the live production CampusQuest web app.
 * The Next.js source of truth remains at the repository root; do not copy it here.
 */
const config: CapacitorConfig = {
  appId: "com.nicklockhart.campusquest",
  appName: "CampusQuest",
  webDir: "www",
  server: {
    // Live production app (Vercel). Not a local static export.
    url: "https://campusquestapp.com",
    cleartext: false,
    /**
     * Hosts that may navigate inside the WebView.
     * Anything else (Maps, mailto, Instagram, etc.) opens externally
     * instead of trapping navigation in the shell.
     */
    allowNavigation: [
      "campusquestapp.com",
      "*.campusquestapp.com",
      "*.supabase.co",
      "supabase.co",
    ],
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 0,
      backgroundColor: "#07111f",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#07111f",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
