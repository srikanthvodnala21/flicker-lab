import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// On GitHub Pages the site lives at /<repo>/; locally it is served from /.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/flicker-lab/' : '/',
  plugins: [react()],
  server: { port: 5173, host: true },
  build: { chunkSizeWarningLimit: 800 },
});
