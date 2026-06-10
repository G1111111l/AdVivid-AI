import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Arial", "sans-serif"]
      },
      colors: {
        ink: "#1f2933",
        mist: "#f6f7f9",
        line: "#d8dee7",
        pine: "#2c6e49",
        coral: "#c2410c",
        plum: "#6d28d9",
        teal: "#0f766e"
      }
    }
  },
  plugins: []
} satisfies Config;
