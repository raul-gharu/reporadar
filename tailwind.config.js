/** @type {import('tailwindcss').Config} */
const c = (v) => `hsl(var(--${v}) / <alpha-value>)`;
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"), surface: c("surface"), "surface-2": c("surface-2"), border: c("border"),
        ink: c("text"), muted: c("muted"), faint: c("faint"),
        accent: c("accent"), "accent-fg": c("accent-fg"), "accent-soft": c("accent-soft"),
        pos: c("pos"), neg: c("neg"), warn: c("warn"), "warn-soft": c("warn-soft"), info: c("info"), "info-soft": c("info-soft"),
      },
      fontFamily: {
        sans: ["Satoshi", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["'Cabinet Grotesk'", "Satoshi", "ui-sans-serif", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: { card: "14px" },
      maxWidth: { page: "1200px" },
    },
  },
  plugins: [],
};
