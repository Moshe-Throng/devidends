import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          cyan: "#27ABD2",
          teal: "#24CFD6",
          dark: "#212121",
          black: "#000000",
          white: "#FFFFFF",
        },
        cyan: {
          50: "#ECFAFD",
          100: "#D0F3FB",
          200: "#A1E7F7",
          300: "#6DD8F1",
          400: "#3BC4E6",
          500: "#27ABD2",
          600: "#1E8BAB",
          700: "#176B84",
          800: "#114C5E",
          900: "#0A2D38",
          950: "#061A21",
        },
        teal: {
          50: "#ECFDFC",
          100: "#D0FAF8",
          200: "#A1F5F1",
          300: "#6DEED8",
          400: "#24CFD6",
          500: "#1DB2B8",
          600: "#178F94",
          700: "#126D70",
          800: "#0C4A4D",
          900: "#07292B",
          950: "#041819",
        },
        dark: {
          50: "#F5F5F5",
          100: "#E8E8E8",
          200: "#D1D1D1",
          300: "#B0B0B0",
          400: "#888888",
          500: "#6D6D6D",
          600: "#5D5D5D",
          700: "#4F4F4F",
          800: "#3D3D3D",
          900: "#212121",
          950: "#121212",
        },
      },
      fontFamily: {
        sans: ["var(--font-montserrat)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
