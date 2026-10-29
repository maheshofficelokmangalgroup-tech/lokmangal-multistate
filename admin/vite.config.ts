import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development the admin talks to the Rust API through this proxy, so cookies stay same-origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: process.env.API_URL ?? 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
