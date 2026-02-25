import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // All /api/v1/* calls are proxied to the football-data.org API.
      // When you add your own Express server later, change the target to
      // 'http://localhost:5000' and remove the rewrite + headers – that's
      // the only change needed in the entire codebase.
      '/api/v1': {
        target: 'https://api.football-data.org/v4',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/v1/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader(
              'X-Auth-Token',
              process.env.VITE_FOOTBALL_API_TOKEN || '240b9c89e7f74ef39d658143568f4311'
            );
          });
        },
      },
    },
  },
});
