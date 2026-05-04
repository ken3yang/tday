import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const bundleWorkspace = { exclude: ['@tday/shared', '@tday/adapter-pi'] };
const desktopNodeModules = resolve(__dirname, 'node_modules');
const reactEntry = resolve(desktopNodeModules, 'react');
const reactDomEntry = resolve(desktopNodeModules, 'react-dom');

// Read the desktop app's version once at build time so the renderer can
// display it without a runtime IPC round-trip.
const pkgVersion = (
  JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }
).version;

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(bundleWorkspace)],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin(bundleWorkspace)],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkgVersion),
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        react: reactEntry,
        'react-dom': reactDomEntry,
        'react/jsx-runtime': resolve(reactEntry, 'jsx-runtime.js'),
        'react/jsx-dev-runtime': resolve(reactEntry, 'jsx-dev-runtime.js'),
      },
    },
  },
});
