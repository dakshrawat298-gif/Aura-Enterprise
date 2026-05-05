/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        aura: {
          purple: '#7C3AED',
          violet: '#6D28D9',
          glow: '#A78BFA',
          dark: '#0A0A0F',
          card: 'rgba(255,255,255,0.04)',
        },
      },
      backgroundImage: {
        'aura-gradient': 'radial-gradient(ellipse at top, #1e0a3c 0%, #0A0A0F 60%)',
      },
      boxShadow: {
        glow: '0 0 24px rgba(124, 58, 237, 0.35)',
        'glow-sm': '0 0 12px rgba(124, 58, 237, 0.2)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
