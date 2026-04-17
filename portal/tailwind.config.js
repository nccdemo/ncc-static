import nccPreset from "../shared/tailwind-ncc-preset.js";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [nccPreset],
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
