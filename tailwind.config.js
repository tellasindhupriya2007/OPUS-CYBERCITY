/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./thank-you.html", "./brochure.js"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "surface": "#0B0B0B",
        "surface-dim": "#111111",
        "surface-high": "#161616",
        "surface-card": "#161616",
        "surface-elevated": "#1C1C1C",
        "primary": "#F7F5F0",
        "on-dark": "#F7F5F0",
        "secondary": "#BDBAB4",
        "muted": "#7A7873",
        "accent": "#D4AF37",
        "accent-champagne": "#E5C89C",
        "border-hairline": "#242424",
        "border-subtle": "#2E2E2E"
      },
      fontFamily: {
        cinzel: ["Source Serif 4", "serif"],
        serif: ["Source Serif 4", "serif"],
        editorial: ["Source Serif 4", "serif"],
        sans: ["Source Sans 3", "sans-serif"]
      }
    }
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/container-queries")
  ]
};
