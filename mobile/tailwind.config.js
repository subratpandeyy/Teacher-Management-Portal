/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        surface: '#FFFFFF',
        canvas: '#F8FAFC',
        accent: {
          green: {
            50: '#DCFCE7',
            100: '#BBF7D0',
            200: '#86EFAC',
            500: '#22C55E',
            600: '#16A34A',
            700: '#15803D',
          },
          blue: {
            50: '#DBEAFE',
            100: '#BFDBFE',
            200: '#93C5FD',
            500: '#3B82F6',
            600: '#2563EB',
            700: '#1D4ED8',
          },
        },
        brand: {
          50: '#DBEAFE',
          100: '#BFDBFE',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
        },
      },
      borderRadius: {
        card: '14px',
        xl: '16px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        header: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        elevated: '0 4px 14px -2px rgb(0 0 0 / 0.08)',
      },
      fontSize: {
        'display-sm': ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
        'title': ['1.125rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        'body': ['0.9375rem', { lineHeight: '1.5rem' }],
        'caption': ['0.75rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
};
