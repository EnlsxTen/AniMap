/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Vibrant 设计系统主色板
        primary: {
          DEFAULT: '#059669', // 翠绿
          50:  '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },
        action: {
          DEFAULT: '#F97316', // CTA 橙
          50:  '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
        },
        ink: {
          DEFAULT: '#064E3B', // 文字深绿黑
          soft: '#065F46',
          muted: '#475569',
        },
        // 块布局额外强调色（vibrant）
        pop: {
          pink:    '#EC4899',
          yellow:  '#FACC15',
          purple:  '#8B5CF6',
          cyan:    '#06B6D4',
          rose:    '#F43F5E',
        },
        // 暗色模式背景层级
        night: {
          50:  '#1A1F2E',
          100: '#161A26',
          200: '#11141E',
          300: '#0C0F17',
          400: '#080A10',
        },
      },
      fontFamily: {
        display: ['Alibaba PuHuiTi', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        sans:    ['Alibaba PuHuiTi', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        cn:      ['Alibaba PuHuiTi', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
      boxShadow: {
        'block':       '6px 6px 0 0 rgba(6, 78, 59, 1)',
        'block-sm':    '4px 4px 0 0 rgba(6, 78, 59, 1)',
        'block-lg':    '8px 8px 0 0 rgba(6, 78, 59, 1)',
        'block-action':'6px 6px 0 0 rgba(194, 65, 12, 1)',
        'block-dark':  '6px 6px 0 0 rgba(0, 0, 0, 0.7)',
        'pop':         '0 10px 30px -10px rgba(5, 150, 105, 0.4)',
        'pop-action':  '0 10px 30px -10px rgba(249, 115, 22, 0.5)',
        'card':        '0 4px 20px rgba(6, 78, 59, 0.06)',
        'card-hover':  '0 16px 40px rgba(5, 150, 105, 0.18)',
        'glow-primary':'0 0 28px rgba(5, 150, 105, 0.45)',
        'glow-action': '0 0 28px rgba(249, 115, 22, 0.5)',
      },
      backgroundImage: {
        'grid-light': 'linear-gradient(to right, rgba(5, 150, 105, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(5, 150, 105, 0.08) 1px, transparent 1px)',
        'grid-dark':  'linear-gradient(to right, rgba(52, 211, 153, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(52, 211, 153, 0.08) 1px, transparent 1px)',
        'dots-light': 'radial-gradient(rgba(5, 150, 105, 0.15) 1.5px, transparent 1.5px)',
        'gradient-vibrant': 'linear-gradient(135deg, #059669 0%, #10B981 50%, #F97316 100%)',
        'gradient-action':  'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
        'gradient-primary': 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        'gradient-hero':    'linear-gradient(-45deg, #059669, #10B981, #34D399, #F97316)',
      },
      backgroundSize: {
        'grid-md': '32px 32px',
        'grid-lg': '48px 48px',
        'dots-md': '20px 20px',
      },
      borderWidth: {
        '3': '3px',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-10px)' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%':      { transform: 'translateY(-18px) rotate(4deg)' },
        },
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-right': {
          '0%':   { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        'gradient-shift': {
          '0%':   { backgroundPosition: '0% 50%' },
          '50%':  { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'bounce-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
        'pulse-ring': {
          '0%':   { transform: 'scale(0.95)', opacity: '0.7' },
          '100%': { transform: 'scale(1.4)',  opacity: '0' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'spin-slow': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'float':           'float 4s ease-in-out infinite',
        'float-slow':      'float-slow 7s ease-in-out infinite',
        'fade-in-up':      'fadeInUp 0.5s ease-out forwards',
        'fade-in':         'fadeIn 0.4s ease-out forwards',
        'slide-in-right':  'slide-in-right 0.3s ease-out',
        'gradient-shift':  'gradient-shift 12s ease infinite',
        'bounce-soft':     'bounce-soft 2.4s ease-in-out infinite',
        'pulse-ring':      'pulse-ring 1.6s cubic-bezier(0.215, 0.61, 0.355, 1) infinite',
        'shimmer':         'shimmer 2.4s linear infinite',
        'spin-slow':       'spin-slow 8s linear infinite',
      },
    },
  },
  plugins: [],
}
