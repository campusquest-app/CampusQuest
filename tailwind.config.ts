import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        quest: {
          dark: "#1a1b26",
          panel: "#24283b",
          accent: "#7aa2f7",
          gold: "#e0af68",
          green: "#9ece6a",
          red: "#f7768e",
          purple: "#bb9af7",
        },
        cq: {
          app: "#08090C",
          secondary: "#101216",
          card: "#16181D",
          elevated: "#1F2229",
          accent: "#68ABE8",
          "accent-bright": "#7BB8EB",
          foreground: "#F8FAFC",
          muted: "rgba(255,255,255,0.66)",
          subtle: "rgba(255,255,255,0.46)",
          border: "rgba(255,255,255,0.1)",
          nav: "#000000",
        },
        uri: {
          navy: "#08090C",
          keaney: "#68ABE8",
          white: "#FFFFFF",
          "navy-light": "#16181D",
          panel: "#101216",
          card: "#f8fafc",
          accent: "#68ABE8",
          gold: "#c5a028",
          teal: "#00838f",
          green: "#2e7d32",
          purple: "#5e35b1",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "card": "0 2px 8px rgba(4,30,66,0.12), 0 8px 24px -8px rgba(4,30,66,0.18)",
        "keaney": "0 4px 14px -2px rgba(104, 171, 232, 0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
