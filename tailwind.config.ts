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
          app: "#060A12",
          secondary: "#0C111B",
          card: "#121824",
          elevated: "#181F2C",
          accent: "#68ABE8",
          "accent-bright": "#7BB8EB",
          muted: "rgba(255, 255, 255, 0.55)",
          subtle: "rgba(255, 255, 255, 0.38)",
        },
        uri: {
          navy: "#041E42",
          keaney: "#68ABE8",
          white: "#FFFFFF",
          "navy-light": "#102A5C",
          panel: "#0D234F",
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
        "card": "0 4px 24px -4px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.05)",
        "keaney": "0 4px 14px -2px rgba(104, 171, 232, 0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
