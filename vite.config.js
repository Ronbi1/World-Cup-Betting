import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // All /server/* requests are forwarded to the Express backend.
      // Express handles both app routes (/auth, /users, /predictions)
      // and the football API proxy (/football/*).
      '/server': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/server/, ''),
      },
    },
  },
});
