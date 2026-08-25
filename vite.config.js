import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Cambia con il nome del tuo repository GitHub per il deploy su GitHub Pages
  base: "/Demo-turni/",
})
