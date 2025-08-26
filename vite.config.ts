import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy serverless function during `vercel dev`
      '/api/analyze-image': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})
