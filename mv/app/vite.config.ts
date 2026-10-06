import { defineConfig } from 'vite';

export default defineConfig({
  server: { fs: { allow: ['..'] }, hmr: process.env.MV_NO_HMR ? false : undefined },
  clearScreen: false,
});
