import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = process.env.CIVICPULSE_API || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': api, '/uploads': api },
  },
});
