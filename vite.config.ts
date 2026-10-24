import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Ollama local (embeddings da busca de rounds) — evita CORS
      '/ollama': { target: 'http://localhost:11434', changeOrigin: true, rewrite: (p) => p.replace(/^\/ollama/, '') },
      // Serviço de busca VODs (127.0.0.1:8765)
      '/vodapi': { target: 'http://127.0.0.1:8765', changeOrigin: true, rewrite: (p) => p.replace(/^\/vodapi/, '') },
    },
  },
})
