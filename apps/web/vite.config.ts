import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies the API and WebSocket so the app can be previewed
// from any host (including the sandbox preview domain) without CORS issues.
export default defineConfig({
  plugins: [react()],
  // This app is one workspace member of a monorepo, so its root is `apps/web`. Without `envDir`
  // Vite looks for `.env*` there and never sees the repository-root `.env.local` that the API
  // reads — which silently produced builds with no Supabase configuration at all, and Vite then
  // dropped the Supabase SDK as dead code. Point it at the repository root so both halves read the
  // same file. (Runtime config now comes from /api/meta/config, so this is defence in depth.)
  envDir: '../../',
  // Only VITE_-prefixed keys may reach client code.
  envPrefix: 'VITE_',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:4000', ws: true },
      '/uploads': { target: 'http://127.0.0.1:4000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1200 },
});
