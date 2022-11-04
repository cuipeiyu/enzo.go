import { resolve } from 'path';
import { defineConfig, LibraryOptions } from 'vite';
import { InputOption } from 'rollup';

type LibTypes = 'core' | 'plugin:sessions';

const build = (process.env.BUILD as LibTypes) ?? 'core';

const makelib = () => ({
  'core': {
    entry: resolve(__dirname, 'src/index.ts'),
    name: 'Enzo',
    formats: ['es', 'iife', 'umd'],
    fileName: (format) => `index.${format}.js`,
  },
  'plugin:sessions': {
    entry: resolve(__dirname, 'src/plugins/sessions/index.ts'),
    name: 'EnzoSessions',
    formats: ['es', 'iife', 'umd'],
    fileName: (format) => `plugins/sessions/index.${format}.js`,
  },
}[build] as LibraryOptions);

const makeinput = () => ({
  'core': {
    'index': resolve(__dirname, 'src/index'),
  },
  'plugin:sessions': {
    'plugins/sessions/index': resolve(__dirname, 'src/plugins/sessions/index'),
  },
}[build] as InputOption);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
  ],
  resolve: {
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
    },
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  build: {
    emptyOutDir: build === 'core',
    target: 'esnext',
    lib: makelib(),
    minify: 'esbuild',
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: [],
      input: makeinput(),
      output: {
        dir: 'dist',
        exports: 'named',
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
        },
      },
    },
  },
});
