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
    // Never: the web UI applies env(safe-area-inset-*) once in CSS (TopNav).
    // "automatic" double-applies the top inset and lets WKWebView rubber-band
    // the document under the status bar, which opens a blank strip above the
    // fixed Home header when scrolling back to the top.
    contentInset: "never",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  plugins: {
        SplashScreen: {
          launchAutoHide: true,
          launchShowDuration: 3000,
          backgroundColor: "#041E42",
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
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
