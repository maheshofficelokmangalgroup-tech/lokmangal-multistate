/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#C2410C',
          primary: '#C2410C',
          hover: '#9A3412',
          accent: '#EA580C',
          soft: '#FFF7ED',
        },
        canvas: '#F7F8FA',
        surface: '#FFFFFF',
        text: {
          primary: '#18181B',
          secondary: '#52525B',
        },
        border: {
          DEFAULT: '#E4E4E7',
          subtle: '#F4F4F5',
        },
        status: {
          success: '#166534',
          warning: '#92400E',
          destructive: '#B91C1C',
          neutral: '#52525B',
        },
      },
      fontFamily: {
        sans: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        marathi: ['Mukta', 'Poppins', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        dropdown: '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.07)',
      },
      borderRadius: {
        panel: '10px',
        control: '8px',
      },
    },
  },
  plugins: [],
};
