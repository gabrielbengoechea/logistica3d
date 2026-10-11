import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base relativa: la build funciona igual en GitHub Pages (subcarpeta) que en cualquier hosting estático.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
