import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./domains/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "var(--color-brand-primary)",
          accent: "var(--color-brand-accent)",
          surface: "var(--color-brand-surface)",
        },
        semantic: {
          success: "var(--color-semantic-success)",
          warning: "var(--color-semantic-warning)",
          error: "var(--color-semantic-error)",
          info: "var(--color-semantic-info)",
        },
        status: {
          pending: "var(--color-status-pending)",
          provisioning: "var(--color-status-provisioning)",
          active: "var(--color-status-active)",
          suspended: "var(--color-status-suspended)",
          failed: "var(--color-status-failed)",
        },
      },
      borderRadius: {
        "card-lg": "var(--radius-card-lg)",
        "card-md": "var(--radius-card-md)",
        "pill": "var(--radius-pill)",
      },
      fontFamily: {
        sans: ["var(--font-body)", "Sora", "Segoe UI", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Fraunces", "Sora", "system-ui", "serif"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        panel: "var(--shadow-panel)",
      },
    },
  },
  plugins: [],
} satisfies Config;
