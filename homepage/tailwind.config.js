/** Design tokens – colours, fonts, radii (kept in one place). */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#0F4C45', 600: '#16655c', 50: '#E7F1EE' },
        accent: { DEFAULT: '#E8A317', 600: '#CF8F0B', ink: '#2a1c00' },
        mint: '#F3F7F5',
        ink: '#1C2B29',
        muted: '#4c5e5b',
        line: '#d6e3df',
        danger: { DEFAULT: '#b3261e', 50: '#FDECEA' },
        success: { DEFAULT: '#1e7a46', 50: '#E6F4EC' },
      },
      fontFamily: {
        display: ['var(--font-fredoka)', 'system-ui', 'sans-serif'],
        body: ['var(--font-atkinson)', 'system-ui', 'sans-serif'],
        tamil: ['var(--font-baloo-thambi)', 'Nirmala UI', 'Latha', 'sans-serif'],
      },
      borderRadius: {
        card: '18px',
        btn: '14px',
        field: '12px',
        pill: '999px',
      },
      boxShadow: {
        card: '0 2px 10px rgba(15, 76, 69, 0.08)',
        lift: '0 8px 24px rgba(15, 76, 69, 0.16)',
      },
    },
  },
  plugins: [],
};
