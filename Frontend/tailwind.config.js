/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        'echo-dark': '#0a0a1a',
        'echo-navy': '#1a1a2e',
        'echo-card': '#16213e',
        'echo-purple': '#a855f7',
        'echo-purple-light': '#c084fc',
        'echo-teal': '#14b8a6',
        'echo-teal-light': '#2dd4bf',
        'echo-gold': '#fbbf24',
      },
    },
  },
  plugins: [],
}
