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
        // UBC palette. Driver = ubc (dark blue), rider = sky (bright blue).
        paper: "#F5F8FC", // app background
        ink: "#0B1B2E", // text
        ubc: "#002145", // UBC Blue, primary + driver
        blue: "#0055B7", // UBC secondary blue, links + focus
        sky: "#00A7E1", // UBC light blue, rider accent + CTA
        frost: "#E6F1FA", // pale blue fills
        green: "#2E7D5B", // success + trust
        muted: "#6B7C93", // secondary text
        line: "#DCE4EE", // borders
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
