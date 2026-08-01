/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        critical: "#b91c1c",
        high: "#c2410c",
        medium: "#a16207",
        low: "#4b5563",
      },
    },
  },
  plugins: [],
};
