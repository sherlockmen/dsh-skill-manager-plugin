import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite owns only the Browser face. The production script wraps its CommonJS
 * output in Harness' lazy ModuleLoader factory; Host remains an ESM build.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: 'src/client/index.tsx',
      formats: ['cjs'],
      fileName: () => 'client.cjs',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    },
  },
  server: {
    port: 4174,
    strictPort: false,
  },
})
