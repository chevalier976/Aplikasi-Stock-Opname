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
        primary: {
          DEFAULT: "var(--primary)",      // #4a5d3e
          light: "var(--primary-light)",  // #5c7a4a
          pale: "var(--primary-pale)",    // #f5f7f3
          bg: "var(--primary-bg)",        // #e8ece6
        },
        error: "var(--error)",            // #d32f2f
        warning: {
          DEFAULT: "var(--warning)",      // #fff3cd
          text: "var(--warning-text)",    // #856404
        },
        "text-primary": "var(--text-primary)",    // #333333
        "text-secondary": "var(--text-secondary)", // #888888
        border: "var(--border)",                   // #cccccc
      },
    },
  },
  plugins: [],
};
export default config;
