import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { changelogPlugin } from './plugins/changelog';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [tailwindcss(), react(), changelogPlugin(path.resolve(__dirname, '..'))],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      'import.meta.env.VITE_SERVER_URL': JSON.stringify(
        env.VITE_SERVER_URL || 'https://api-voice.flare-labs.tech',
      ),
      'import.meta.env.PROD': 'true',
    },
    build: {
      outDir: 'dist',
    },
    server: {
      port: 5173,
      allowedHosts: ['voice.flare-labs.tech'],
    },
  };
});
