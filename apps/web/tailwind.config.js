/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral scale — cool graphite, not warm/cream. This is a precision
        // instrument reading out defects, not a lifestyle brand.
        ink: {
          DEFAULT: "#12151B",
          soft: "#2A2F3A",
          faint: "#5B6472",
        },
        paper: "#F5F6F4",
        surface: "#FFFFFF",
        line: {
          DEFAULT: "#E1E4DF",
          strong: "#C7CBC4",
        },
        // Brand/interaction signal — a calibration-instrument teal, used for
        // focus states, links, "healthy" indicators, and the corner-bracket
        // viewfinder motif. Deliberately not the cream+terracotta default.
        signal: {
          DEFAULT: "#14B8A6",
          soft: "#CCF3EE",
          ink: "#0B7A6E",
        },
        // Defect-severity ramp — desaturated and instrument-like rather than
        // playground-bright, so four severities stay legible side by side.
        critical: { DEFAULT: "#D1293D", soft: "#FBE2E5", ink: "#8A1526" },
        high: { DEFAULT: "#C2703D", soft: "#F7E7DA", ink: "#7A4522" },
        medium: { DEFAULT: "#A98B2C", soft: "#F3EDD6", ink: "#6B5919" },
        low: { DEFAULT: "#5B6472", soft: "#E9EAEC", ink: "#3A4048" },
      },
      fontFamily: {
        // System stacks (no build-time webfont fetch — robust across any
        // deploy target) but used deliberately: a tracked, heavier
        // sans-serif for display/eyebrow text, and true monospace for every
        // data readout — scores, selectors, confidence, timestamps. The
        // mono/sans split does the job a second typeface family would.
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "4px",
        lg: "10px",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(18,21,27,0.04), 0 1px 1px rgba(18,21,27,0.03)",
        raised: "0 8px 24px -8px rgba(18,21,27,0.18)",
      },
      keyframes: {
        sweep: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.35 },
        },
      },
      animation: {
        sweep: "sweep 1.8s ease-in-out infinite",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
