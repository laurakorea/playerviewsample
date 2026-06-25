import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages는 /playerviewsample/ 하위 경로, Vercel은 루트(/)로 서빙
const base = process.env.VERCEL ? '/' : '/playerviewsample/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base,
  build: { outDir: 'docs' },
})
