import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: 'dist-electron',
    emptyOutDir: false,
    lib: {
      entry: {
        main: resolve(__dirname, 'electron/main.ts'),
        preload: resolve(__dirname, 'electron/preload.ts'),
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['electron', 'path', 'fs', 'http', 'https', 'url', 'os', 'crypto', 'adm-zip'],
      output: {
        entryFileNames: '[name].cjs',
      },
    },
    minify: false,
    sourcemap: true,
    target: 'node18',
  },
})
