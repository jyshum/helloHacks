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
        ivory: "#F6F3EC",
        ink: "#1C2430",
        navy: "#0E3A5F",
        amber: "#E2A63B",
        green: "#3F7D58",
        clay: "#7C5B3D",
        muted: "#8A8578",
        line: "#E6E1D4",
      },
      fontFamily: {
        heading: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: {
        card: "20px",
      },
      boxShadow: {
        soft: "0 4px 20px rgba(28, 36, 48, 0.08)",
        lift: "0 8px 30px rgba(28, 36, 48, 0.12)",
      },
      maxWidth: {
        app: "440px",
      },
    },
  },
  plugins: [],
};
export default config;
