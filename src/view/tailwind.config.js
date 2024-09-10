/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				// 主题颜色变量
				primary: {
					DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
					light: 'rgb(var(--color-primary-light) / <alpha-value>)',
					dark: 'rgb(var(--color-primary-dark) / <alpha-value>)',
				},
				background: {
					DEFAULT: 'rgb(var(--color-background) / <alpha-value>)',
					secondary: 'rgb(var(--color-background-secondary) / <alpha-value>)',
					tertiary: 'rgb(var(--color-background-tertiary) / <alpha-value>)',
				},
				text: {
					DEFAULT: 'rgb(var(--color-text) / <alpha-value>)',
					secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
					tertiary: 'rgb(var(--color-text-tertiary) / <alpha-value>)',
				},
				border: {
					DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
					light: 'rgb(var(--color-border-light) / <alpha-value>)',
					dark: 'rgb(var(--color-border-dark) / <alpha-value>)',
				},
			},
		},
	},
	plugins: [],
};

