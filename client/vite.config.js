// Vite config: React + Tailwind plugins, and a dev proxy so /api calls go to the Express server.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin requests in dev mean the refresh cookie just works (no CORS cookie issues)
    proxy: { '/api': 'http://localhost:5000' },
  },
});
