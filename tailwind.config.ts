import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0f",
        surface: "#111118",
        border: "#2a2a3a",
        primary: "#c0392b",
        secondary: "#d4a017",
        textDefault: "#e8e8f0",
        textMuted: "#6b6b80",
        success: "#1a7a4a",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        serif: ["var(--font-playfair)", "serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      boxShadow: {
        'glow-red': '0 0 8px rgba(192, 57, 43, 0.2)',
        'glow-gold': '0 0 8px rgba(212, 160, 23, 0.2)',
      }
    },
  },
  plugins: [],
};
export default config;
