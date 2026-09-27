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
        // SF Pro on Apple devices, Inter everywhere else.
        heading: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "var(--font-inter)", "system-ui", "sans-serif"],
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "28px",
      },
      boxShadow: {
        soft: "0 8px 32px rgba(0, 33, 69, 0.07)",
        lift: "0 16px 48px rgba(0, 33, 69, 0.14)",
        glow: "0 10px 30px rgba(0, 33, 69, 0.28)",
      },
      maxWidth: {
        app: "440px",
      },
    },
  },
  plugins: [],
};
export default config;
