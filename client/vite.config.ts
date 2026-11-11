import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Pages are lazy (App.tsx); these libraries load only with the page / download that needs them. Named chunks so
        // the build output reads, and xlsx-js-style's code-page tables split off its core (each part < 500 kB).
        manualChunks(id) {
          // Rollup's CommonJS helpers are used by many libraries. Without their own chunk they landed inside
          // xlsx-style-codepages, so EVERY page downloaded that 433 kB file (found 11 Nov 2026).
          if (id.includes('commonjsHelpers')) return 'cjs-helpers';
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('xlsx-js-style/dist/cpexcel')) return 'xlsx-style-codepages';
          if (id.includes('xlsx-js-style')) return 'xlsx-style';
          if (id.includes('file-saver')) return 'file-saver';
          return undefined;
        },
      },
    },
  }
})
