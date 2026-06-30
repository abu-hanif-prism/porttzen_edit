/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:     '#0A0C14',
        bg2:    '#10121E',
        bg3:    '#181B2E',
        bg4:    '#1E2238',
        border: '#2A2F4A',
        accent: '#6366F1',
        accent2:'#818CF8',
        text:   '#E8EAF6',
        text2:  '#9BA3C4',
        text3:  '#5A6182',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
