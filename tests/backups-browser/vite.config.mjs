import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({ cacheDir: 'node_modules/.vite-seiko-backup-smoke', optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] }, plugins: [react()], resolve: { alias: { 'next/link': fileURLToPath(new URL('./link.tsx', import.meta.url)) } }, server: { host: '127.0.0.1', port: 5183, strictPort: true } });
