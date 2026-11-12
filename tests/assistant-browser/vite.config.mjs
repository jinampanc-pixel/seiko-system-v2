import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ root: 'tests/assistant-browser', plugins: [react()], server: { host: '127.0.0.1', port: 5183, strictPort: true }, cacheDir: '../../node_modules/.vite-assistant-test' });
