import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      // Split the vendor libraries out of the app chunk. React + motion +
      // recharts in one ~900 kB file means a phone on venue wifi parses all of
      // it before the hub renders; separate chunks let the hub paint while the
      // admin-only chart code is still downloading.
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            motion: ['motion'],
            charts: ['recharts'],
            icons: ['lucide-react'],
          },
        },
      },
      chunkSizeWarningLimit: 900,
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'motion/react', 'lucide-react', 'sonner'],
    },
    server: {
      host: '0.0.0.0',
      allowedHosts: process.env.CUSTOM_DOMAIN ? [process.env.CUSTOM_DOMAIN] : undefined,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Vite transforms a module the first time it is requested. Warming the
      // biggest client entries at boot means the first guest to load the page
      // isn't the one paying for that transform.
      warmup: {
        clientFiles: [
          './src/App.tsx',
          './src/components/GuestPanel.tsx',
          './src/components/LiveAlbum.tsx',
          './src/components/GiftPage.tsx',
        ],
      },
    },
  };
});
