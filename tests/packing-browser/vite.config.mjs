import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from 'node:url';
// Prebundle the full React graph once; cold-start discovery must not replace shared exports mid-load.
export default defineConfig({ cacheDir: 'node_modules/.vite-seiko-packing-smoke', optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'] }, plugins:[react()], resolve: { alias: { 'next/navigation': fileURLToPath(new URL('./navigation.ts', import.meta.url)) } }, server:{host:"127.0.0.1",port:5176,strictPort:true} });
