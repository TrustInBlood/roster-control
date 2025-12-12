/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Discord-inspired colors
        discord: {
          dark: '#1e1f22',
          darker: '#111214',
          light: '#313338',
          lighter: '#404249',
          blurple: '#5865f2',
          green: '#3ba55c',
          yellow: '#faa61a',
          red: '#ed4245',
        },
      },
    },
  },
  plugins: [],
}
