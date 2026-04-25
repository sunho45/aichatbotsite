import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '192.168.219.120',
    port: 5173,
    proxy: {
      '/api': 'http://192.168.219.120:3000',
    },
  },
})
