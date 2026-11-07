import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    // Live Qvalia mode: forward to the backend proxy (npm run proxy)
    proxy: { '/api/qvalia': 'http://localhost:8787' },
  },
});
